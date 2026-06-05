// Jobdar — test runner (zero dependencies). Run with `npm test`.
// Covers the foundation + bilingual core: i18n parity & interpolation, shipped defaults,
// the provider registry / Greenhouse detect(), EN<->ES modes parity, and state aliases.

import { strict as assert } from 'node:assert'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStrings, listKeys, getT } from './lib/i18n.mjs'
import { PROFILE_DEFAULTS, SUPPORTED_LANGUAGES } from './lib/config.mjs'
import { resolveProvider, providerIds } from './providers/_contract.mjs'
import greenhouse from './providers/greenhouse.mjs'
import { resolveState, stateLabel, allStates } from './lib/states.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const tests = []
const test = (name, fn) => tests.push({ name, fn })

test('i18n: en and es expose the exact same key set', () => {
  const en = listKeys(getStrings('en')).sort()
  const es = listKeys(getStrings('es')).sort()
  const onlyEn = en.filter((k) => !es.includes(k))
  const onlyEs = es.filter((k) => !en.includes(k))
  assert.deepEqual(onlyEn, [], `keys missing from es: ${onlyEn.join(', ')}`)
  assert.deepEqual(onlyEs, [], `keys missing from en: ${onlyEs.join(', ')}`)
})

test('i18n: translator interpolates vars and falls back to the key', () => {
  const t = getT('en')
  assert.equal(t('scan.portals_count', { count: 3 }), 'Portals configured: 3')
  assert.equal(t('definitely.missing.key'), 'definitely.missing.key')
})

test('i18n: both supported languages load non-empty tables', () => {
  for (const l of SUPPORTED_LANGUAGES) assert.ok(Object.keys(getStrings(l)).length > 0, `empty: ${l}`)
})

test('defaults: Midwest region, entry level, English', () => {
  assert.deepEqual(PROFILE_DEFAULTS.target_regions, ['midwest'])
  assert.deepEqual(PROFILE_DEFAULTS.target_levels, ['entry'])
  assert.equal(PROFILE_DEFAULTS.language, 'en')
})

test('greenhouse: detect parses the board token from a careers_url', () => {
  assert.equal(greenhouse.detect({ company: 'Acme', careers_url: 'https://boards.greenhouse.io/acme' }).token, 'acme')
  assert.equal(greenhouse.detect({ careers_url: 'https://job-boards.greenhouse.io/globex' }).token, 'globex')
  assert.equal(greenhouse.detect({ careers_url: 'https://example.com/careers' }), null)
})

test('registry: resolveProvider routes Greenhouse URLs and rejects unknowns', () => {
  const hit = resolveProvider({ company: 'Acme', careers_url: 'https://boards.greenhouse.io/acme' })
  assert.ok(hit && hit.provider.id === 'greenhouse')
  assert.equal(resolveProvider({ company: 'X', careers_url: 'https://unknown.example/jobs' }), null)
})

test('registry: greenhouse is registered', () => {
  assert.ok(providerIds().includes('greenhouse'))
})

test('modes: every base mode has a Spanish parity file', () => {
  const modesDir = path.join(ROOT, 'modes')
  const base = readdirSync(modesDir).filter((f) => f.endsWith('.md'))
  assert.ok(base.length >= 6, `expected the base modes, found ${base.length}`)
  const missing = base.filter((f) => !existsSync(path.join(modesDir, 'es', f)))
  assert.deepEqual(missing, [], `Spanish modes missing: ${missing.join(', ')}`)
})

test('states: Spanish + variant aliases resolve to canonical English IDs', () => {
  assert.equal(resolveState('postulado'), 'applied')
  assert.equal(resolveState('Applied'), 'applied')
  assert.equal(resolveState('aplicar'), 'applied')
  assert.equal(resolveState('entrevistando'), 'interviewing')
  assert.equal(resolveState('rechazado'), 'rejected')
  assert.equal(resolveState('evaluated'), 'evaluated')
  assert.equal(resolveState('garbage-not-a-state'), null)
})

test('states: labels are localized; IDs are stable lowercase English', () => {
  assert.equal(stateLabel('applied', 'en'), 'Applied')
  assert.equal(stateLabel('applied', 'es'), 'Postulado')
  assert.equal(stateLabel('unknown', 'es'), 'unknown')
  assert.ok(allStates().every((s) => s.id === s.id.toLowerCase()))
})

let passed = 0
let failed = 0
for (const { name, fn } of tests) {
  try {
    await fn()
    passed++
    console.log(`ok   ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL ${name}\n     ${err.message}`)
  }
}
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
