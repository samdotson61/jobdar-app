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
import workday, { HOST_ALLOWLIST as WORKDAY_HOSTS, parseWorkdayUrl } from './providers/workday.mjs'
import icims, { HOST_ALLOWLIST as ICIMS_HOSTS, parseJobPostingsFromHtml } from './providers/icims.mjs'
import { assertAllowedUrl } from './lib/http.mjs'
import { resolveState, stateLabel, allStates } from './lib/states.mjs'
import { classifyTitle, levelDecision, filterByLevel } from './lib/levels.mjs'
import { regionStateSet, locationMatches, filterByLocation } from './lib/regions.mjs'
import { selectEmployers, toPortals } from './lib/seed.mjs'
import { parseResumeText } from './lib/resume.mjs'

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

test('registry: greenhouse and workday are registered', () => {
  assert.ok(providerIds().includes('greenhouse'))
  assert.ok(providerIds().includes('workday'))
})

test('workday: detect parses tenant/shard/site; explicit site wins; rejects non-Workday', () => {
  const m = workday.detect({ company: 'Acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/en-US/External' })
  assert.equal(m.tenant, 'acme')
  assert.equal(m.shard, 'wd5')
  assert.equal(m.site, 'External') // locale segment "en-US" ignored
  assert.equal(parseWorkdayUrl('https://beta.wd101.myworkdayjobs.com').shard, 'wd101') // any shard
  const explicit = workday.detect({ company: 'B', careers_url: 'https://beta.wd1.myworkdayjobs.com', site: 'careers' })
  assert.equal(explicit.site, 'careers')
  assert.equal(workday.detect({ careers_url: 'https://boards.greenhouse.io/acme' }), null)
})

test('workday: SSRF guard allows Workday hosts, rejects others and non-HTTPS', () => {
  assert.ok(assertAllowedUrl('https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/External/jobs', { hostAllowlist: WORKDAY_HOSTS }))
  assert.throws(() => assertAllowedUrl('https://evil.example.com/wday/cxs/x/y/jobs', { hostAllowlist: WORKDAY_HOSTS }))
  assert.throws(() => assertAllowedUrl('http://acme.wd5.myworkdayjobs.com/x', { hostAllowlist: WORKDAY_HOSTS }))
})

test('workday: POST pagination accumulates across pages and normalizes postings', async () => {
  const realFetch = globalThis.fetch
  const mkPage = (start, n, total) => ({
    total,
    jobPostings: Array.from({ length: n }, (_, i) => ({
      title: `Role ${start + i}`,
      externalPath: `/job/r${start + i}`,
      locationsText: 'Indianapolis, IN',
      postedOn: 'Posted Today',
    })),
  })
  const pages = { 0: mkPage(0, 20, 25), 20: mkPage(20, 5, 25) }
  globalThis.fetch = async (url, opts) => {
    const offset = JSON.parse(opts.body).offset
    return { ok: true, status: 200, json: async () => pages[offset] || { total: 25, jobPostings: [] } }
  }
  try {
    const match = workday.detect({ company: 'Acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/en-US/External' })
    const jobs = await workday.fetch(match)
    assert.equal(jobs.length, 25) // 20 + 5, stopped at total
    assert.equal(jobs[0].title, 'Role 0')
    assert.equal(jobs[0].url, 'https://acme.wd5.myworkdayjobs.com/External/job/r0') // {base}/{site}{externalPath}
    assert.equal(jobs[0].location, 'Indianapolis, IN')
    assert.equal(jobs[0].company, 'Acme')
  } finally {
    globalThis.fetch = realFetch
  }
})

const ICIMS_JSONLD_HTML = `<!doctype html><html><head>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Registered Nurse","datePosted":"2026-06-01","jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Indianapolis","addressRegion":"IN"}},"url":"https://careers-acmehealth.icims.com/jobs/1001/registered-nurse/job"}
</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"JobPosting","title":"Maintenance Technician &amp; HVAC","datePosted":"2026-06-02","jobLocation":{"address":{"addressLocality":"Columbus","addressRegion":"OH"}},"url":"/jobs/1002/maintenance-technician/job"}
</script>
</head><body>...</body></html>`

