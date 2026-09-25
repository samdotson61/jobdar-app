// Jobdar — `jobdar prescreen`. The zero-token apply-likelihood gate (lib/prescreen.mjs) between scan
// and the model's eval: fetches each pending role's JD (politely per host — sequential+spaced within
// a host, hosts in parallel lanes; `--serial` for one-at-a-time), screens hard gates
// (years required / active clearance / excluded degree) with QUOTED reasons, and ranks the rest by
// skill overlap + freshness so `eval --next` always serves the most winnable role first. Screened
// roles are never hidden: they print here with their reason and `eval --include-screened` re-admits
// them. No model, no score invention — fit judgment stays the model's job.

import { loadProfile, loadCv } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, upsertPrescreenMany, isEvaluated, isTracked } from '../evaluations.mjs'
import { prescreenRole, reasonLine } from '../prescreen.mjs'
import { paySummary } from '../salary.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { createRadar } from '../progress.mjs'
import { color, symbol, heading } from '../ui.mjs'

const PACE_MS = 800 // politeness: JD fetches to the SAME host stay sequential and spaced — same spirit as scan's pacing
const LANES = 8 // different hosts are independent — run up to this many host queues at once
const FLUSH_EVERY = 25 // persist verdicts to pipeline.tsv in batches so results land while the sweep runs
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const hostOf = (url) => {
  try { return new URL(url).hostname } catch { return url }
}

export async function runPrescreen(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  const today = new Date().toISOString().slice(0, 10)

  heading(t('prescreen.title'))

  const cv = loadCv()
  if (!cv.trim()) console.log(color.yellow(t('prescreen.no_cv')))

  const companyFilter = typeof flags.company === 'string' ? flags.company.toLowerCase() : null
  const limit = Number(flags.limit) > 0 ? Number(flags.limit) : Infinity
  const rescore = Boolean(flags.rescore)

  let rows = readPipeline().filter((r) => r.url && !isEvaluated(r) && !isTracked(r))
  if (companyFilter) rows = rows.filter((r) => (r.company || '').toLowerCase().includes(companyFilter))
  if (!rescore) rows = rows.filter((r) => String(r.prescreen || '').trim() === '')
  rows = rows.slice(0, limit)

  if (rows.length === 0) {
    console.log(color.dim(t('prescreen.none')))
    return { checked: 0, screened: 0 }
  }
  console.log(t('prescreen.checking', { count: rows.length }))

  // This loop used to run in silence — the radar sweep is the live feedback while JDs are fetched
  // and gates run. The ranked/screened detail still prints below once the whole batch is in.
  const radar = createRadar({
    total: rows.length,
    tallies: [
      { key: 'ranked', fmt: (n) => color.green(t('prescreen.tally_ranked', { count: n })) },
      { key: 'screened', fmt: (n) => color.yellow(t('prescreen.tally_screened', { count: n })) },
    ],
  })
  if (rows.length > 1) radar.start()

  // Batched by default: rows group into per-host queues (politeness is a per-host promise — PACE_MS
  // spacing within a queue), and up to LANES host queues run concurrently. `--serial` restores the
  // old one-at-a-time sweep. Verdicts flush to pipeline.tsv every FLUSH_EVERY completions, so a
  // long sweep populates results as it goes instead of only at the end.
  const lanes = flags.serial ? 1 : Math.max(1, Number(flags.lanes) > 0 ? Number(flags.lanes) : LANES)
  const queues = new Map()
  for (const row of rows) {
    const h = hostOf(row.url)
    if (!queues.has(h)) queues.set(h, [])
    queues.get(h).push(row)
  }
  const hostQueues = [...queues.values()]

  const ranked = []
  const screened = []
  let pendingWrites = []
  const flush = () => {
    if (!pendingWrites.length) return
    upsertPrescreenMany(pendingWrites, today)
    pendingWrites = []
  }

  const screenOne = async (row, firstInQueue) => {
    if (!firstInQueue) await sleep(PACE_MS)
    radar.label(`${row.company || row.url}${row.role ? ' — ' + row.role : ''}`)
    let jdText = ''
    try {
      const jd = await fetchJobDescription(row.url)
      jdText = (jd && jd.description) || ''
    } catch {
      jdText = '' // unreachable JD → neutral skills score below, never a screen
    }
    // title → the hard-identity field gate (accountant/nurse/attorney titles) — same input serve passes.
    const verdict = prescreenRole({ jdText, cvText: cv, title: row.role, posted: row.posted, firstSeen: row.first_seen, today, profile })
    const reason = verdict.screened ? reasonLine(verdict.reasons, t) : ''
    const pay = paySummary(verdict.pay, Number(profile.target_salary) || 0)
    const notes = verdict.sponsors ? 'sponsors-visa' : verdict.jdAvailable ? '' : undefined
    pendingWrites.push({ url: row.url, score: verdict.score, reason, pay, notes })
    if (pendingWrites.length >= FLUSH_EVERY) flush()
    const entry = { row, verdict, pay }
    if (verdict.screened) screened.push(entry)
    else ranked.push(entry)
    radar.tick(verdict.screened ? 'screened' : 'ranked')
  }

  // Lane workers: each pulls the next un-started host queue and drains it in order.
  let nextQueue = 0
  const worker = async () => {
    while (nextQueue < hostQueues.length) {
      const queue = hostQueues[nextQueue++]
      for (let i = 0; i < queue.length; i++) await screenOne(queue[i], i === 0)
    }
  }
  await Promise.all(Array.from({ length: Math.min(lanes, hostQueues.length) }, worker))
  flush()
  radar.stop()

  ranked.sort((a, b) => b.verdict.score - a.verdict.score)
  if (ranked.length) {
    console.log('\n' + color.bold(t('prescreen.ranked_header', { count: ranked.length })))
    for (const { row, verdict, pay } of ranked) {
      const marks = verdict.flags.map((f) => t(`prescreen.flag_${f.kind}`)).join(', ')
      const sponsors = verdict.sponsors ? t('prescreen.note_sponsors') : ''
      const tail = [verdict.jdAvailable ? '' : t('prescreen.jd_unavailable'), sponsors, marks].filter(Boolean).join(' · ')
      const payTag = pay ? color.dim(`  ${pay}`) : ''
      console.log(`  ${String(verdict.score).padStart(3)}  ${row.company} — ${row.role}${payTag}${tail ? color.dim(`  (${tail})`) : ''}`)
    }
  }
  if (screened.length) {
    console.log('\n' + color.bold(t('prescreen.screened_header', { count: screened.length })))
    for (const { row, verdict } of screened) {
      console.log(`  ${symbol.warn()} ${row.company} — ${row.role}`)
      console.log(`    ${color.dim(reasonLine(verdict.reasons, t))}`)
    }
    console.log(color.dim('  ' + t('prescreen.override_hint')))
  }
  console.log('\n' + t('prescreen.done', { ranked: ranked.length, screened: screened.length }))
  return { checked: rows.length, screened: screened.length, ranked: ranked.length }
}
