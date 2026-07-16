// Jobfaro — `jobfaro backend` (Phase 8b). Manage the on-device inference backend (winc.cpp).
//   jobfaro backend            status: which backend, URL, and whether it's live
//   jobfaro backend --check    canary: GET /health + one real eval round-trip (the verification gate)
//   jobfaro backend --install  bootstrap winc.cpp (delegated to winc; we orchestrate + verify)
// Local-first: winc serves the Anthropic Messages API on localhost, so it's private, free, no key.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { resolveBackend, selectActive, backendHealth, evaluate } from '../inference.mjs'
import { color, heading } from '../ui.mjs'

// Find the winc binary: PATH first, then the documented checkout / install spots. Returns its version
// string, or null if winc isn't installed.
export function wincVersion() {
  const candidates = ['winc', path.join(os.homedir(), 'winc.cpp', 'winc'), path.join(os.homedir(), '.winc', 'bin', 'winc')]
  for (const bin of candidates) {
    try {
      const out = execFileSync(bin, ['-v'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim()
      if (out) return { bin, version: out.replace(/^winc\s+/i, '') } // `winc -v` prints "winc <ver>"; keep just <ver>
    } catch {
      if (bin !== 'winc' && existsSync(bin)) return { bin, version: '(unknown)' }
    }
  }
  return null
}

export async function runBackend(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  const r = resolveBackend(profile)

  heading(t('backend.title'))

  if (flags.install) return install(t, r)
  if (flags.check) return check(t, profile)

  // --- status ---
  const active = await selectActive(profile)
  console.log(t('backend.mode', { mode: r.mode }))
  if (active.kind === 'local') {
    console.log(t('backend.local_url', { runtime: active.runtime, url: active.baseUrl }))
    console.log(active.up ? color.green(t('backend.up')) : color.yellow(t('backend.down')))
    if (!active.up) {
      console.log(color.dim('  ' + (active.runtime === 'winc' ? t('backend.start_hint') : t('backend.start_hint_other', { runtime: active.runtime }))))
      console.log(color.dim('  ' + t('backend.install_hint')))
    }
  } else {
    console.log(t('backend.api_url', { url: active.baseUrl, model: active.model }))
    console.log(active.key ? color.green(t('backend.key_set')) : color.yellow(t('backend.key_missing')))
  }
  console.log(color.dim('  ' + t('backend.reason', { reason: active.reason })))
  console.log(color.dim('  ' + t('backend.check_hint')))
  return { mode: r.mode, kind: active.kind, up: active.up }
}

// Canary: health + one real eval round-trip. This is the 8b verification gate.
async function check(t, profile) {
  const active = await selectActive(profile)
  console.log(t('backend.checking', { kind: active.kind, url: active.baseUrl }))
  if (active.kind === 'local') {
    const healthy = await backendHealth(active.baseUrl, { path: active.healthPath })
    console.log(healthy ? color.green(t('backend.health_ok')) : color.red(t('backend.health_fail')))
    if (!healthy) {
      console.log(color.dim('  ' + (active.runtime === 'winc' ? t('backend.start_hint') : t('backend.start_hint_other', { runtime: active.runtime }))))
      process.exitCode = 1
      return { ok: false }
    }
  }
  try {
    const today = new Date().toISOString().slice(0, 10)
    const v = await evaluate({
      active,
      jd: 'Data Analyst (entry level). Responsibilities: build SQL queries and Excel dashboards, report on KPIs. Requirements: SQL, Excel, attention to detail.',
      cv: 'Recent grad. Skills: SQL, Excel, Python. Built reporting dashboards in a class project.',
      today,
      maxTokens: 256,
    })
    if (v.score == null) {
      console.log(color.red(t('backend.canary_unparsed', { raw: (v.raw || '').slice(0, 120) })))
      // winc: a healthy server + empty reply is almost always bare `winc serve` (reasoning ON → empty
      // content), the #1 onboarding trap (8b.2). ollama/llamafile: the model just replied off-format.
      if (active.runtime === 'winc') console.log(color.dim('  ' + t('backend.empty_hint')))
      else if (active.kind === 'local') console.log(color.dim('  ' + t('backend.empty_hint_other')))
      process.exitCode = 1
      return { ok: false }
    }
    const tokens = v.usage ? (v.usage.input_tokens || 0) + (v.usage.output_tokens || 0) : 0
    console.log(color.green(t('backend.canary_ok', { score: v.score.toFixed(1), band: v.band || '—', model: v.model || active.kind, tokens })))
    return { ok: true, verdict: v }
  } catch (e) {
    console.log(color.red(t('backend.canary_fail', { error: e.message })))
    // ollama/llamafile's most likely failure: the configured model isn't pulled (HTTP 404).
    if (active.protocol === 'openai' && /not found|404|pull/i.test(e.message)) console.log(color.dim('  ' + t('backend.model_hint')))
    process.exitCode = 1
    return { ok: false }
  }
}

// Bootstrap winc.cpp. We DELEGATE to winc (never reimplement model download/serve); jobfaro orchestrates
// and verifies. If winc is absent, print the exact install path; if present, guide to a live server.
async function install(t, r) {
  const winc = wincVersion()
  if (!winc) {
    console.log(color.yellow(t('backend.no_winc')))
    console.log('  ' + t('backend.install_prebuilt'))
    console.log('  ' + t('backend.install_source'))
    console.log(color.dim('  ' + t('backend.install_after')))
    process.exitCode = 1
    return { installed: false }
  }
  console.log(color.green(t('backend.found_winc', { version: winc.version })))
  // winc owns the model catalog + download; surface its setup, don't duplicate it.
  console.log('  ' + t('backend.setup_step'))
  console.log('  ' + t('backend.serve_step'))
  const healthy = await backendHealth(r.localUrl, { path: r.healthPath })
  if (healthy) {
    console.log(color.green(t('backend.already_up', { url: r.localUrl })))
    console.log(color.dim('  ' + t('backend.check_hint')))
  } else {
    console.log(color.dim('  ' + t('backend.serve_then_check', { url: r.localUrl })))
  }
  return { installed: true, version: winc.version, up: healthy }
}
