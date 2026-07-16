// Jobfaro — internationalization.
// All user-facing display strings live in config/i18n/{en,es}.yml, never baked
// into code (design rule, Phase 1.3). getT(lang) returns a translator that falls
// back to English and then to the key itself, so a missing string is visible but
// never crashes.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { paths, SUPPORTED_LANGUAGES } from './config.mjs'

const cache = new Map()

function load(lang) {
  if (cache.has(lang)) return cache.get(lang)
  const file = path.join(paths.i18nDir, `${lang}.yml`)
  const data = existsSync(file) ? yaml.load(readFileSync(file, 'utf8')) || {} : {}
  cache.set(lang, data)
  return data
}

function get(obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

function interpolate(str, vars) {
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

export function getStrings(lang) {
  const l = SUPPORTED_LANGUAGES.includes(lang) ? lang : 'en'
  return load(l)
}

// Translator. Resolves `a.b.c` dotted keys; interpolates {placeholders}.
export function getT(lang) {
  const primary = getStrings(lang)
  const fallback = getStrings('en')
  return function t(key, vars = {}) {
    const val = get(primary, key) ?? get(fallback, key) ?? key
    return interpolate(val, vars)
  }
}

// Flatten a strings object to dotted leaf keys — used by the i18n parity test.
export function listKeys(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj || {})) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) keys.push(...listKeys(v, full))
    else keys.push(full)
  }
  return keys
}
