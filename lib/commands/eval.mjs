// Jobdar — `jobdar eval`. Evaluation is the MODEL's job (career-ops: discover → evaluate → build); the
// deterministic CLI does not score fit. Two paths:
//   • Record:   `jobdar eval --save --url <u> --score <0.0–5.0> [--band ..] [--company ..] [--role ..] [--note ..]`
//               The model (run via your AI CLI on the rubric in modes/eval.md) calls this to persist its
//               verdict to the pipeline so it surfaces in `jobdar tui`. Band is derived from score if omitted.
//   • Guidance: `jobdar eval <url|->`  prints how to run the model-backed eval (no local model until Phase 8).
// Either way, the scanner never fabricates a score — only an actual evaluation writes one.

import { loadProfile, loadCv } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { upsertEval, band, readPipeline, pendingQueue } from '../evaluations.mjs'
import { existsSync } from 'node:fs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { extractText, isExtractable } from '../docparse.mjs'
import { selectActive, submitBatch } from '../inference.mjs'
import { evalRole, preConfirm, isBorderline, prepEval, buildVerdict, evalSystemFor } from '../eval_engine.mjs'
import { clampLogEntry, logClamp, buildBatchRequests, parseBatchResults } from '../eval_ops.mjs'
import { color, heading } from '../ui.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 8c.3: a JD reference can be a URL (fetched via a provider) or a local file (PDF/DOCX/text, extracted
// on-device). Returns the provider Desc shape { title, description }.
async function getJd(ref) {
  if (ref && isExtractable(ref) && existsSync(ref)) {
    const d = extractText(ref)
    return { title: String(ref).split('/').pop(), description: d.error ? '' : d.text }
  }
  return fetchJobDescription(ref)
}

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

  // --- Auto path (8a): score roles automatically against the configured inference backend. ---
  if (flags.auto) return runAutoEval(flags, positionals, t)

  // --- Guidance path: evaluation is model-backed. Fetch the role's JD (any provider) so the model can
  // score it without its own fetch tool — uniform across greenhouse / workday / icims. ---
  let url = typeof flags.url === 'string' ? flags.url : positionals[0]
  heading(t('eval.title'))

  // --next: pop the BEST pending (un-evaluated) role from the pipeline so the model loop is just
  // "eval --next → score → eval --save" with no URL copying. Order is the prescreen-ranked queue
  // (likelihood score desc, then freshness); roles prescreen gated out stay excluded unless
  // --include-screened — they're never deleted, just demoted with their reason on the row.
  if (flags.next && !url) {
    const rows = readPipeline()
    const pending = pendingQueue(rows, { includeScreened: Boolean(flags['include-screened']) })
    if (!pending.length) {
      console.log(color.dim(t('eval.next_none')))
      const hidden = pendingQueue(rows, { includeScreened: true }).length
      if (hidden > 0) console.log(color.dim(t('eval.next_screened_hint', { count: hidden })))
      return { saved: false }
    }
    const row = pending[0]
    url = row.url
    console.log(t('eval.next_for', { role: row.role, company: row.company, remaining: pending.length }))
    if (String(row.screen_reason || '').trim()) console.log(color.dim('  ' + t('eval.next_screened_note', { reason: row.screen_reason })))
    console.log(color.dim(`  ${url}\n`))
  }
  if (url) {
    try {
      const jd = await getJd(url)
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
  console.log(color.dim(t('eval.today', { date: new Date().toISOString().slice(0, 10) })))
  console.log(t('eval.model_needed'))
  console.log(color.dim('  ' + t('eval.save_hint')))
  return { saved: false }
}

// `jobdar eval --auto [<url> | --next | --all-pending]` — score roles against the inference backend and
// record each verdict via the existing --save path. One JD per request; walks the prescreen-ranked queue.
async function runAutoEval(flags, positionals, t) {
  const profile = loadProfile()
  const cv = loadCv()
  const today = new Date().toISOString().slice(0, 10)
  const transferable = flags.transferable ? true : undefined // flag forces on; else profile.transferable_skills
  heading(t('eval.title'))

  const active = await selectActive(profile)
  if (!active.up) {
    console.log(color.yellow(t('eval.auto_backend_down', { reason: active.reason })))
    console.log(color.dim('  ' + t('backend.check_hint')))
    process.exitCode = 1
    return { evaluated: 0 }
  }

  const rows = readPipeline()
  // `eval --auto <url>` parses as flags.auto='<url>' (value-less flag eats the next token), so accept
  // a string-valued --auto as the URL too — alongside --url and a bare positional.
  const url = (typeof flags.auto === 'string' && flags.auto) || (typeof flags.url === 'string' ? flags.url : positionals[0])
  let targets
  if (url) targets = [rows.find((r) => r.url === url) || { url, company: '', role: '', location: '' }]
  else {
    const q = pendingQueue(rows, { includeScreened: Boolean(flags['include-screened']) })
    targets = flags['all-pending'] ? q : q.slice(0, 1) // default --next: the single best
  }
  const limit = Number(flags.limit) > 0 ? Number(flags.limit) : Infinity
  targets = targets.slice(0, limit)
  if (!targets.length) {
    console.log(color.dim(t('eval.next_none')))
    return { evaluated: 0 }
  }
  console.log(t('eval.auto_running', { count: targets.length, backend: active.runtime || active.kind }))
  // 8a.7: --batch submits one Batches-API job (api only, 50% price) instead of N live calls.
  if (flags.batch && active.kind === 'api' && targets.length > 1) return runBatchEval({ targets, active, profile, cv, today, t, transferable })
  if (flags.batch) console.log(color.dim('  ' + t('eval.batch_skipped'))) // requested but not eligible → run live

  // 8a.4a / low-end tuning: evalRole auto-selects the guaranteed-JSON path on capable local backends
  // (default-on; opt out with profile.eval_grammar:false), so no per-call responseFormat is computed here.
  let evaluated = 0
  let failed = 0
  let skipped = 0
  let first = true
  for (const row of targets) {
    if (!first) await sleep(800) // politeness between calls (one JD per request)
    first = false
    let jd = ''
    try {
      const d = await getJd(row.url)
      jd = (d && d.description) || ''
    } catch {
      jd = ''
    }
    if (!jd) {
      console.log('  ' + color.dim(t('eval.auto_no_jd', { role: row.role || row.url })))
      failed++
      continue
    }
    // 8a pre-confirm (--confirm): a cheap AI triage that skips clearly-wrong roles before full scoring.
    if (flags.confirm) {
      try {
        const pc = await preConfirm({ active, jd, cv, profile, transferable })
        if (pc.verdict === 'skip') {
          console.log('  ' + color.dim(t('eval.preconfirm_skip', { role: row.role || row.url, reason: pc.reason })))
          skipped++
          continue
        }
      } catch {
        /* pre-confirm is best-effort — fall through to the full eval */
      }
    }
    try {
      const v = await evalRole({ active, jd, cv, profile, today, transferable })
      if (!v.ok) {
        console.log('  ' + color.yellow(t('eval.auto_unparsed', { role: row.role || row.url })))
        failed++
        continue
      }
      let verdict = v
      // 8a.9 escalation ladder: re-score a borderline local verdict on the api backend (accuracy upgrade).
      if (flags.escalate && isBorderline(v)) {
        try {
          const esc = await selectActive({ ...profile, inference: 'api' })
          if (esc.up && esc.kind !== active.kind) {
            const v2 = await evalRole({ active: esc, jd, cv, profile, today, transferable })
            if (v2.ok) {
              console.log('  ' + color.dim(t('eval.escalated', { from: v.score.toFixed(1), to: v2.score.toFixed(1) })))
              verdict = v2
            }
          }
        } catch {
          /* escalation is best-effort — keep the primary verdict */
        }
      }
      upsertEval({ url: row.url, score: verdict.score, band: verdict.band, company: row.company, role: row.role, location: row.location, recommendation: verdict.recommendation }, today)
      if (verdict.clamped) logClamp(clampLogEntry(verdict, row), today) // 8a.5: persist the override for drift tracking
      evaluated++
      const tag = verdict.clamped ? color.yellow(' (' + t('eval.auto_clamped') + ')') : ''
      console.log(`  ${color.green('✓')} ${verdict.score.toFixed(1)} ${t('bands.' + verdict.band)}${tag}  ${row.company} — ${row.role}${verdict.pay ? color.dim('  ' + verdict.pay) : ''}`)
    } catch (e) {
      console.log('  ' + color.red(t('eval.auto_error', { role: row.role || row.url, error: e.message })))
      failed++
    }
  }
  console.log('\n' + t('eval.auto_done', { evaluated, failed }))
  if (skipped) console.log(color.dim(t('eval.preconfirm_thinned', { skipped })))
  return { evaluated, failed, skipped }
}

// 8a.7: batch path — fetch+prep every role, submit ONE Batches job, then record each verdict. api only.
async function runBatchEval({ targets, active, profile, cv, today, t, transferable }) {
  const prepped = []
  let noJd = 0
  for (const row of targets) {
    let jd = ''
    try {
      const d = await getJd(row.url)
      jd = (d && d.description) || ''
    } catch {
      jd = ''
    }
    if (!jd) {
      console.log('  ' + color.dim(t('eval.auto_no_jd', { role: row.role || row.url }))) // don't vanish silently
      noJd++
      continue
    }
    const { gates, decision, user } = prepEval({ jd, cv, profile, today })
    prepped.push({ row, jd, gates, decision, custom_id: `r${prepped.length}`, user })
  }
  if (!prepped.length) {
    console.log(color.dim(t('eval.next_none')))
    return { evaluated: 0 }
  }
  const xfer = transferable === undefined ? Boolean(profile.transferable_skills) : transferable
  const requests = buildBatchRequests(prepped.map((p) => ({ custom_id: p.custom_id, user: p.user })), { model: active.model, system: evalSystemFor(xfer) })
  let results
  try {
    results = await submitBatch(active, requests, { onPoll: () => process.stdout.write('.') })
    process.stdout.write('\n')
  } catch (e) {
    console.log('\n' + color.red(t('eval.auto_error', { role: 'batch', error: e.message })))
    process.exitCode = 1
    return { evaluated: 0 }
  }
  const byId = parseBatchResults(results)
  let evaluated = 0
  for (const p of prepped) {
    const r = byId[p.custom_id]
    if (!r || !r.text) continue
    const v = buildVerdict({ text: r.text, jd: p.jd, gates: p.gates, decision: p.decision, profile, usage: r.usage, model: active.model, backend: 'api', transferable: xfer })
    if (!v.ok) continue
    upsertEval({ url: p.row.url, score: v.score, band: v.band, company: p.row.company, role: p.row.role, location: p.row.location, recommendation: v.recommendation }, today)
    if (v.clamped) logClamp(clampLogEntry(v, p.row), today)
    evaluated++
    const tag = v.clamped ? color.yellow(' (' + t('eval.auto_clamped') + ')') : ''
    console.log(`  ${color.green('✓')} ${v.score.toFixed(1)} ${t('bands.' + v.band)}${tag}  ${p.row.company} — ${p.row.role}`)
  }
  console.log('\n' + t('eval.auto_done', { evaluated, failed: prepped.length - evaluated + noJd }))
  return { evaluated }
}
