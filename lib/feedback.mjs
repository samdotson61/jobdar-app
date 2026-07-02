// Jobdar — eval feedback ledger (the calibration-data collector). A thumbs-up/down on a verdict in the
// Apply tab is appended here (data/eval_feedback.tsv), building a LOCAL labeled set that `jobdar calibrate
// --feedback` reads to report the evaluator's real agreement rate + which roles it got wrong. This is how
// the band thresholds get recalibrated FROM DATA instead of guessed. Local + private, like the outreach
// ledger — the file never leaves the machine.

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths, atomicWrite } from './config.mjs'

const FILE = path.join(paths.dataDir, 'eval_feedback.tsv')
export const FEEDBACK_COLS = ['url', 'company', 'role', 'score', 'band', 'thumb', 'date']

export function readFeedback() {
  if (!existsSync(FILE)) return []
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return []
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row = {}
    header.forEach((h, i) => (row[h] = cells[i] ?? ''))
    for (const c of FEEDBACK_COLS) if (!(c in row)) row[c] = ''
    return row
  })
}

// Append (or replace the latest thumb for a url) — one row per (url, latest thumb). Pure-ish (fs write).
export function appendFeedback(entry) {
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ')
  mkdirSync(paths.dataDir, { recursive: true })
  // De-dup by url: keep only the most recent thumb per role (a user can change their mind).
  const kept = readFeedback().filter((r) => r.url !== entry.url)
  const rows = [...kept, entry]
  const out = [FEEDBACK_COLS.join('\t'), ...rows.map((r) => FEEDBACK_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n'
  atomicWrite(FILE, out)
  return entry
}

// Agreement stats: a thumb-up means the model's verdict was right, thumb-down means it was wrong.
export function feedbackStats(rows = readFeedback()) {
  const up = rows.filter((r) => r.thumb === 'up').length
  const down = rows.filter((r) => r.thumb === 'down').length
  const n = up + down
  return { n, up, down, agreement: n ? Math.round((up / n) * 100) : 0, disagreements: rows.filter((r) => r.thumb === 'down') }
}
