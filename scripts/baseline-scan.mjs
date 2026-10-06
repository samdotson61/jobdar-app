// Jobdar — the baseline scan. Looks at EVERY employer board in the shipped catalog
// (data/seed/employers.yml), unfiltered — no level, no region, no user profile — and folds what it
// saw into the board ledger (lib/board_ledger_pure.mjs). Run daily by .github/workflows/
// baseline-scan.yml, which stores the result on the `baseline-data` branch.
//
// Why it exists: an employer's hiring behaviour can only be read from history, and history cannot be
// back-filled. A new user has none; this gives every install months of it. Data flows one way —
// public boards → this file set → users. Nothing about any user is involved or collected.
//
//   node scripts/baseline-scan.mjs --out <dir> [--company <substr>] [--limit <n>] [--date YYYY-MM-DD]
//
// Writes <dir>/ledger.tsv (one row per posting ever seen), <dir>/boards.tsv (last complete look per
// board) and <dir>/runs.tsv (per-board log, one line a day). Exits 1 only when no board could be read.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { parseFlags } from '../lib/cli.mjs'
import { loadEmployers, toPortals } from '../lib/seed.mjs'
import { resolveProvider } from '../providers/_contract.mjs'
import { LEDGER_COLS, BOARD_COLS, RUN_COLS, parseTsv, serializeTsv, advanceLedger, mergeRuns } from '../lib/board_ledger_pure.mjs'

const BOARD_TIMEOUT_MS = 45 * 60 * 1000 // Lowe's is ~12,700 postings = ~640 pages; Kohl's ~1,100 store partitions
// The baseline reads a board WHOLE (1.68.0): a tenant that reports its true total pages to any depth
// (Lowe's, 12,661); one that caps the report at 2,000 wraps past it and is read in facet partitions
// instead (ctx.partition). 1,250 pages = a 25,000-posting safety bound per read.
const BASELINE_MAX_PAGES = 1250
const POOL = 4 // same overlap as scan.mjs — different employers' boards only

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${Math.round(ms / 1000)}s`)), ms).unref())])

const readTsv = (file, cols) => (existsSync(file) ? parseTsv(readFileSync(file, 'utf8'), cols) : [])

const { flags } = parseFlags(process.argv.slice(2))
if (typeof flags.out !== 'string' || !flags.out) {
  console.error('usage: node scripts/baseline-scan.mjs --out <dir> [--company <substr>] [--limit <n>] [--date YYYY-MM-DD]')
  process.exit(2)
}
const outDir = path.resolve(flags.out)
const date = typeof flags.date === 'string' ? flags.date : new Date().toISOString().slice(0, 10)

let portals = toPortals(loadEmployers())
if (typeof flags.company === 'string') portals = portals.filter((p) => (p.company || '').toLowerCase().includes(flags.company.toLowerCase()))
if (Number(flags.limit) > 0) portals = portals.slice(0, Number(flags.limit))
// One board = one careers URL; a catalog that lists the same URL twice is looked at once.
portals = [...new Map(portals.map((p) => [p.careers_url, p])).values()]

console.log(`baseline scan ${date}: ${portals.length} board(s)`)
const observations = []
const queue = portals.slice()
const scanOne = async (portal) => {
  const hit = resolveProvider(portal)
  const base = { board: portal.careers_url, employer: portal.company || '', provider: hit ? hit.provider.id : '' }
  if (!hit) {
    observations.push({ ...base, ok: false, jobs: [], error: 'no provider' })
    console.log(`  FAIL ${portal.company}: no provider`)
    return
  }
  try {
    const jobs = await withTimeout(hit.provider.fetch(hit.match, { render: false, lang: 'en', maxPages: BASELINE_MAX_PAGES, partition: true }), BOARD_TIMEOUT_MS)
    const list = Array.isArray(jobs) ? jobs : []
    observations.push({ ...base, ok: true, incomplete: Boolean(list.incomplete), jobs: list })
    console.log(`  ok   ${portal.company}: ${list.length}${list.partitions ? ` (in ${list.partitions} partitions)` : ''}${list.incomplete ? ' (not read to the end)' : ''}`)
  } catch (err) {
    observations.push({ ...base, ok: false, jobs: [], error: String((err && err.message) || err) })
    console.log(`  FAIL ${portal.company}: ${String((err && err.message) || err).slice(0, 160)}`)
  }
}
await Promise.all(Array.from({ length: Math.min(POOL, queue.length) }, async () => {
  while (queue.length) await scanOne(queue.shift())
}))

const ledgerFile = path.join(outDir, 'ledger.tsv')
const boardsFile = path.join(outDir, 'boards.tsv')
const runsFile = path.join(outDir, 'runs.tsv')
const next = advanceLedger({ rows: readTsv(ledgerFile, LEDGER_COLS), boards: readTsv(boardsFile, BOARD_COLS) }, observations, date)
// Stable order, so the stored files differ day to day only where the boards did.
next.rows.sort((a, b) => a.board.localeCompare(b.board) || a.first_seen.localeCompare(b.first_seen) || a.url.localeCompare(b.url))
next.boards.sort((a, b) => a.board.localeCompare(b.board))

mkdirSync(outDir, { recursive: true })
writeFileSync(ledgerFile, serializeTsv(next.rows, LEDGER_COLS))
writeFileSync(boardsFile, serializeTsv(next.boards, BOARD_COLS))
writeFileSync(runsFile, serializeTsv(mergeRuns(readTsv(runsFile, RUN_COLS), next.runs), RUN_COLS))

const t = next.totals
console.log(`boards: ${t.ok} complete, ${t.partial} partial, ${t.failed} failed`)
console.log(`postings: ${next.rows.length} in ledger (+${t.added} new, ${t.closed} closed, ${t.reopened} reopened)`)
process.exit(observations.length > 0 && t.ok + t.partial === 0 ? 1 : 0)
