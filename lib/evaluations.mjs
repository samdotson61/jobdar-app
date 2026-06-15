// Jobdar — the pipeline store (career-ops "one row per job"). The split that matters:
//   • `scan` writes DISCOVERED roles here with status `scanned` and NO score — the deterministic tool
//     only finds and filters roles, it does not judge fit.
//   • the model's `eval` records its verdict (fit score 0.0–5.0 + band + one-line recommendation) via
//     `jobdar eval --save`, flipping a row to status `evaluated`.
//   • the human's actions advance status further (applied, interviewing, …) via `jobdar tracker --set`
//     or the TUI's `a` key — the tracker is a VIEW over this store, not a second file.
// Each row also keeps `posted` (the board's posting date) and `first_seen` (when scan first found it),
// so fresh roles can be surfaced and stale ones pruned. TSV lives under the gitignored data/ dir.

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths, atomicWrite } from './config.mjs'
import { canonicalLocation } from './regions.mjs'

const FILE = path.join(paths.dataDir, 'pipeline.tsv')
// `prescreen` (0–100) + `screen_reason` + `pay` are written by `jobdar prescreen` (lib/prescreen.mjs):
// the zero-token gate that ranks the eval queue, screens hard-gated roles (reason kept on the row so
// nothing is hidden), and annotates the STATED pay band (lib/salary.mjs). `aliases` holds the URLs of
// near-duplicate postings collapsed into this survivor row (7.8.3). Older pipeline files read fine
// (missing cols → '').
export const PIPELINE_COLS = ['company', 'role', 'url', 'location', 'score', 'band', 'recommendation', 'status', 'posted', 'first_seen', 'updated', 'prescreen', 'screen_reason', 'pay', 'aliases']

// Survivor precedence when a near-duplicate collapses: tracked > evaluated > earliest first_seen.
const survivorRank = (r) => (isTracked(r) ? 2 : isEvaluated(r) ? 1 : 0)

// Coarse identity for near-duplicate collapse: normalized company + title + canonical metro.
export function roleKey(company, role, location) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  return `${norm(company)}|${norm(role)}|${canonicalLocation(location)}`
}

// Resolve a posting URL to its survivor row's URL if it was collapsed as an alias; else return it
// unchanged. recordEval/recordPrescreen/setStatus call this so a write to an absorbed URL lands on
// the survivor, never resurrecting the duplicate.
export function resolveAlias(rows, url) {
  for (const r of rows || []) {
    if (r.url === url) return url
    const aliases = String(r.aliases || '').split(',').map((s) => s.trim())
    if (aliases.includes(url)) return r.url
  }
  return url
}

// Score → band thresholds live in the pure ./bands.mjs (Phase 9.0 — so the engine bundles into the apps);
// re-exported here so existing importers (and `recordEval`'s band tagging below) keep working unchanged.
export { BANDS, band } from './bands.mjs'
import { band } from './bands.mjs'

// A row is "evaluated" once the model has scored it; until then it's just discovered.
export const isEvaluated = (row) => row && String(row.score || '').trim() !== '' && row.status !== 'scanned'

// A row is "tracked" once the human moved it past discovery/eval (applied, interviewing, offer, …).
export const isTracked = (row) => row && row.status && row.status !== 'scanned' && row.status !== 'evaluated'

// Read by HEADER NAME (robust to schema changes / older pipeline files — missing columns read as '').
export function readPipeline() {
  if (!existsSync(FILE)) return []
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return []
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row = {}
    header.forEach((h, i) => (row[h] = cells[i] ?? ''))
    for (const c of PIPELINE_COLS) if (!(c in row)) row[c] = ''
    return row
  })
}

