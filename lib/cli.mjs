// Jobdar — shared CLI helpers: flag parsing, language resolution, version, and
// the "am I being run directly?" check used by scan.mjs / doctor.mjs.

import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { ROOT, SUPPORTED_LANGUAGES } from './config.mjs'

// Minimal flag parser: supports `--key val`, `--key=val`, boolean `--flag`,
// `--` passthrough, and grouped short booleans (`-h`). Everything else is a
// positional. A lone `-` is treated as a positional (e.g. `eval -` for stdin).
export function parseFlags(argv) {
  const flags = {}
  const positionals = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=')
      if (eq !== -1) {
        flags[a.slice(2, eq)] = a.slice(eq + 1)
      } else {
        const key = a.slice(2)
        const next = argv[i + 1]
        if (next != null && !next.startsWith('-')) {
          flags[key] = next
          i++
        } else {
          flags[key] = true
        }
      }
    } else if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) flags[ch] = true
    } else {
      positionals.push(a)
    }
  }
  return { flags, positionals }
}

// A list flag's value → tokens (1.71.0). Splits on commas AND whitespace: PowerShell reads an unquoted
// `--levels entry,mid` as an array and the npm .ps1 shim re-joins it with a SPACE, so a comma-only split
// saw one bogus token "entry mid". `sep: ';'` is for --metro, whose values contain ", " themselves.
// Lower-cases unless `keepCase`. Pure.
export function splitList(value, { sep, keepCase = false } = {}) {
  if (value == null || value === true || value === false) return []
  const parts = Array.isArray(value) ? value.map(String) : [String(value)]
  return parts.flatMap((p) => (sep ? p.split(sep) : p.split(/[\s,]+/))).map((s) => s.trim()).filter(Boolean).map((s) => (keepCase ? s : s.toLowerCase()))
}

// Tokens of `list` not in `known` (case-insensitive). Pure. Callers print the bad tokens and exit 1 —
// an unknown level/region/sector must never be written to profile.yml or silently match nothing.
export function unknownTokens(list, known) {
  const k = new Set([...(known || [])].map((s) => String(s).toLowerCase()))
  return (list || []).filter((s) => !k.has(String(s).toLowerCase()))
}

// Language precedence: --lang/--language flag > JOBDAR_LANG > profile > 'en'.
export function resolveLang(flags, profile) {
  const cand =
    flags.lang || flags.language || process.env.JOBDAR_LANG || (profile && profile.language) || 'en'
  return SUPPORTED_LANGUAGES.includes(cand) ? cand : 'en'
}

export function isDirectRun(metaUrl) {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(metaUrl)
  } catch {
    return false
  }
}

let _version
export function readVersion() {
  if (_version) return _version
  try {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    _version = pkg.version || '0.0.0'
  } catch {
    _version = '0.0.0'
  }
  return _version
}
