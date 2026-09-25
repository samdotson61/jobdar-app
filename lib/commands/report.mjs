// Jobdar — `jobdar report` (1.55.0). Writes the beta report — the shareable, PII-free artifact of a
// testing session (funnel aggregates + would-apply answers + evaluator agreement) — to
// data/reports/beta-report-<date>.md + .json. The desktop/web app's "Export beta report" button emits
// the same document via serve GET /report; this is the CLI path.

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadProfile, paths, atomicWrite } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang, readVersion } from '../cli.mjs'
import { readPipeline } from '../evaluations.mjs'
import { readFeedback } from '../feedback.mjs'
import { buildBetaReport } from '../report_pure.mjs'
import { resolveBackend } from '../inference.mjs'
import { ensureFreshListings } from './_fresh.mjs'
import { color, heading } from '../ui.mjs'

export async function runReport(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  heading(t('report.title'))

  // Verify-before-present: the report's funnel/liveness numbers reflect a same-day board check.
  await ensureFreshListings(t, { skip: Boolean(flags['no-verify']) })

  const r = resolveBackend(profile)
  const { data, md } = buildBetaReport({
    rows: readPipeline(),
    feedback: readFeedback(),
    meta: {
      date: new Date().toISOString().slice(0, 10),
      cliVersion: readVersion(),
      platform: `${os.platform()} ${os.arch()}`,
      backend: r.mode === 'api' ? 'api' : `${r.runtime} (local)`,
      profile,
    },
  })

  const dir = path.join(paths.dataDir, 'reports')
  mkdirSync(dir, { recursive: true })
  const base = path.join(dir, `beta-report-${data.date}`)
  atomicWrite(`${base}.md`, md)
  atomicWrite(`${base}.json`, JSON.stringify(data, null, 1) + '\n')

  console.log(`  ${color.green('✓')} ${t('report.written', { file: `${base}.md` })}`)
  console.log(color.dim(`    ${base}.json`))
  console.log('  ' + t('report.summary', { evaluated: data.funnel.evaluated, rated: data.ratings.n, agreement: data.ratings.agreementScored ? `${data.ratings.agreementPct}%` : '—' }))
  if (!data.ratings.n) console.log(color.dim('  ' + t('report.no_ratings')))
  console.log(color.dim('  ' + t('report.privacy')))
  return { ok: true, md: `${base}.md`, json: `${base}.json`, data }
}
