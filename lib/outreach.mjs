// Jobdar — outreach ledger (the fs shell). The referral lever's rules/links/lint/drafting are PURE and
// live in ./outreach_pure.mjs (re-exported here unchanged — Phase 10 split so the apps bundle them);
// this module owns the on-disk cadence ledger (data/outreach.tsv).
// Privacy: the ledger stores name/title/channel/date ONLY. Pasted profile text is for the draft in
// front of you and is never written to disk (modes/outreach.md carries the same rule for the model).

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths, atomicWrite } from './config.mjs'
import { OUTREACH_COLS } from './outreach_pure.mjs'

export * from './outreach_pure.mjs'

const FILE = path.join(paths.dataDir, 'outreach.tsv')

export function readOutreach() {
  if (!existsSync(FILE)) return []
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return []
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row = {}
    header.forEach((h, i) => (row[h] = cells[i] ?? ''))
    for (const c of OUTREACH_COLS) if (!(c in row)) row[c] = ''
    return row
  })
}

export function appendOutreach(entry) {
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ')
  mkdirSync(paths.dataDir, { recursive: true })
  const rows = [...readOutreach(), entry]
  const out = [OUTREACH_COLS.join('\t'), ...rows.map((r) => OUTREACH_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n'
  atomicWrite(FILE, out)
  return entry
}
