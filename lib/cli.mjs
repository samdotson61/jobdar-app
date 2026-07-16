// Jobfaro — shared CLI helpers: flag parsing, language resolution, version, and
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

// Language precedence: --lang/--language flag > JOBFARO_LANG > profile > 'en'.
export function resolveLang(flags, profile) {
  const cand =
    flags.lang || flags.language || process.env.JOBFARO_LANG || (profile && profile.language) || 'en'
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
