// Jobdar — `jobdar update` (1.70.1). Brings this installation to the latest version by whichever route
// installed it: a git checkout (the one-command installer, a clone) pulls fast-forward and re-installs
// its one dependency; an npm install (`npm i -g jobdar`, once 1.0 is published) re-installs the package
// from the registry; anything else — the desktop app's vendored engine, an unpacked tarball — is told
// where its update lives instead of being touched. `--check` only reports whether a newer version
// exists. Nothing here reads or writes the user's data home.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT, loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang, readVersion } from '../cli.mjs'
import { color, heading } from '../ui.mjs'

export const PACKAGE = 'jobdar'
export const RELEASES_URL = 'https://github.com/samdotson61/jobdar-app/releases'

const npmBin = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm')

// How this copy was installed: 'git' (a checkout), 'npm' (lives under a node_modules), or 'other'.
export function detectInstall(root = ROOT) {
  if (existsSync(path.join(root, '.git'))) return 'git'
  if (root.split(/[\\/]/).includes('node_modules')) return 'npm'
  return 'other'
}

// The commands an update runs, in order — pure so the plan is testable without running anything.
export function updateSteps(kind, root = ROOT) {
  if (kind === 'git') {
    return [
      { cmd: 'git', args: ['-C', root, 'pull', '--ff-only'] },
      { cmd: npmBin(), args: ['install', '--no-audit', '--no-fund'], cwd: root },
    ]
  }
  if (kind === 'npm') return [{ cmd: npmBin(), args: ['install', '-g', `${PACKAGE}@latest`] }]
  return []
}

function run(step, { quiet = false } = {}) {
  return spawnSync(step.cmd, step.args, {
    cwd: step.cwd,
    encoding: 'utf8',
    stdio: quiet ? 'pipe' : 'inherit',
    shell: process.platform === 'win32', // npm.cmd needs a shell on Windows
  })
}

const capture = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: 'pipe', shell: process.platform === 'win32' })
  return r.status === 0 ? r.stdout.trim() : null
}

function installedVersion(root) {
  try {
    return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version || readVersion()
  } catch {
    return readVersion()
  }
}

// What a newer version would be, by route. Returns { available: bool, version, count, branch } or
// { unknown: true, reason } when it cannot tell (offline, not published yet, not a git/npm install).
export function checkLatest(kind, root = ROOT) {
  if (kind === 'git') {
    if (capture('git', ['-C', root, 'fetch', '--quiet']) === null) return { unknown: true, reason: 'fetch' }
    const count = Number(capture('git', ['-C', root, 'rev-list', '--count', 'HEAD..@{upstream}']))
    if (!Number.isFinite(count)) return { unknown: true, reason: 'upstream' }
    const branch = capture('git', ['-C', root, 'rev-parse', '--abbrev-ref', '@{upstream}']) || 'origin'
    let version = ''
    try {
      version = JSON.parse(capture('git', ['-C', root, 'show', '@{upstream}:package.json']) || '{}').version || ''
    } catch {
      version = ''
    }
    return { available: count > 0, count, branch, version }
  }
  if (kind === 'npm') {
    const latest = capture(npmBin(), ['view', PACKAGE, 'version'])
    if (!latest) return { unknown: true, reason: 'not_published' }
    return { available: latest !== installedVersion(root), version: latest }
  }
  return { unknown: true, reason: 'other' }
}

export async function runUpdate(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  if (flags.help || flags.h) {
    console.log(t('update.usage'))
    console.log(`  --check   ${t('update.help_check')}`)
    console.log(`  --force   ${t('update.help_force')}`)
    return
  }
  heading(t('update.title'))

  const root = ROOT
  const kind = detectInstall(root)
  const from = installedVersion(root)
  console.log(t('update.current', { version: from, kind: t(`update.kind_${kind}`, { root }) }))

  if (kind === 'other') {
    console.log(color.dim(t('update.other_how', { url: RELEASES_URL })))
    return
  }

  if (flags.check) {
    console.log(color.dim(t('update.checking')))
    const latest = checkLatest(kind, root)
    if (latest.unknown) {
      console.log(latest.reason === 'not_published' ? t('update.not_published') : t('update.cannot_check'))
      return
    }
    if (!latest.available) {
      console.log(t('update.up_to_date'))
      return
    }
    if (kind === 'git') console.log(t('update.behind_git', { count: latest.count, branch: latest.branch, version: latest.version || '?' }))
    else console.log(t('update.behind_npm', { version: latest.version }))
    return
  }

  if (kind === 'git' && !flags.force) {
    const dirty = capture('git', ['-C', root, 'status', '--porcelain'])
    if (dirty) {
      console.error(t('update.dirty'))
      process.exitCode = 1
      return
    }
  }

  for (const step of updateSteps(kind, root)) {
    console.log(color.dim(t('update.running', { command: [step.cmd, ...step.args].join(' ') })))
    const r = run(step)
    if (r.status !== 0) {
      console.error(t('update.failed', { step: step.cmd }))
      process.exitCode = 1
      return
    }
  }

  const to = kind === 'git' ? installedVersion(root) : capture(npmBin(), ['view', PACKAGE, 'version']) || installedVersion(root)
  console.log(to === from ? t('update.unchanged', { version: to }) : t('update.done', { from, to }))
}
