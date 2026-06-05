// Jobdar — the pipeline store (career-ops "one row per job"). The split that matters:
//   • `scan` writes DISCOVERED roles here with status `scanned` and NO score — the deterministic tool
//     only finds and filters roles, it does not judge fit.
//   • the model's `eval` records its verdict (fit score 0.0–5.0 + band + one-line recommendation) via
//     `jobdar eval --save`, flipping a row to status `evaluated`.
//   • `jobdar tui` shows scanned roles as "pending eval" until the model has actually scored them.
// TSV lives under the gitignored data/ dir.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths } from './config.mjs'

const FILE = path.join(paths.dataDir, 'pipeline.tsv')
export const PIPELINE_COLS = ['company', 'role', 'url', 'location', 'score', 'band', 'recommendation', 'status', 'updated']

// Score → band. The model evaluates on the career-ops 0.0–5.0 scale: ≥4.0 Apply, ≥3.5 Research, else Don't.
export const BANDS = { apply: 4.0, research: 3.5 }
export function band(score) {
  if (score === '' || score == null) return '' // no score yet → no band (Number('') is 0, so guard first)
  const n = Number(score)
  if (!Number.isFinite(n)) return ''
  if (n >= BANDS.apply) return 'apply'
  if (n >= BANDS.research) return 'research'
  return 'dont'
}

// A row is "evaluated" once the model has scored it; until then it's just discovered.
export const isEvaluated = (row) => row && row.status === 'evaluated' && String(row.score || '').trim() !== ''

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

// Merge freshly DISCOVERED roles into existing rows by URL (dedup). Never clobbers a model verdict: an
// already-evaluated row keeps its score/band/recommendation/status — only company/role/location refresh.
// Pure (arrays in/out) for testing. `discovered` items are scan jobs: { company, title|role, url, location }.
export function mergeScanned(existing, discovered, dateStr) {
  const byUrl = new Map((existing || []).map((r) => [r.url, r]))
  for (const j of discovered || []) {
    const prev = byUrl.get(j.url)
    if (prev) {
      byUrl.set(j.url, { ...prev, company: j.company || prev.company, role: j.title || j.role || prev.role, location: j.location || prev.location })
    } else {
      byUrl.set(j.url, {
        company: j.company || '', role: j.title || j.role || '', url: j.url || '', location: j.location || '',
        score: '', band: '', recommendation: '', status: 'scanned', updated: dateStr,
      })
    }
  }
  return [...byUrl.values()]
}

// Record a model eval verdict onto a row (by URL), creating the row if eval ran on an un-scanned URL.
// Pure. `verdict` = { url, score, band?, recommendation?, company?, role?, location? }.
export function recordEval(existing, verdict, dateStr) {
  const byUrl = new Map((existing || []).map((r) => [r.url, r]))
  const prev = byUrl.get(verdict.url) || { url: verdict.url, company: '', role: '', location: '', recommendation: '' }
  const score = Math.round(Number(verdict.score) * 10) / 10
  byUrl.set(verdict.url, {
    ...prev,
    // Discovery is authoritative for identity; eval fills company/role/location only for a URL it scored
    // that was never scanned (so the model can't accidentally relabel a discovered role).
    company: prev.company || verdict.company || '',
    role: prev.role || verdict.role || '',
    location: prev.location || verdict.location || '',
    score,
    band: verdict.band || band(score),
    recommendation: verdict.recommendation || prev.recommendation || '',
    status: 'evaluated',
    updated: dateStr,
  })
  return [...byUrl.values()]
}

export function upsertScanned(discovered, dateStr) {
  const merged = mergeScanned(readPipeline(), discovered, dateStr)
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(FILE, serializePipeline(merged))
  return merged
}

export function upsertEval(verdict, dateStr) {
  const merged = recordEval(readPipeline(), verdict, dateStr)
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(FILE, serializePipeline(merged))
  return merged
}
