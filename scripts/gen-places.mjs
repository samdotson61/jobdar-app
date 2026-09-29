// Generate lib/places_data.mjs — the offline place table parseLocation() uses to place job locations its
// state/metro rules can't (1.65.0). Source: GeoNames (https://www.geonames.org, CC BY 4.0 — attribution in
// NOTICE): cities5000 (+ admin1CodesASCII, countryInfo). Keyless and offline at runtime — the table ships
// with the code, so placing a location never touches the network.
//
//   node scripts/gen-places.mjs [dir]   dir = where cities5000.txt, admin1CodesASCII.txt, countryInfo.txt
//                                        live (default: download them into a temp dir)
//
// Output (two compact strings, parsed lazily):
//   US  — "name:ST,ST;…"  every US place ≥ 5,000 people → its state(s), most populous first
//   FOREIGN — "name;…"    non-US places ≥ 15,000 people + non-US first-level regions + country names
// A name in both lists goes to the side whose biggest place is ≥ 20× the other's ("paris" → foreign,
// "kettering" → OH); otherwise US wins (US postings dominate what Jobdar scans).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(here, '..', 'lib', 'places_data.mjs')
let dir = process.argv[2]
if (!dir) {
  dir = mkdtempSync(path.join(os.tmpdir(), 'geonames-'))
  for (const f of ['cities5000.zip', 'admin1CodesASCII.txt', 'countryInfo.txt']) {
    execFileSync('curl', ['-fsSL', '-o', path.join(dir, f), `https://download.geonames.org/export/dump/${f}`])
  }
  execFileSync('unzip', ['-o', '-q', path.join(dir, 'cities5000.zip'), '-d', dir])
}
for (const f of ['cities5000.txt', 'admin1CodesASCII.txt', 'countryInfo.txt']) {
  if (!existsSync(path.join(dir, f))) throw new Error(`missing ${f} in ${dir}`)
}

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim()
// Words that show up in location strings but aren't places — never table keys.
const STOP = new Set(['remote', 'hybrid', 'onsite', 'on site', 'office', 'home', 'field', 'virtual', 'various', 'multiple', 'anywhere', 'nationwide', 'headquarters', 'hq', 'north', 'south', 'east', 'west', 'central', 'united states', 'usa', 'us', 'none', 'other', 'global', 'worldwide', 'distributed', 'flexible', 'travel', 'corporate', 'campus', 'downtown', 'midwest', 'northeast', 'southeast', 'southwest'])
const ok = (n) => n.length >= 3 && !STOP.has(n) && !/\d/.test(n)

const us = new Map() // name → Map(state → pop)
const foreign = new Map() // name → pop
for (const line of readFileSync(path.join(dir, 'cities5000.txt'), 'utf8').split('\n')) {
  const c = line.split('\t')
  if (c.length < 15) continue
  const pop = Number(c[14]) || 0
  const names = new Set([norm(c[1]), norm(c[2])].filter(ok))
  if (c[8] === 'US') {
    const st = c[10]
    if (!/^[A-Z]{2}$/.test(st)) continue
    for (const n of names) {
      if (!us.has(n)) us.set(n, new Map())
      const m = us.get(n)
      m.set(st, Math.max(m.get(st) || 0, pop))
    }
  } else if (pop >= 15000) {
    for (const n of names) foreign.set(n, Math.max(foreign.get(n) || 0, pop))
  }
}
// Non-US first-level regions ("Silesia", "Bavaria", "Ontario") and country names — foreign whenever no
// US place of that name exists (a region has no population here, so it never outranks a US city).
const regionNames = new Set()
const countryNames = new Set()
for (const line of readFileSync(path.join(dir, 'admin1CodesASCII.txt'), 'utf8').split('\n')) {
  const [code, name, ascii] = line.split('\t')
  if (!code || code.startsWith('US.')) continue
  for (const n of [norm(name), norm(ascii)]) if (ok(n)) regionNames.add(n)
}
for (const line of readFileSync(path.join(dir, 'countryInfo.txt'), 'utf8').split('\n')) {
  if (line.startsWith('#')) continue
  const c = line.split('\t')
  if (c.length < 5 || c[0] === 'US') continue
  const n = norm(c[4])
  if (ok(n)) countryNames.add(n)
}

// A location that names a COUNTRY is foreign, even when a US town shares the name ("São Paulo, Brazil"
// is not Brazil, IN; "Mexico City, Mexico" is not Mexico, MO) — country names never map to a US state.
for (const n of countryNames) us.delete(n)
// Short forms postings use that the ≥3-letter / GeoNames names miss.
const ALIASES = ['uk', 'uae', 'emea', 'apac', 'apj', 'latam', 'eu']
const usOut = []
const foreignOut = []
for (const [n, states] of us) {
  const usMax = Math.max(...states.values())
  if ((foreign.get(n) || 0) >= 20 * Math.max(usMax, 1)) continue // far bigger abroad → foreign
  const list = [...states].sort((a, b) => b[1] - a[1]).map(([s]) => s)
  usOut.push(`${n}:${list.join(',')}`)
}
for (const [n, pop] of foreign) {
  const usMax = us.has(n) ? Math.max(...us.get(n).values()) : 0
  if (pop >= 20 * Math.max(usMax, 1)) foreignOut.push(n)
}
for (const n of regionNames) if (!us.has(n) && !foreign.has(n)) foreignOut.push(n)
for (const n of [...countryNames, ...ALIASES]) if (!foreignOut.includes(n)) foreignOut.push(n)
usOut.sort()
foreignOut.sort()
if (usOut.some((e) => e.includes(';')) || foreignOut.some((e) => e.includes(';'))) throw new Error('separator in a name')

writeFileSync(out, `// GENERATED by scripts/gen-places.mjs — do not edit. Place names from GeoNames (geonames.org, CC BY 4.0).
// ${usOut.length} US places (≥ 5,000 people) → state(s), most populous first; ${foreignOut.length} non-US places (≥ 15,000),
// regions and countries. Built ${new Date().toISOString().slice(0, 10)}.
export const US_PLACES = ${JSON.stringify(usOut.join(';'))}
export const FOREIGN_PLACES = ${JSON.stringify(foreignOut.join(';'))}
`)
console.log(`wrote ${path.relative(process.cwd(), out)}: ${usOut.length} US, ${foreignOut.length} foreign`)
