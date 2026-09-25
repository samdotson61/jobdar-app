// Jobdar — `jobdar feedback` (1.54.0). The CLI half of the calibration funnel. The app has had
// 👍/👎 thumbs since 1.43, but CLI-first users had NO way to label a verdict — which is why the
// feedback ledger sat at zero labels while the band thresholds stayed tuned on guesses (2026-08-28
// audit). One label per verdict: `jobdar feedback <url|company-or-role> --good|--bad`. Labels land
// in data/eval_feedback.tsv (local, never leaves the machine) and `jobdar calibrate --feedback`
// turns them into a real agreement rate.

import { loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, isEvaluated } from '../evaluations.mjs'
import { appendFeedback, feedbackStats } from '../feedback.mjs'
import { findRoleMatches } from './tailor.mjs'
import { color, heading } from '../ui.mjs'

// How many labels make `calibrate --feedback` worth running (the eval-tuning doc's N≥50 target is the
// full recalibration bar; agreement direction shows up well before that).
const USEFUL_N = 10

export async function runFeedback(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  heading(t('feedback.title'))

  const thumb = flags.good || flags.up ? 'up' : flags.bad || flags.down ? 'down' : ''
  const target = typeof flags.url === 'string' ? flags.url : positionals[0] || ''
  if (!thumb || !target) {
    console.error(t('feedback.usage'))
    process.exitCode = 1
    return { saved: false }
  }

  const rows = readPipeline()
  const isUrl = /^https?:\/\//i.test(target)
  const matches = findRoleMatches(rows, isUrl ? { url: target } : { query: target }).filter(isEvaluated)
  if (!matches.length) {
    console.log(color.yellow(t('feedback.none', { target })))
    console.log(color.dim('  ' + t('feedback.none_hint')))
    process.exitCode = 1
    return { saved: false }
  }
  if (matches.length > 1) {
    console.log(color.yellow(t('feedback.ambiguous', { count: matches.length, target })))
    for (const m of matches.slice(0, 5)) console.log(color.dim(`  · ${m.company} — ${m.role}  ${m.url}`))
    process.exitCode = 1
    return { saved: false }
  }

  const row = matches[0]
  appendFeedback({ url: row.url, company: row.company, role: row.role, score: row.score, band: row.band, thumb, date: new Date().toISOString().slice(0, 10) })
  const mark = thumb === 'up' ? color.green('👍') : color.yellow('👎')
  console.log(`  ${mark} ${t('feedback.saved', { role: row.role, company: row.company, score: row.score, band: t('bands.' + (row.band || 'dont')) })}`)

  const s = feedbackStats()
  console.log(color.dim('  ' + t('feedback.tally', { n: s.n, agreement: s.agreement })))
  if (s.n >= USEFUL_N) console.log(color.dim('  ' + t('feedback.calibrate_hint')))
  else console.log(color.dim('  ' + t('feedback.more_hint', { need: USEFUL_N - s.n })))
  return { saved: true, thumb, url: row.url, stats: s }
}
