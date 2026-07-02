// Jobdar — configuration & paths.
// Loads the user profile and portal list, applies defaults, and resolves all
// on-disk locations. Honors JOBDAR_* environment overrides (see docs / Phase 0.3).

import { readFileSync, existsSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import yaml from 'js-yaml'

// Package root (this file lives in <root>/lib/). PACKAGE ASSETS — i18n tables, state taxonomy, the
// employer seed catalog, package.json — always resolve from here, never from user dirs.
export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

// USER DATA home — portable between devices. Resolution order:
//   1. JOBDAR_HOME env (relocate everything with one variable; copy that folder to migrate)
//   2. repo-local mode: a checkout that already has config/profile.yml keeps using its own
//      config/ + data/ + output/ — the whole folder stays a self-contained, movable unit
//   3. ~/.jobdar — the default for global installs (npm -g), so user data NEVER lives inside
//      node_modules where an update would wipe it
// JOBDAR_CONFIG_DIR / JOBDAR_DATA_DIR / JOBDAR_OUTPUT_DIR still override individual dirs.
const env = process.env
const repoLocal = existsSync(path.join(ROOT, 'config', 'profile.yml'))
const HOME_BASE = env.JOBDAR_HOME ? path.resolve(env.JOBDAR_HOME) : repoLocal ? ROOT : path.join(os.homedir(), '.jobdar')
const CONFIG_DIR = env.JOBDAR_CONFIG_DIR ? path.resolve(env.JOBDAR_CONFIG_DIR) : path.join(HOME_BASE, 'config')
const DATA_DIR = env.JOBDAR_DATA_DIR ? path.resolve(env.JOBDAR_DATA_DIR) : path.join(HOME_BASE, 'data')

export const paths = {
  root: ROOT,
  home: HOME_BASE,
  configDir: CONFIG_DIR,
  dataDir: DATA_DIR,
  profile: path.join(CONFIG_DIR, 'profile.yml'),
  portals: path.join(CONFIG_DIR, 'portals.yml'),
  i18nDir: path.join(ROOT, 'config', 'i18n'), // package asset — language tables ship with the code
  states: path.join(ROOT, 'templates', 'states.yml'),
  cv: path.join(DATA_DIR, 'cv.md'),
  customize: path.join(DATA_DIR, 'customize.yml'), // per-role directive + variant state (Phase 8f)
  outputDir: env.JOBDAR_OUTPUT_DIR ? path.resolve(env.JOBDAR_OUTPUT_DIR) : path.join(HOME_BASE, 'output'),
}

// Scope is locked to American English + Spanish (Phase 0.4 / Phase 1).
export const SUPPORTED_LANGUAGES = ['en', 'es']
export const REGIONS = ['midwest', 'northeast', 'southeast', 'southwest', 'west', 'nationwide', 'custom']
export const LEVELS = ['entry', 'mid', 'senior']

// Shipped defaults: Midwest region, entry level, English. No PII.
export const PROFILE_DEFAULTS = {
  language: 'en',
  target_regions: ['midwest'],
  target_levels: ['entry'],
  tuning_profile: 'new_grad',
  // Phase 8b: on-device winc.cpp is the DEFAULT backend (private, no key, no cost). `api` (BYO key) is
  // the opt-in accuracy upgrade; `auto` runs local and offers the API on borderline roles.
  inference: 'local',
  inference_url: '', // '' → the runtime's localhost default (winc 127.0.0.1:8080); override for a custom port
  inference_runtime: 'winc', // local runtime: winc (Messages API, default) | ollama | llamafile (OpenAI-compat)
  local_model: '', // model id for ollama/llamafile; winc --eval auto-picks 2B/4B, so leave blank for winc
  eval_grammar: true, // guaranteed-JSON evals (response_format=json_schema) on local backends that serve it (winc/ollama/llamafile) → 0 parse-failures; set false to force prompt-parse on /v1/messages
  name: '',
  location: '',
  include_degree_required_roles: true,
  // When on, the pre-confirm + eval CREDIT transferable/adjacent skills (for new grads & career changers)
  // — without loosening the bar: it changes what counts as a fit, not how many roles pass.
  transferable_skills: false,
  target_salary: 0,
  score_weights: { resume: 0.7, location: 0.15, seniority: 0.1, salary: 0.05 },
}

// The BYO-key for the `api`/`auto` backends. Never in the tracked profile — `jobdar init` writes it to
// the gitignored data/credentials.env (0600). Env JOBDAR_API_KEY wins (CI / one-off overrides).
export function loadApiKey(e = env) {
  if (e.JOBDAR_API_KEY) return e.JOBDAR_API_KEY
  const file = path.join(DATA_DIR, 'credentials.env')
  if (!existsSync(file)) return ''
  const m = readFileSync(file, 'utf8').match(/^\s*JOBDAR_API_KEY\s*=\s*(.+?)\s*$/m)
  return m ? m[1].trim() : ''
}

// Read a KEY=value from the gitignored data/credentials.env (env var wins for CI/one-off overrides).
// Generic sibling of loadApiKey — used by opt-in providers that need their own BYO free key (USAJobs).
export function loadCredential(name, e = env) {
  if (e[name]) return String(e[name]).trim()
  const file = path.join(DATA_DIR, 'credentials.env')
  if (!existsSync(file)) return ''
  const m = readFileSync(file, 'utf8').match(new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*(.+?)\\s*$', 'm'))
  return m ? m[1].trim() : ''
}

// USAJobs (federal jobs aggregator) BYO-key: a FREE key from https://developer.usajobs.gov/apirequest/
// plus the email it was registered under (sent as the User-Agent, per their API terms). Both stay in the
// gitignored data/credentials.env — never tracked, never sent anywhere but data.usajobs.gov.
export function loadUsaJobsCreds(e = env) {
  return { key: loadCredential('USAJOBS_API_KEY', e), email: loadCredential('USAJOBS_EMAIL', e) }
}

export function loadCv() {
  return existsSync(paths.cv) ? readFileSync(paths.cv, 'utf8') : ''
}

// Crash-safe write: render to a sibling temp file, then atomically rename it over the target. A crash
// mid-write leaves the previous file intact (worst case, an orphan `.tmp`). The pid in the temp name keeps
// concurrent writers — multiple sessions share this repo — from stepping on each other's temp file.
export function atomicWrite(file, data, opts) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, data, opts)
  renameSync(tmp, file)
}

