// Jobfaro — environment & setup check.
// Hard requirements fail (x); heavy extras (PDF, Playwright) are OPTIONAL and
// only warn (Phase 0.5), so a fresh, no-PDF install still passes cleanly.
//
// Run directly:  node doctor.mjs [--lang en|es]
// Or via the CLI: jobfaro doctor

import { existsSync, lstatSync, realpathSync, readlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { loadProfile, paths, SUPPORTED_LANGUAGES, fileExists, ROOT } from './lib/config.mjs'
import { getT } from './lib/i18n.mjs'
import { parseFlags, resolveLang, isDirectRun } from './lib/cli.mjs'
import { providerIds } from './providers/_contract.mjs'
import { color, symbol, heading } from './lib/ui.mjs'

const MIN_NODE_MAJOR = 20

// Where does a global command on PATH actually point? `npm link` installs
// symlinks that bake this checkout's absolute path — moving or renaming the
// folder leaves them dangling ("command not found" with no hint why).
// Returns { status: 'ok' | 'missing' | 'broken' | 'elsewhere', target }.
export function globalCommandStatus(cmd, { pathDirs, repoRoot }) {
  for (const dir of pathDirs) {
    if (!dir) continue
    const entry = path.join(dir, cmd)
    try {
      lstatSync(entry)
    } catch {
      continue
    }
    let resolved
    try {
      resolved = realpathSync(entry)
    } catch {
      let target = entry
      try {
        target = path.resolve(dir, readlinkSync(entry))
      } catch {}
      return { status: 'broken', target }
    }
    let root = repoRoot
    try {
      root = realpathSync(repoRoot)
    } catch {}
    if (resolved === root || resolved.startsWith(root + path.sep)) return { status: 'ok', target: resolved }
    return { status: 'elsewhere', target: resolved }
  }
  return { status: 'missing', target: null }
}

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

  // Where user data lives (portable: JOBFARO_HOME > repo-local checkout > ~/.jobfaro).
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

  // Global commands (optional): warn when `jobfaro`/`jf` on PATH are dangling or
  // point at another copy — the after-a-move failure is otherwise silent. npm's
  // Windows shims are .cmd wrappers, not symlinks, so this check is POSIX-only.
  if (process.platform !== 'win32') {
    const pathDirs = (process.env.PATH || '').split(path.delimiter)
    const statuses = ['jobfaro', 'jf'].map((cmd) => ({ cmd, ...globalCommandStatus(cmd, { pathDirs, repoRoot: ROOT }) }))
    if (statuses.every((s) => s.status === 'ok')) ok(t('doctor.link_ok', { cmds: 'jobfaro, jf' }))
    else if (statuses.every((s) => s.status === 'missing')) warn(t('doctor.link_missing', { cmds: 'jobfaro, jf' }))
    else {
      for (const s of statuses) {
        if (s.status === 'ok') ok(t('doctor.link_ok', { cmds: s.cmd }))
        else if (s.status === 'missing') warn(t('doctor.link_missing', { cmds: s.cmd }))
        else if (s.status === 'broken') warn(t('doctor.link_broken', { cmd: s.cmd, target: s.target }))
        else warn(t('doctor.link_elsewhere', { cmd: s.cmd, target: s.target }))
      }
    }
  }

  // Résumé import/upload tools (optional): .docx needs `unzip` (ubiquitous), .pdf needs `pdftotext` (poppler).
  const hasBin = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true } catch { return false } }
  const hasUnzip = hasBin('unzip', ['-v'])
  const hasPdftotext = hasBin('pdftotext', ['-v'])
  if (hasUnzip && hasPdftotext) ok(t('doctor.resume_import_ok'))
  else {
    if (!hasPdftotext) warn(t('doctor.pdftotext_optional'))
    if (!hasUnzip) warn(t('doctor.unzip_optional'))
  }

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