const ICIMS_DOM_HTML = `<div class="iCIMS_JobsTable">
<a class="iCIMS_Anchor" href="/jobs/2001/staff-accountant/job"><span>Staff Accountant</span></a>
<a class="iCIMS_Anchor" href="https://careers-acmemfg.icims.com/jobs/2002/warehouse-associate/job">Warehouse Associate</a>
</div>`

// Real-world iCIMS markup (modeled on a live hospital tenant): server-rendered job cards, title
// in an <h3> inside the anchor, sr-only labels, and an ?in_iframe=1 query after /job.
const ICIMS_CARD_HTML = `<ul class="container-fluid iCIMS_JobsTable">
<li class="iCIMS_JobCardItem"><div class="row">
<div class="col-xs-6 header left"><span class="sr-only field-label">Facility</span><span> Monroe Hospital</span></div>
<div class="col-xs-6 header right"><span class="sr-only field-label">Location</span><span>Indianapolis, IN</span></div>
<div class="col-xs-12 title"><a href="https://careers-primehealthcare.icims.com/jobs/265891/lvn-lpn/job?in_iframe=1" class="iCIMS_Anchor" title="265891 - LVN/LPN"><span class="sr-only field-label">Title</span><h3 >LVN/LPN</h3></a></div>
</div></li>
<li class="iCIMS_JobCardItem"><div class="row">
<div class="col-xs-12 title"><a href="/jobs/265889/student-extern/job?in_iframe=1" class="iCIMS_Anchor"><span class="sr-only field-label">Title</span><h3>Student Extern</h3></a></div>
</div></li>
</ul>`

test('icims: detect parses *.icims.com host; rejects non-iCIMS', () => {
  const m = icims.detect({ company: 'Acme Health', careers_url: 'https://careers-acmehealth.icims.com/jobs/search' })
  assert.equal(m.host, 'careers-acmehealth.icims.com')
  assert.equal(m.company, 'Acme Health')
  assert.equal(icims.detect({ careers_url: 'https://boards.greenhouse.io/acme' }), null)
})

test('icims: SSRF guard allows *.icims.com, rejects look-alike hosts', () => {
  assert.ok(assertAllowedUrl('https://careers-acme.icims.com/jobs/search', { hostAllowlist: ICIMS_HOSTS }))
  assert.throws(() => assertAllowedUrl('https://icims.com.evil.com/jobs', { hostAllowlist: ICIMS_HOSTS }))
})

test('icims: JSON-LD parse normalizes postings, decodes entities, resolves relative URLs', () => {
  const jobs = parseJobPostingsFromHtml(ICIMS_JSONLD_HTML, 'https://careers-acmehealth.icims.com', 'Acme Health')
  assert.equal(jobs.length, 2)
  assert.equal(jobs[0].title, 'Registered Nurse')
  assert.equal(jobs[0].location, 'Indianapolis, IN')
  assert.equal(jobs[1].title, 'Maintenance Technician & HVAC') // &amp; decoded
  assert.equal(jobs[1].url, 'https://careers-acmehealth.icims.com/jobs/1002/maintenance-technician/job') // relative resolved
})

test('icims: DOM fallback parses job-row anchors when no JSON-LD is present', () => {
  const jobs = parseJobPostingsFromHtml(ICIMS_DOM_HTML, 'https://careers-acmemfg.icims.com', 'Acme Mfg')
  assert.deepEqual(jobs.map((j) => j.title), ['Staff Accountant', 'Warehouse Associate'])
  assert.equal(jobs[0].url, 'https://careers-acmemfg.icims.com/jobs/2001/staff-accountant/job')
})