function readYaml(file) {
  if (!existsSync(file)) return null
  try {
    return yaml.load(readFileSync(file, 'utf8')) ?? null
  } catch (err) {
    const e = new Error(`${file} is not valid YAML — ${err.reason || err.message}. Fix it by hand, or re-run \`jobdar init\` to regenerate it.`)
    e.userFacing = true
    throw e
  }
}

export function loadProfile() {
  const fromFile = readYaml(paths.profile) || {}
  return { ...PROFILE_DEFAULTS, ...fromFile }
}

// Persist a partial profile patch to config/profile.yml — merges into the existing file (so unrelated
// fields like inference/inference_url/eval_grammar are preserved) and atomic-writes. Used by serve's
// POST /profile so the GUI can save the user's chosen identity to this machine. Returns the merged profile.
export function saveProfile(patch) {
  const cur = readYaml(paths.profile) || {}
  const next = { ...cur, ...(patch && typeof patch === 'object' ? patch : {}) }
  mkdirSync(CONFIG_DIR, { recursive: true })
  atomicWrite(paths.profile, yaml.dump(next))
  return next
}

export function loadPortals() {
  const data = readYaml(paths.portals)
  if (!data) return []
  const list = Array.isArray(data) ? data : data.portals
  return Array.isArray(list) ? list : []
}

// Persist the portal list (used by intelligent discovery to add newly-found company boards). Crash-safe.
export function savePortals(list) {
  mkdirSync(CONFIG_DIR, { recursive: true })
  atomicWrite(paths.portals, yaml.dump(Array.isArray(list) ? list : []))
}

export function fileExists(p) {
  return existsSync(p)
}
