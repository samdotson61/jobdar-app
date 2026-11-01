// Jobdar tests — 1.64.3 Windows drive-test fixes, 1.65 levels/places, desktop build guard, Greenhouse dates, caps, portalsForScan.
// Run with `npm test`; `npm test -- windows-fixes` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { ROOT as PKG_ROOT } from '../lib/config.mjs'
import { capNewest } from '../providers/_contract.mjs'
import jibe from '../providers/jibe.mjs'
import greenhouse, { parseJobUrl as parseGhJobUrl } from '../providers/greenhouse.mjs'
import { levelDecision, filterByLevel } from '../lib/levels.mjs'
import { locationMatches, regionForLocation, parseLocation } from '../lib/regions.mjs'
import { capScanned } from '../lib/evaluations.mjs'
import { portalsForScan, employersToPortals } from '../lib/portals_pure.mjs'
import http from 'node:http'
import { relevanceScore, termsFromResume } from '../lib/search.mjs'

// ── 1.64.3: fixes from the first Windows drive-test ──────────────────────────────────────────────────
// Uploaded résumés (docparse output) carry roles as PLAIN lines under "## Experience" and state their
// target in prose — the two personas below are the drive-test résumés, as the upload path structures them.
const MAYA_CV = `# Maya Torres
Cincinnati, OH · maya.torres.example@example.com · (513) 555-0142
## Summary
Recent marketing graduate who turns data into campaigns. Comfortable with Excel, Google Analytics and social media scheduling tools; bilingual English/Spanish. Looking for an entry-level marketing coordinator or marketing analyst role.
## Education
University of Cincinnati — B.B.A. in Marketing, minor in Business Analytics, May 2026 · GPA 3.5
## Experience
Marketing Intern — Cincinnati Food Bank Network, Cincinnati, OH · Jan 2026 – May 2026
Planned and scheduled 60+ social posts across Instagram, Facebook and LinkedIn.
Barista — Coffee Emporium, Cincinnati, OH · Jun 2022 – Aug 2024
## Skills
Excel (pivot tables, VLOOKUP), Canva, Hootsuite, Mailchimp, Tableau`
const DEREK_CV = `# Derek Wallace
Columbus, OH · derek.wallace.example@example.com · (614) 555-0187
## Summary
Dependable warehouse and retail team lead with six years of hands-on experience in shipping, receiving and inventory. Forklift certified, OSHA 10. No college degree — I learn fast on the job. Looking for a warehouse lead, inventory control, or logistics coordinator role, or a paid apprenticeship.
## Experience
Shift Lead — Kroger, Columbus, OH · Mar 2023 – Present
- Lead a crew of 8 on the overnight stocking shift.
Warehouse Associate — Amazon Fulfillment Center, Etna, OH · Jun 2019 – Feb 2023
## Skills
Inventory control, shipping and receiving, forklift and pallet jack, RF scanners, scheduling`

test('1.64.3 targeting: an UPLOADED résumé yields title phrases — its stated target roles first, then plain-line experience titles', async () => {
  const { targetRolesFromResume } = await import('../lib/search.mjs')
  assert.deepEqual(targetRolesFromResume(MAYA_CV), ['marketing coordinator', 'marketing analyst'])
  assert.deepEqual(targetRolesFromResume(DEREK_CV), ['warehouse lead', 'inventory control', 'logistics coordinator', 'apprenticeship'])
  const m = termsFromResume(MAYA_CV)
  assert.deepEqual(m.titles.slice(0, 4), ['marketing coordinator', 'marketing analyst', 'marketing intern', 'barista'])
  const d = termsFromResume(DEREK_CV)
  assert.ok(d.titles.includes('shift lead') && d.titles.includes('warehouse associate'), d.titles.join('|'))
  assert.ok(!d.titles.some((t) => /lead a crew/.test(t)), 'bullets are accomplishments, not roles')
  // identity + school never become domain keywords (the name heading, the Education line's city)
  for (const w of ['maya', 'torres', 'university', 'cincinnati', 'paid']) assert.ok(!m.keywords.includes(w) && !d.keywords.includes(w), `keyword leak: ${w}`)
})

