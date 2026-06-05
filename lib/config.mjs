// Jobdar — configuration & paths.
// Loads the user profile and portal list, applies defaults, and resolves all
// on-disk locations. Honors JOBDAR_* environment overrides (see docs / Phase 0.3).

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import yaml from 'js-yaml'

// Repo root (this file lives in <root>/lib/).
export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

const env = process.env
const CONFIG_DIR = env.JOBDAR_CONFIG_DIR ? path.resolve(env.JOBDAR_CONFIG_DIR) : path.join(ROOT, 'config')
const DATA_DIR = env.JOBDAR_DATA_DIR ? path.resolve(env.JOBDAR_DATA_DIR) : path.join(ROOT, 'data')

export const paths = {
  root: ROOT,
  configDir: CONFIG_DIR,
  dataDir: DATA_DIR,
  profile: path.join(CONFIG_DIR, 'profile.yml'),
  portals: path.join(CONFIG_DIR, 'portals.yml'),
  i18nDir: path.join(CONFIG_DIR, 'i18n'),
  states: path.join(ROOT, 'templates', 'states.yml'),
  cv: path.join(DATA_DIR, 'cv.md'),
  outputDir: env.JOBDAR_OUTPUT_DIR ? path.resolve(env.JOBDAR_OUTPUT_DIR) : path.join(ROOT, 'output'),
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
  inference: 'api',
  name: '',
  location: '',
  include_degree_required_roles: true,
  target_salary: 0,
  score_weights: { resume: 0.4, seniority: 0.25, location: 0.2, salary: 0.15 },
}

export function loadCv() {
  return existsSync(paths.cv) ? readFileSync(paths.cv, 'utf8') : ''
}

function readYaml(file) {
  if (!existsSync(file)) return null
  return yaml.load(readFileSync(file, 'utf8')) ?? null
}

export function loadProfile() {
  const fromFile = readYaml(paths.profile) || {}
  return { ...PROFILE_DEFAULTS, ...fromFile }
}

export function loadPortals() {
  const data = readYaml(paths.portals)
  if (!data) return []
  const list = Array.isArray(data) ? data : data.portals
  return Array.isArray(list) ? list : []
}

export function fileExists(p) {
  return existsSync(p)
}
