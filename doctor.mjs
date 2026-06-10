// Jobdar — environment & setup check.
// Hard requirements fail (x); heavy extras (PDF, Playwright) are OPTIONAL and
// only warn (Phase 0.5), so a fresh, no-PDF install still passes cleanly.
//
// Run directly:  node doctor.mjs [--lang en|es]
// Or via the CLI: jobdar doctor

import { existsSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, paths, SUPPORTED_LANGUAGES, fileExists } from './lib/config.mjs'
import { getT } from './lib/i18n.mjs'
import { parseFlags, resolveLang, isDirectRun } from './lib/cli.mjs'
import { providerIds } from './providers/_contract.mjs'
import { color, symbol, heading } from './lib/ui.mjs'

const MIN_NODE_MAJOR = 20

export async function runDoctor(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)

  let warnings = 0
  let failures = 0
  const ok = (msg) => console.log(`  ${symbol.ok()} ${msg}`)
  const warn = (msg) => {
    warnings++
    console.log(`  ${symbol.warn()} ${color.yellow(msg)}`)
  }
  const fail = (msg) => {
    failures++
    console.log(`  ${symbol.fail()} ${color.red(msg)}`)
  }

  heading(t('doctor.title'))

  // Node version (hard requirement).
  const major = Number(process.versions.node.split('.')[0])
  if (major >= MIN_NODE_MAJOR) ok(t('doctor.node_ok', { version: process.versions.node }))
  else fail(t('doctor.node_old', { version: process.versions.node, min: MIN_NODE_MAJOR }))

  // Dependencies — if config.mjs imported, js-yaml resolved, so we're good here.
  ok(t('doctor.deps_ok'))

  // Where user data lives (portable: JOBDAR_HOME > repo-local checkout > ~/.jobdar).
  ok(t('doctor.home', { home: paths.home }))

  // Config files (warn, don't fail — `init` will create them).
  if (fileExists(paths.profile) && fileExists(paths.portals)) {
    ok(t('doctor.config_ok'))
  } else {
    if (!fileExists(paths.profile)) warn(t('doctor.config_missing', { file: paths.profile }))
    if (!fileExists(paths.portals)) warn(t('doctor.config_missing', { file: paths.portals }))
  }

  // i18n tables (hard — the UI needs them).
  const missing = SUPPORTED_LANGUAGES.filter((l) => !existsSync(path.join(paths.i18nDir, `${l}.yml`)))
  if (missing.length === 0) ok(t('doctor.i18n_ok', { langs: SUPPORTED_LANGUAGES.join(', ') }))
  else for (const l of missing) fail(t('doctor.i18n_missing', { lang: l }))

  // Scanner providers.
  ok(t('doctor.providers_ok', { providers: providerIds().join(', ') }))

  // Optional heavy bits — warn only (never fail the check).
  try {
    await import('playwright')
    ok('Playwright')
  } catch {
    warn(t('doctor.playwright_optional'))
  }
  warn(t('doctor.pdf_optional'))

  // Summary.
  console.log('')
  if (failures > 0) console.log(color.red(t('doctor.summary_fail', { count: failures })))
  else if (warnings > 0) console.log(color.yellow(t('doctor.summary_warn', { count: warnings })))
  else console.log(color.green(t('doctor.summary_ok')))

  return { warnings, failures }
}

if (isDirectRun(import.meta.url)) {
  runDoctor(process.argv.slice(2)).then(({ failures }) => process.exit(failures > 0 ? 1 : 0))
}