test('1.64.3 relevance tiers: each persona ranks their own lane — the other person\'s roles and generic ones are tier 0; never the location', async () => {
  const { relevanceTier, relevanceText } = await import('../lib/search.mjs')
  const maya = { ...termsFromResume(MAYA_CV), fromResume: true }
  const derek = { ...termsFromResume(DEREK_CV), fromResume: true }
  const tier = (role, terms, company = 'Fifth Third Bank', location = 'Cincinnati, OH') => relevanceTier(relevanceText({ role, company, location }, terms), terms)
  assert.equal(tier('Marketing Coordinator', maya), 2)
  assert.equal(tier('Social Media Coordinator', maya), 1)
  for (const r of ['Machine Operator', 'Vault Teller I M-F 11am-4pm', 'Securities Analyst I - Ops', 'Warehouse Lead - 2nd Shift', 'FC Cincinnati Ticketing Sales & Service']) assert.equal(tier(r, maya), 0, r)
  assert.equal(tier('Enterprise Logistics Coordinator', derek), 2)
  assert.equal(tier('Warehouse Lead - 2nd Shift', derek), 2)
  assert.equal(tier('Forklift Operator', derek), 1, 'one SPECIFIC keyword (8+ letters) is a real match')
  for (const r of ['Social Media Coordinator', 'Marketing Analyst', 'Machine Operator', 'Product Manager- Data Domain (P4410)', 'Certified Nursing Assistant', 'Scheduling Specialist', 'Certified Medical Assistant in Training']) assert.equal(tier(r, derek), 0, r) // "Forklift certified" ≠ a CNA lane
  // résumé mode judges the title only; a typed intent may name an employer; the location never counts
  assert.equal(relevanceText({ role: 'Teller', company: 'Fifth Third Bank', location: 'Columbus, OH' }, maya), 'Teller')
  assert.equal(relevanceText({ role: 'Teller', company: 'Fifth Third Bank', location: 'Columbus, OH' }, { keywords: ['bank'] }), 'Teller Fifth Third Bank')
  assert.equal(relevanceTier('Teller Fifth Third Bank', { keywords: ['bank'], titles: [], exclude: [] }), 1, 'a typed one-word intent: one hit counts')
  // relevanceScore is unchanged (the Search tab's within-tier order)
  assert.equal(relevanceScore('Marketing Coordinator', maya) > relevanceScore('Social Media Coordinator', maya), true)
})

test('1.64.3 AI download ETA: withheld until the transfer has run 8 s AND moved 1% (no "about 2195 min left" at 0%)', async () => {
  const { settledEta } = await import('../lib/winc_manager.mjs')
  assert.equal(settledEta(131700, 0, 1000), null)
  assert.equal(settledEta(131700, 0, 20000), null, '0% is never settled')
  assert.equal(settledEta(90, 5, 3000), null, 'too early')
  assert.equal(settledEta(90, 5, 9000), 90)
  assert.equal(settledEta(null, 50, 60000), null)
})

test('1.64.3 AI files: unused DFlash head + projector are reclaimed ONLY from an AI home this app created', async () => {
  const { removeUnusedAiFiles, MANAGED_UNUSED_FILES, MANAGED_MODEL_FILE } = await import('../lib/winc_manager.mjs')
  const mk = (toml) => {
    const home = mkdtempSync(path.join(tmpdir(), 'jobdar-ai-'))
    mkdirSync(path.join(home, 'models'))
    for (const f of [MANAGED_MODEL_FILE, ...MANAGED_UNUSED_FILES, `${MANAGED_UNUSED_FILES[1]}.part`]) writeFileSync(path.join(home, 'models', f), 'x')
    if (toml != null) writeFileSync(path.join(home, 'winc.toml'), toml)
    return home
  }
  const own = mk('# Written by Jobdar Desktop — the app\'s private AI server.\n[general]\nport = 43211\n')
  assert.deepEqual(removeUnusedAiFiles(own).sort(), [...MANAGED_UNUSED_FILES, `${MANAGED_UNUSED_FILES[1]}.part`].sort())
  assert.deepEqual(readdirSync(path.join(own, 'models')), [MANAGED_MODEL_FILE], 'the model itself stays')
  const theirs = mk('[general]\nport = 8080\n') // someone's own winc home (JOBDAR_WINC_HOME) — vision wanted there
  assert.deepEqual(removeUnusedAiFiles(theirs), [])
  const none = mk(null)
  assert.deepEqual(removeUnusedAiFiles(none), [])
  assert.equal(readdirSync(path.join(theirs, 'models')).length, 4)
  for (const h of [own, theirs, none]) rmSync(h, { recursive: true, force: true })
})

