// Jobfaro — the pipeline store (career-ops "one row per job"). The split that matters:
//   • `scan` writes DISCOVERED roles here with status `scanned` and NO score — the deterministic tool
//     only finds and filters roles, it does not judge fit.
//   • the model's `eval` records its verdict (fit score 0.0–5.0 + band + one-line recommendation) via
//     `jobfaro eval --save`, flipping a row to status `evaluated`.
//   • the human's actions advance status further (applied, interviewing, …) via `jobfaro tracker --set`
//     or the TUI's `a` key — the tracker is a VIEW over this store, not a second file.
// Each row also keeps `posted` (the board's posting date) and `first_seen` (when scan first found it),
// so fresh roles can be surfaced and stale ones pruned. TSV lives under the gitignored data/ dir.
//
// Phase 10 split: ALL the pure logic (merge/dedup/record/queue/parse/serialize) lives in
// ./pipeline_pure.mjs so the native/web apps run the identical logic on their own Store; this module is
// the CLI's fs shell (readPipeline/writePipeline/upsert*) and re-exports the pure surface unchanged.

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths, atomicWrite } from './config.mjs'
import { parsePipeline, serializePipeline, mergeScanned, recordEval, recordPrescreen, setStatus, pruneScanned } from './pipeline_pure.mjs'

export * from './pipeline_pure.mjs'
// Score → band thresholds live in the pure ./bands.mjs (Phase 9.0 — so the engine bundles into the apps);
// re-exported here so existing importers (and recordEval's band tagging) keep working unchanged.
export { BANDS, band } from './bands.mjs'

const FILE = path.join(paths.dataDir, 'pipeline.tsv')

// Read by HEADER NAME (robust to schema changes / older pipeline files — missing columns read as '').
export function readPipeline() {
  if (!existsSync(FILE)) return []
  return parsePipeline(readFileSync(FILE, 'utf8'))
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

// Apply MANY prescreen verdicts in one read-modify-write (the per-row upsert re-read+rewrote the whole
// pipeline.tsv for every role — the dominant cost when prescreening a batch). Returns the count applied.
export function upsertPrescreenMany(updates, dateStr) {
  let rows = readPipeline()
  let n = 0
  for (const u of updates || []) {
    const out = recordPrescreen(rows, u.url, { score: u.score, reason: u.reason, pay: u.pay, notes: u.notes }, dateStr)
    if (out) { rows = out; n++ }
  }
  if (n) writePipeline(rows)
  return n
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
