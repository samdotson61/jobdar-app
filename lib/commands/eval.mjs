// Jobdar — `jobdar eval`. Evaluation is the MODEL's job (career-ops: discover → evaluate → build); the
// deterministic CLI does not score fit. Two paths:
//   • Record:   `jobdar eval --save --url <u> --score <0.0–5.0> [--band ..] [--company ..] [--role ..] [--note ..]`
//               The model (run via your AI CLI on the rubric in modes/eval.md) calls this to persist its
//               verdict to the pipeline so it surfaces in `jobdar tui`. Band is derived from score if omitted.
//   • Guidance: `jobdar eval <url|->`  prints how to run the model-backed eval (no local model until Phase 8).
// Either way, the scanner never fabricates a score — only an actual evaluation writes one.

import { loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { upsertEval, band, readPipeline, isEvaluated } from '../evaluations.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { color, heading } from '../ui.mjs'

export async function runEval(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const lang = resolveLang(flags, loadProfile())
  const t = getT(lang)

  // --- Record path: the model persists its verdict here. ---
  if (flags.save || flags.record || flags.score != null) {
    const url = typeof flags.url === 'string' ? flags.url : positionals[0]
    const score = Number(flags.score)
    if (!url || !Number.isFinite(score)) {
      console.error(t('eval.save_usage'))
      process.exitCode = 1
      return { saved: false }
    }
    const clamped = Math.max(0, Math.min(5, score))
    const bnd = typeof flags.band === 'string' && ['apply', 'research', 'dont'].includes(flags.band) ? flags.band : band(clamped)
    const verdict = {
      url,
      score: clamped,
      band: bnd,
      company: typeof flags.company === 'string' ? flags.company : '',
      role: typeof flags.role === 'string' ? flags.role : '',
      location: typeof flags.location === 'string' ? flags.location : '',
      recommendation: typeof flags.note === 'string' ? flags.note : typeof flags.rec === 'string' ? flags.rec : '',
    }
    upsertEval(verdict, new Date().toISOString().slice(0, 10))
    heading(t('eval.title'))
    console.log(`  ${color.green('✓')} ${t('eval.saved', { role: verdict.role || url, score: clamped.toFixed(1), band: t('bands.' + bnd) })}`)
    return { saved: true, verdict }
  }

  // --- Guidance path: evaluation is model-backed. Fetch the role's JD (any provider) so the model can
  // score it without its own fetch tool — uniform across greenhouse / workday / icims. ---
  let url = typeof flags.url === 'string' ? flags.url : positionals[0]
  heading(t('eval.title'))

  // --next: pop the freshest pending (un-evaluated) role from the pipeline so the model loop is just
  // "eval --next → score → eval --save" with no URL copying. Freshness: posted desc, then first_seen.
  if (flags.next && !url) {
    const pending = readPipeline()
      .filter((r) => !isEvaluated(r) && r.url)
      .sort((a, b) => String(b.posted || '').localeCompare(String(a.posted || '')) || String(b.first_seen || '').localeCompare(String(a.first_seen || '')))
    if (!pending.length) {
      console.log(color.dim(t('eval.next_none')))
      return { saved: false }
    }
    const row = pending[0]
    url = row.url
    console.log(t('eval.next_for', { role: row.role, company: row.company, remaining: pending.length }))
    console.log(color.dim(`  ${url}\n`))
  }
  if (url) {
    try {
      const jd = await fetchJobDescription(url)
      if (jd && jd.description) {
        console.log(color.bold(t('eval.jd_for', { role: jd.title || url })))
        console.log('\n' + jd.description + '\n')
      } else {
        console.log(color.dim(t('eval.jd_none', { url })))
      }
    } catch (err) {
      console.log(color.dim(t('eval.jd_error', { error: err.message })))
    }
  }
  console.log(t('eval.model_needed'))
  console.log(color.dim('  ' + t('eval.save_hint')))
  return { saved: false }
}