test('1.64.3 AI relaunch: setup() reports "starting" synchronously when the model is on disk (a GUI loading during the adopt probe follows it)', async () => {
  const { createWincManager, MANAGED_MODEL_FILE } = await import('../lib/winc_manager.mjs')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-ai-'))
  mkdirSync(path.join(home, 'models'))
  writeFileSync(path.join(home, 'models', MANAGED_MODEL_FILE), 'x')
  let release
  const slow = new Promise((r) => { release = r })
  const mgr = createWincManager({ bin: '/app/winc', home, port: 43295, url: 'http://127.0.0.1:43295' }, { spawn: () => { throw new Error('not reached') }, health: async () => { await slow; return true } })
  assert.equal(mgr.setup().phase, 'starting', 'in flight before the adopt probe resolves')
  release()
  for (let i = 0; i < 200 && mgr.status().phase !== 'ready'; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(mgr.status().phase, 'ready', 'adopted the already-running server')
  rmSync(home, { recursive: true, force: true })
})

test('levels: entry-level roles are never filtered out — mid/senior selections ADD roles (1.65.0)', () => {
  const d = levelDecision('Logistics Coordinator I', ['mid'])
  assert.equal(d.include, true, 'an auto-detected Mid must not hide entry roles (the résumé\'s own stated target)')
  assert.equal(levelDecision('Entry Level Marketing Coordinator', ['senior']).include, true)
  assert.equal(filterByLevel([{ title: 'Junior Analyst' }, { title: 'Senior Staff Engineer' }], ['mid']).kept.map((j) => j.title).join(), 'Junior Analyst')
  assert.equal(levelDecision('Senior Staff Engineer', ['entry']).include, false, 'senior stays opt-in')
})

test('regions: the offline place table places towns the state/metro rules miss, marks foreign ones, never drops a US match on a guess (1.65.0)', async () => {
  const { parseLocation, locationMatches, regionForLocation } = await import('../lib/regions.mjs')
  assert.deepEqual(parseLocation('Beavercreek').usStates, ['OH'])
  assert.equal(parseLocation('Beavercreek').placed, true)
  assert.equal(regionForLocation('Greater Cincinnati Area'), 'midwest')
  for (const f of ['Sosnowiec, Silesian', 'Munich, Bavarian', 'Hamburg, Germany', 'London', 'Paris']) {
    assert.equal(parseLocation(f).foreign, true, f)
    assert.equal(locationMatches(f, ['midwest']), false, f)
  }
  // shared US names: every candidate state is kept, so a role matches if ANY is in the region
  assert.ok(parseLocation('Springfield').usStates.includes('IL'))
  assert.equal(locationMatches('Dayton', ['midwest']), true)
  assert.equal(locationMatches('Newport', ['northeast']), true) // RI
  // US-state evidence still wins, and truly unknown strings are still kept
  assert.deepEqual(parseLocation('London, KY').usStates, ['KY'])
  // a named COUNTRY is never a same-named US town (the audit's São Paulo → IN, Mexico City → MO)
  for (const f of ['São Paulo, São Paulo, Brazil', 'Mexico City, Mexico', 'UK', 'Remote in APJ Region']) {
    assert.deepEqual(parseLocation(f).usStates, [], f)
    assert.equal(parseLocation(f).foreign, true, f)
  }
  assert.deepEqual(parseLocation('Brazil, IN').usStates, ['IN'])
  assert.deepEqual(parseLocation('DMV Area').usStates, ['DC'])
  assert.equal(locationMatches('Remote', ['midwest']), true)
  assert.equal(locationMatches('2 Locations', ['midwest']), true)
})

test('1.65.1 AI triage filler: laneScore ignores generic words — "Forklift certified" no longer buys "Certified Nursing Assistant" an AI read', async () => {
  const { laneScore, relevanceScore } = await import('../lib/search.mjs')
  const derek = { ...termsFromResume(DEREK_CV), fromResume: true }
  for (const r of ['Certified Nursing Assistant - Night Shifts', 'Certified Medical Assistant (CMA/RMA)', 'Certified Surgical Tech']) {
    assert.ok(relevanceScore(r, derek) > 0, `precondition: the old filler score liked ${r}`)
    assert.equal(laneScore(r, derek), 0, r)
  }
  for (const r of ['Warehouse Lead', 'Inventory Technician', 'Shipping & Receiving Clerk', 'Pharmacy Warehouse Technician']) assert.ok(laneScore(r, derek) > 0, r)
  // a typed intent is the user's own words — nothing discounted
  assert.ok(laneScore('Certified Nursing Assistant', { keywords: ['certified', 'nursing'], titles: [], exclude: [] }) > 0)
  assert.equal(laneScore('anything', null), 0)
})

test('1.65.1 desktop build: Windows installers are refused off Windows (Mac-built NSIS uninstaller fails its integrity check); the upgrade hook is wired', async () => {
  const require = (await import('node:module')).createRequire(import.meta.url)
  const afterPack = require('../apps/desktop/after-pack.cjs').default
  const real = Object.getOwnPropertyDescriptor(process, 'platform')
  try {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    await assert.rejects(afterPack({ electronPlatformName: 'win32' }), /must be built on Windows/)
    Object.defineProperty(process, 'platform', { value: 'win32' })
    assert.equal(await afterPack({ electronPlatformName: 'win32' }), undefined, 'on Windows the Windows build proceeds')
  } finally {
    Object.defineProperty(process, 'platform', real)
  }
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'apps/desktop/package.json'), 'utf8'))
  assert.equal(pkg.build.nsis.include, 'installer.nsh')
  const nsh = readFileSync(path.join(PKG_ROOT, 'apps/desktop/installer.nsh'), 'utf8')
  assert.match(nsh, /!macro customUnInstallCheckCurrentUser/)
  assert.match(nsh, /!macro customUnInstallCheck\b/)
  for (const s of ['dist', 'dist:win', 'dist:mac']) assert.equal(pkg.scripts[s], 'node dist-native.mjs', s)
  assert.match(pkg.scripts['dist:all'], /dist-native\.mjs/)
  assert.ok(!/--win/.test(pkg.scripts['dist:all']), 'dist:all never cross-builds Windows')
})