export function serializePipeline(rows) {
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ')
  return [PIPELINE_COLS.join('\t'), ...rows.map((r) => PIPELINE_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n'
}

const isoDay = (v) => {
  const s = String(v == null ? '' : v)
  const m = s.match(/^\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

// Merge freshly DISCOVERED roles into existing rows (dedup). Two layers:
//   1. exact URL match → refresh identity (company/role/location/posted) only; never clobber a model
//      verdict or a tracked status (score/band/recommendation/status/first_seen are kept).
//   2. NEW url whose normalized company+title+canonical-location matches an existing row → collapse it
//      as an ALIAS on that survivor instead of creating a near-duplicate row (7.8.3). The survivor is
//      the best existing match (tracked > evaluated > earliest first_seen); the absorbed URL still
//      feeds `prune` and resolves to the survivor on write.
// Pure (arrays in/out; inputs never mutated — existing rows are cloned). `discovered` items are scan
// jobs: { company, title|role, url, location, postedOn? }.
export function mergeScanned(existing, discovered, dateStr) {
  const byUrl = new Map((existing || []).map((r) => [r.url, { ...r }]))
  const keyIndex = new Map()
  for (const r of byUrl.values()) {
    const k = roleKey(r.company, r.role, r.location)
    const cur = keyIndex.get(k)
    if (!cur || survivorRank(r) > survivorRank(cur) || (survivorRank(r) === survivorRank(cur) && String(r.first_seen || '') < String(cur.first_seen || ''))) {
      keyIndex.set(k, r)
    }
  }
  for (const j of discovered || []) {
    const url = j.url || ''
    const company = j.company || ''
    const role = j.title || j.role || ''
    const location = j.location || ''
    const prev = byUrl.get(url)
    if (prev) {
      prev.company = company || prev.company
      prev.role = role || prev.role
      prev.location = location || prev.location
      prev.posted = isoDay(j.postedOn) || prev.posted || ''
      prev.first_seen = prev.first_seen || dateStr
      continue
    }
    const k = roleKey(company, role, location)
    const survivor = url ? keyIndex.get(k) : null
    if (survivor) {
      const aliases = new Set(String(survivor.aliases || '').split(',').map((s) => s.trim()).filter(Boolean))
      aliases.add(url)
      survivor.aliases = [...aliases].join(',')
      continue
    }
    const fresh = {
      company, role, url, location,
      score: '', band: '', recommendation: '', status: 'scanned',
      posted: isoDay(j.postedOn), first_seen: dateStr, updated: dateStr,
      prescreen: '', screen_reason: '', pay: '', aliases: '',
    }
    byUrl.set(url, fresh)
    if (url) keyIndex.set(k, fresh) // a later dup in this same batch collapses into this row
  }
  return [...byUrl.values()]
}

// Record a model eval verdict onto a row (by URL), creating the row if eval ran on an un-scanned URL.
// Pure. `verdict` = { url, score, band?, recommendation?, company?, role?, location? }.
export function recordEval(existing, verdict, dateStr) {
  const url = resolveAlias(existing, verdict.url) // a verdict on an absorbed dup lands on the survivor
  const byUrl = new Map((existing || []).map((r) => [r.url, r]))
  const prev = byUrl.get(url) || { url, company: '', role: '', location: '', recommendation: '', posted: '', first_seen: dateStr }
  const score = Math.round(Number(verdict.score) * 10) / 10
  byUrl.set(url, {
    ...prev,
    // Discovery is authoritative for identity; eval fills company/role/location only for a URL it scored
    // that was never scanned (so the model can't accidentally relabel a discovered role).
    company: prev.company || verdict.company || '',
    role: prev.role || verdict.role || '',
    location: prev.location || verdict.location || '',
    score,
    band: verdict.band || band(score),
    recommendation: verdict.recommendation || prev.recommendation || '',
    // An eval refreshes the verdict but never demotes a human-tracked status (applied stays applied).
    status: isTracked(prev) ? prev.status : 'evaluated',
    updated: dateStr,
  })
  return [...byUrl.values()]
}

// Record a prescreen verdict onto a row (by URL). Pure; returns null if the URL isn't present —
// prescreen only annotates roles scan discovered, it never invents rows.
export function recordPrescreen(existing, url, { score, reason, pay }, dateStr) {
  const target = resolveAlias(existing, url)
  let hit = false
  const out = (existing || []).map((r) => {
    if (r.url !== target) return r
    hit = true
    return { ...r, prescreen: String(Math.round(Number(score) || 0)), screen_reason: reason || '', pay: pay == null ? r.pay || '' : pay, updated: dateStr }
  })
  return hit ? out : null
}

// The model's eval queue, prescreen-aware. Pending = not yet evaluated. Screened-out rows are
// EXCLUDED by default but never gone — includeScreened brings them back (the 4.5 honesty rule).
// Order: prescreen score desc (unscored rows sort below scored ones), then posted, then first_seen.
export function pendingQueue(rows, { includeScreened = false } = {}) {
  const pending = (rows || []).filter((r) => !isEvaluated(r) && r.url && !isTracked(r))
  const live = includeScreened ? pending : pending.filter((r) => !String(r.screen_reason || '').trim())
  const ps = (r) => (String(r.prescreen || '').trim() === '' ? -1 : Number(r.prescreen))
  return live.sort(
    (a, b) =>
      ps(b) - ps(a) ||
      String(b.posted || '').localeCompare(String(a.posted || '')) ||
      String(b.first_seen || '').localeCompare(String(a.first_seen || ''))
  )
}

// Advance a row's status (applied, interviewing, …) by URL. Pure; returns null if the URL isn't present.
export function setStatus(existing, url, status, dateStr) {
  const target = resolveAlias(existing, url)
  let hit = false
  const out = (existing || []).map((r) => {
    if (r.url !== target) return r
    hit = true
    return { ...r, status, updated: dateStr }
  })
  return hit ? out : null
}

// Drop stale DISCOVERED rows: status `scanned` whose URL no longer appears on any board this scan.
// Evaluated and tracked rows are always kept (your work is never pruned). Pure.
export function pruneScanned(existing, activeUrls) {
  const keep = []
  let pruned = 0
  for (const r of existing || []) {
    // A scanned row is still live if its own URL OR any absorbed alias appears on a board this scan.
    const urls = [r.url, ...String(r.aliases || '').split(',').map((s) => s.trim()).filter(Boolean)]
    if (r.status === 'scanned' && !urls.some((u) => activeUrls.has(u))) {
      pruned++
      continue
    }
    keep.push(r)
  }
  return { rows: keep, pruned }
}

function writePipeline(rows) {
  mkdirSync(paths.dataDir, { recursive: true })
  atomicWrite(FILE, serializePipeline(rows))
  return rows
}

export function upsertScanned(discovered, dateStr) {
  return writePipeline(mergeScanned(readPipeline(), discovered, dateStr))
}

export function upsertEval(verdict, dateStr) {
  return writePipeline(recordEval(readPipeline(), verdict, dateStr))
}

export function upsertPrescreen(url, verdict, dateStr) {
  const out = recordPrescreen(readPipeline(), url, verdict, dateStr)
  if (!out) return false
  writePipeline(out)
  return true
}

export function updateStatusByUrl(url, status, dateStr = new Date().toISOString().slice(0, 10)) {
  const out = setStatus(readPipeline(), url, status, dateStr)
  if (!out) return false
  writePipeline(out)
  return true
}

export function prunePipeline(activeUrls) {
  const { rows, pruned } = pruneScanned(readPipeline(), activeUrls)
  if (pruned > 0) writePipeline(rows)
  return pruned
}
