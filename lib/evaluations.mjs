// Jobdar — the scored pipeline store (career-ops-style "one row per job"). `scan` writes scored
// roles here; `jobdar tui` reads and surfaces them. TSV under the gitignored data/ dir.
// Columns: company, role, url, location, the four 0–5 sub-scores, composite, band, status, updated.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths } from './config.mjs'

const FILE = path.join(paths.dataDir, 'pipeline.tsv')
export const PIPELINE_COLS = ['company', 'role', 'url', 'location', 's_resume', 's_location', 's_salary', 's_seniority', 'composite', 'band', 'status', 'updated']

export function readPipeline() {
  if (!existsSync(FILE)) return []
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return []
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row = {}
    PIPELINE_COLS.forEach((c, i) => (row[c] = cells[i] ?? ''))
    return row
  })
}

export function serializePipeline(rows) {
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ')
  return [PIPELINE_COLS.join('\t'), ...rows.map((r) => PIPELINE_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n'
}

// Merge scored jobs into existing rows by URL (dedup). Preserves a non-default status (e.g. applied).
// Pure — takes/returns arrays so it's unit-testable. `scored` items are { ...job, scores }.
export function mergeScored(existing, scored, dateStr) {
  const byUrl = new Map((existing || []).map((r) => [r.url, r]))
  for (const j of scored || []) {
    const s = j.scores || {}
    const prev = byUrl.get(j.url)
    byUrl.set(j.url, {
      company: j.company || '',
      role: j.title || j.role || '',
      url: j.url || '',
      location: j.location || '',
      s_resume: s.resume,
      s_location: s.location,
      s_salary: s.salary,
      s_seniority: s.seniority,
      composite: s.composite,
      band: s.band,
      status: prev && prev.status && prev.status !== 'scanned' ? prev.status : 'scanned',
      updated: dateStr,
    })
  }
  return [...byUrl.values()]
}

export function upsertScored(scored, dateStr) {
  const merged = mergeScored(readPipeline(), scored, dateStr)
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(FILE, serializePipeline(merged))
  return merged
}