test('greenhouse: a posting is dated by first_published, not by its last edit', async () => {
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ jobs: [
    { title: 'A', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/1', location: { name: 'Omaha, NE' }, first_published: '2025-05-01T10:00:00-04:00', updated_at: '2026-10-01T10:00:00-04:00' },
    { title: 'B', absolute_url: 'https://job-boards.greenhouse.io/acme/jobs/2', location: { name: 'Omaha, NE' }, updated_at: '2026-09-20T10:00:00-04:00' },
  ] }) })
  try {
    const jobs = await greenhouse.fetch(greenhouse.detect({ company: 'Acme', careers_url: 'https://job-boards.greenhouse.io/acme' }))
    assert.equal(jobs[0].postedOn.slice(0, 10), '2025-05-01')
    assert.equal(jobs[1].postedOn.slice(0, 10), '2026-09-20') // no first_published → the edit date is all there is
    // a role published under the employer's own site is listed under Greenhouse's job URL, so its JD has a route
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ jobs: [{ id: 6093747004, title: 'C', absolute_url: 'https://www.acme.com/careers/jobs/?gh_jid=6093747004', location: { name: 'Omaha, NE' } }] }) })
    const custom = await greenhouse.fetch(greenhouse.detect({ company: 'Acme', careers_url: 'https://job-boards.greenhouse.io/acme' }))
    assert.equal(custom[0].url, 'https://job-boards.greenhouse.io/acme/jobs/6093747004')
    assert.deepEqual(parseGhJobUrl(custom[0].url), { token: 'acme', id: '6093747004' })
  } finally {
    globalThis.fetch = realFetch
  }
})

test('capNewest: a board over the size limit keeps its newest postings and is marked incomplete', () => {
  const dated = [{ url: 'a', postedOn: '2026-01-01' }, { url: 'b', postedOn: '2026-10-01T08:00:00Z' }, { url: 'c', postedOn: '2026-06-01' }]
  const out = capNewest(dated, 2)
  assert.deepEqual(out.map((j) => j.url), ['b', 'c'])
  assert.equal(out.incomplete, true)
  assert.equal(capNewest(dated, 5), dated) // under the limit → untouched
  const undated = [{ url: 'x', postedOn: 'Posted Today' }, { url: 'y', postedOn: 'Posted 3 Days Ago' }, { url: 'z' }]
  assert.deepEqual(capNewest(undated, 2).map((j) => j.url), ['x', 'y']) // no real dates → the board's own order
})

