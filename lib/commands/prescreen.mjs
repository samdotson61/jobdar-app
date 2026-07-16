// Jobfaro — `jobfaro prescreen`. The zero-token apply-likelihood gate (lib/prescreen.mjs) between scan
// and the model's eval: fetches each pending role's JD (politely, one at a time), screens hard gates
// (years required / active clearance / excluded degree) with QUOTED reasons, and ranks the rest by
// skill overlap + freshness so `eval --next` always serves the most winnable role first. Screened
// roles are never hidden: they print here with their reason and `eval --include-screened` re-admits
// them. No model, no score invention — fit judgment stays the model's job.

import { loadProfile, loadCv } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, upsertPrescreen, isEvaluated, isTracked } from '../evaluations.mjs'
import { prescreenRole, reasonLine } from '../prescreen.mjs'
import { paySummary } from '../salary.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { createRadar } from '../progress.mjs'
import { color, symbol, heading } from '../ui.mjs'

const PACE_MS = 800 // politeness: sequential JD fetches, spaced — same spirit as scan's pacing
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

  const ranked = []
  const screened = []
  let first = true
  for (const row of rows) {
    if (!first) await sleep(PACE_MS)
    first = false
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
    upsertPrescreen(row.url, { score: verdict.score, reason, pay, notes }, today)
    const entry = { row, verdict, pay }
    if (verdict.screened) screened.push(entry)
    else ranked.push(entry)
    radar.tick(verdict.screened ? 'screened' : 'ranked')
  }
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
