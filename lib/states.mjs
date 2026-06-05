// Jobdar — application states (Phase 1.4).
// Canonical state IDs are English and stable. On input we accept the English ID, either
// localized label, or a configured alias (Spanish + common variants). On output we surface
// the label for the active language. Data is stored by canonical ID.

import { readFileSync, existsSync } from 'node:fs'
import yaml from 'js-yaml'
import { paths } from './config.mjs'

let _states

function load() {
  if (_states) return _states
  const data = existsSync(paths.states) ? yaml.load(readFileSync(paths.states, 'utf8')) : null
  const list = data && Array.isArray(data.states) ? data.states : []
  _states = list.map((s) => ({
    id: s.id,
    label: { en: (s.label && s.label.en) || s.id, es: (s.label && s.label.es) || s.id },
    aliases: Array.isArray(s.aliases) ? s.aliases : [],
  }))
  return _states
}

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase()

export function allStates() {
  return load().slice()
}

// Resolve any accepted input form to a canonical English ID, or null if unknown.
export function resolveState(input) {
  const q = norm(input)
  if (!q) return null
  for (const s of load()) {
    if (norm(s.id) === q) return s.id
    if (norm(s.label.en) === q || norm(s.label.es) === q) return s.id
    if (s.aliases.some((a) => norm(a) === q)) return s.id
  }
  return null
}

// Localized label for a canonical ID; returns the input unchanged if it isn't a known state.
export function stateLabel(id, lang = 'en') {
  const s = load().find((x) => x.id === id)
  if (!s) return id
  return s.label[lang] || s.label.en || id
}