test('capScanned: the saved list is bounded — unseen roles go first, then an even share per employer; your work is never dropped', () => {
  const row = (company, n, extra = {}) => ({ company, role: `R${n}`, url: `https://x/${company}/${n}`, status: 'scanned', score: '', first_seen: '2026-10-01', prescreen: '', screen_reason: '', aliases: '', ...extra })
  const acme = Array.from({ length: 6 }, (_, i) => row('Acme', i))
  const bolt = Array.from({ length: 2 }, (_, i) => row('Bolt', i))
  const old = row('Gone', 0, { first_seen: '2026-08-01' })
  const mine = [row('Gone', 1, { status: 'evaluated', score: '4.2' }), row('Gone', 2, { status: 'applied', score: '4.5' })]
  const all = [...acme, ...bolt, old, ...mine]
  assert.equal(capScanned(all, 9).dropped, 0) // 9 untouched → at the limit, nothing goes
  const active = new Set([...acme, ...bolt].map((r) => r.url))
  // one over: the role no board showed this scan is the one to go
  const a = capScanned(all, 8, active)
  assert.equal(a.dropped, 1)
  assert.ok(!a.rows.includes(old))
  // boards alone exceed the limit: each employer keeps an even share, a prescreen fit first, a screened role last
  acme[5].prescreen = '82'
  acme[0].prescreen = '0'
  acme[0].screen_reason = 'years: "7+ years"'
  const b = capScanned(all, 4, active)
  const kept = b.rows.filter((r) => r.status === 'scanned').map((r) => `${r.company}${r.role}`)
  assert.deepEqual(kept.sort(), ['AcmeR1', 'AcmeR5', 'BoltR0', 'BoltR1'])
  assert.equal(b.rows.filter((r) => r.status !== 'scanned').length, 2) // evaluated + applied untouched
  // stable: the kept rows survive a later scan that re-finds the dropped ones as new
  const again = capScanned([...b.rows, row('Acme', 2, { first_seen: '2026-10-02' }), row('Acme', 3, { first_seen: '2026-10-02' })], 4, active)
  assert.deepEqual(again.rows.filter((r) => r.status === 'scanned').map((r) => `${r.company}${r.role}`).sort(), ['AcmeR1', 'AcmeR5', 'BoltR0', 'BoltR1'])
})

test('portalsForScan: every scan reads the catalog for the regions ASKED FOR plus the person’s own boards (region switch, 1.67.4)', () => {
  const employers = [
    { company: 'Hudl', careers_url: 'https://job-boards.greenhouse.io/hudl', region: 'midwest' },
    { company: 'Medpace', careers_url: 'https://careers.medpace.com/jobs', provider: 'jibe', region: 'midwest' },
    { company: 'Salesforce', careers_url: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site', region: 'west' },
  ]
  const own = { company: 'Local Shop', careers_url: 'https://jobs.lever.co/localshop' }
  // first scan: West → the West catalog; saved as-is (zero-config parity)
  const first = portalsForScan([], employers, ['west'])
  assert.deepEqual(first.map((p) => p.company), ['Salesforce'])
  // the person switches to the Midwest: the Midwest catalog is read, not the saved West list
  const saved = [...first, own]
  const second = portalsForScan(saved, employers, ['midwest'])
  assert.deepEqual(second.map((p) => p.company), ['Hudl', 'Medpace', 'Local Shop'])
  assert.equal(second[1].provider, 'jibe') // catalog provider/site fields carry over
  // nationwide (or no region) = the whole catalog + own; nothing duplicated
  assert.deepEqual(portalsForScan(saved, employers, ['nationwide']).map((p) => p.company), ['Hudl', 'Medpace', 'Salesforce', 'Local Shop'])
  assert.equal(portalsForScan([...saved, { company: 'dup', careers_url: 'HTTPS://JOBS.LEVER.CO/localshop' }], employers, []).filter((p) => /localshop/i.test(p.careers_url)).length, 1)
  assert.deepEqual(employersToPortals(employers)[1], { company: 'Medpace', careers_url: 'https://careers.medpace.com/jobs', provider: 'jibe' })
})
