// Jobdar — customization state (Phase 8f). Persists, per role and per artifact (`tailor` | `outreach`),
// the ACCUMULATED user directives + the latest variant number + a content hash. Lives in the gitignored
// data/customize.yml. The model never reads this — it's bookkeeping so re-runs layer directives, number
// variants, and stay idempotent: an unchanged (cv + jd + directives) hash means "nothing to regenerate".
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import yaml from 'js-yaml'
import { paths, atomicWrite } from './config.mjs'
import { roleKey } from './evaluations.mjs'

export const ARTIFACTS = ['tailor', 'outreach']

// A stable per-role key: the role URL when we have one (pipeline / scanned roles), else a
// company+role fingerprint (for --jd files with no URL). Mirrors how evaluations keys rows.
export function customizeKey({ url = '', company = '', role = '', location = '' }) {
  return String(url || '').trim() || roleKey(company, role, location)
}

// Deterministic fingerprint of everything that feeds a generation. Same inputs → same hash → no re-run.
export function contentHash(cv, jd, directives) {
  return createHash('sha256')
    .update(JSON.stringify({ cv: String(cv || ''), jd: String(jd || ''), directives: directives || [] }))
    .digest('hex')
    .slice(0, 16)
}

// The directives that apply to this run: start from what's stored (unless --reset), then append the new
// one. Layering, not replacement — "warmer" then "shorter" both survive. Skips an exact repeat of the last.
export function effectiveDirectives(prev, { directive = '', reset = false } = {}) {
  const base = reset ? [] : Array.isArray(prev && prev.directives) ? [...prev.directives] : []
  const d = String(directive || '').trim()
  if (d && base[base.length - 1] !== d) base.push(d)
  return base
}

export function loadCustomize() {
  if (!existsSync(paths.customize)) return {}
  try {
    return yaml.load(readFileSync(paths.customize, 'utf8')) || {}
  } catch (err) {
    const e = new Error(`${paths.customize} is not valid YAML — ${err.reason || err.message}. Delete it to reset customization state.`)
    e.userFacing = true
    throw e
  }
}

export function getArtifact(store, key, artifact) {
  const entry = store && store[key]
  return (entry && entry.artifacts && entry.artifacts[artifact]) || null
}

// Pure: fold a freshly-generated artifact into the store, bumping the variant. Returns { store, variant }.
export function recordVariant(store, { key, url = '', role = '', company = '', artifact, directives, hash, dateStr }) {
  const prevEntry = (store && store[key]) || {}
  const prevArt = (prevEntry.artifacts && prevEntry.artifacts[artifact]) || null
  const variant = (prevArt && Number(prevArt.variant)) ? Number(prevArt.variant) + 1 : 1
  const entry = {
    role: role || prevEntry.role || '',
    company: company || prevEntry.company || '',
    url: url || prevEntry.url || '',
    artifacts: { ...(prevEntry.artifacts || {}), [artifact]: { directives, variant, hash, updated: dateStr } },
  }
  return { store: { ...(store || {}), [key]: entry }, variant }
}

export function writeCustomize(store) {
  atomicWrite(paths.customize, yaml.dump(store || {}, { lineWidth: 100 }))
  return store
}