test('icims: parses real-world server-rendered job cards (h3 title, ?in_iframe stripped, location)', () => {
  const jobs = parseJobPostingsFromHtml(ICIMS_CARD_HTML, 'https://careers-primehealthcare.icims.com', 'Prime Healthcare')
  assert.equal(jobs.length, 2)
  assert.equal(jobs[0].title, 'LVN/LPN') // <h3> used; the sr-only "Title" label is dropped
  assert.equal(jobs[0].location, 'Indianapolis, IN') // best-effort City, ST from the card
  assert.equal(jobs[0].url, 'https://careers-primehealthcare.icims.com/jobs/265891/lvn-lpn/job') // query stripped
  assert.equal(jobs[1].title, 'Student Extern')
  assert.equal(jobs[1].url, 'https://careers-primehealthcare.icims.com/jobs/265889/student-extern/job') // relative resolved
})

test('icims: extracts the US-{ST}-{City} job location from a card (so region filtering works)', () => {
  const card = `<li class="iCIMS_JobCardItem"><div class="col-xs-12"><span class="sr-only field-label">Job Location</span><span>US-OH-Columbus</span></div><div class="col-xs-12 title"><a href="/jobs/9/nurse/job"><h3>Nurse</h3></a></div></li>`
  const jobs = parseJobPostingsFromHtml(card, 'https://careers-x.icims.com', 'X')
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].location, 'Columbus, OH')
})

test('icims: registered; HTML pagination dedupes and stops on an empty page', async () => {
  assert.ok(providerIds().includes('icims'))
  const realFetch = globalThis.fetch
  const pages = { 0: ICIMS_JSONLD_HTML, 1: '<html><body>no jobs</body></html>' }
  globalThis.fetch = async (url) => {
    const pr = Number(new URL(url).searchParams.get('pr'))
    return { ok: true, status: 200, text: async () => pages[pr] || '<html></html>' }
  }
  try {
    const jobs = await icims.fetch({ host: 'careers-acmehealth.icims.com', company: 'Acme Health' })
    assert.equal(jobs.length, 2)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('levels: classifyTitle reads seniority signals (senior > mid > entry)', () => {
  assert.equal(classifyTitle('Senior Engineer'), 'senior')
  assert.equal(classifyTitle('Staff Data Scientist'), 'senior')
  assert.equal(classifyTitle('Engineer II'), 'mid')
  assert.equal(classifyTitle('Data Specialist'), 'mid')
  assert.equal(classifyTitle('Analyst I'), 'entry')
  assert.equal(classifyTitle('Associate Software Engineer'), 'entry')
  assert.equal(classifyTitle('Maintenance Technician'), 'unclear')
  assert.equal(classifyTitle('Software Engineer'), 'unclear')
})

test('levels: entry default excludes Senior, surfaces Analyst I, passes ambiguous', () => {
  assert.equal(levelDecision('Senior Engineer', ['entry']).include, false) // gate: excluded
  assert.equal(levelDecision('Analyst I', ['entry']).include, true) // gate: surfaces
  assert.equal(levelDecision('Maintenance Technician', ['entry']).include, true) // ambiguous -> rubric
})

test('levels: adding mid admits Engineer II; senior opt-in ranks on merit (no penalty)', () => {
  assert.equal(levelDecision('Engineer II', ['entry']).include, false) // mid is above entry
  assert.equal(levelDecision('Engineer II', ['entry', 'mid']).include, true) // gate: admitted
  const s = levelDecision('Senior Engineer', ['entry', 'mid', 'senior'])
  assert.equal(s.include, true)
  assert.equal(s.flagged, false) // selected level -> merit, no penalty
})

test('levels: only roles above the highest selected level are out-of-band', () => {
  assert.equal(levelDecision('Senior Engineer', ['entry', 'mid']).reason, 'above-target')
  assert.equal(levelDecision('Senior Engineer', ['senior']).reason, 'on-target')
})

test('levels: filterByLevel keeps in-band jobs and annotates them', () => {
  const jobs = [{ title: 'Analyst I' }, { title: 'Senior Manager' }, { title: 'Data Engineer' }]
  const { kept, excluded, total } = filterByLevel(jobs, ['entry'])
  assert.equal(total, 3)
  assert.equal(excluded, 1) // Senior Manager filtered
  assert.equal(kept.length, 2)
  assert.ok(kept.every((j) => 'level' in j && 'flagged' in j))
})

test('regions: regionStateSet maps presets; nationwide is ALL', () => {
  const mw = regionStateSet(['midwest'])
  assert.ok(mw.has('OH') && mw.has('IL') && !mw.has('AZ'))
  assert.equal(regionStateSet(['nationwide']), 'ALL')
})

test('regions: location filter keeps in-region + remote-US, drops out-of-region + offshore', () => {
  assert.equal(locationMatches('Tempe, AZ', ['southwest']), true) // gate: Phoenix user gets AZ
  assert.equal(locationMatches('Tempe, AZ', ['midwest']), false)
  assert.equal(locationMatches('Columbus, OH', ['midwest']), true) // gate: Columbus user gets OH
  assert.equal(locationMatches('Columbus, OH', ['southwest']), false)
  assert.equal(locationMatches('Phoenix, Arizona, United States', ['southwest']), true) // full state name
  assert.equal(locationMatches('Bengaluru, India', ['midwest']), false) // offshore blocked
  assert.equal(locationMatches('Remote, USA', ['midwest']), true) // remote-US allowed anywhere
})

test('regions: nationwide keeps US + remote, drops offshore-only', () => {
  assert.equal(locationMatches('Detroit, MI', ['nationwide']), true)
  assert.equal(locationMatches('Austin, TX', ['nationwide']), true)
  assert.equal(locationMatches('Bengaluru, India', ['nationwide']), false)
})

test('regions: filterByLocation counts kept/excluded', () => {
  const jobs = [{ location: 'Chicago, IL' }, { location: 'Bengaluru, India' }, { location: 'Remote, USA' }]
  const { kept, excluded } = filterByLocation(jobs, ['midwest'])
  assert.equal(kept.length, 2)
  assert.equal(excluded, 1)
})

test('regions: handles each provider format (Workday country-first, Greenhouse metro, iCIMS US-ST-City)', () => {
  // Workday "country, state, city"
  assert.equal(locationMatches('US, Texas, Austin', ['southwest']), true)
  assert.equal(locationMatches('US, California, Santa Clara', ['west']), true)
  assert.equal(locationMatches('US, California, Santa Clara', ['midwest']), false)
  // Greenhouse: a bare metro resolves to its region; offshore is blocked
  assert.equal(locationMatches('Chicago', ['midwest']), true)
  assert.equal(locationMatches('Chicago', ['southwest']), false)
  assert.equal(locationMatches('Brno, Czechia', ['nationwide']), false)
  // iCIMS "US-{ST}-{City}"
  assert.equal(locationMatches('US-NJ-Denville', ['northeast']), true)
  assert.equal(locationMatches('US-NJ-Denville', ['midwest']), false)
  assert.equal(locationMatches('US-OH-Columbus', ['midwest']), true)
})

test('seed: region selection returns that region and swaps cleanly (gate)', () => {
  const mw = selectEmployers({ regions: ['midwest'] }).map((e) => e.company)
  const sw = selectEmployers({ regions: ['southwest'] }).map((e) => e.company)
  assert.ok(mw.includes('Enova') && mw.includes('Jamf'))
  assert.ok(sw.includes('Carvana') && sw.includes('Axon'))
  assert.equal(mw.some((c) => sw.includes(c)), false) // disjoint -> toggle swaps employers
  assert.ok(toPortals(selectEmployers({ regions: ['midwest'] })).every((p) => p.company && p.careers_url))
})

test('resume: parseResumeText pulls name/email/metro and invents nothing', () => {
  const r = parseResumeText('Sam Dotson\nsam.dotson@example.com\nIndianapolis, IN\nSkills: JS, SQL')
  assert.equal(r.name, 'Sam Dotson')
  assert.equal(r.email, 'sam.dotson@example.com')
  assert.equal(r.location, 'Indianapolis, IN')
  const empty = parseResumeText('')
  assert.equal(empty.name, '')
  assert.equal(empty.email, '')
  assert.equal(empty.location, '')
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
