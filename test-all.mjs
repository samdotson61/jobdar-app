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
import greenhouse, { parseJobUrl as parseGhJobUrl } from './providers/greenhouse.mjs'
import workday, { HOST_ALLOWLIST as WORKDAY_HOSTS, parseWorkdayUrl, parseWorkdayJobUrl } from './providers/workday.mjs'
import icims, { HOST_ALLOWLIST as ICIMS_HOSTS, parseJobPostingsFromHtml } from './providers/icims.mjs'
import { assertAllowedUrl } from './lib/http.mjs'
import { resolveState, stateLabel, allStates } from './lib/states.mjs'
import { classifyTitle, levelDecision, filterByLevel } from './lib/levels.mjs'
import { regionStateSet, locationMatches, filterByLocation } from './lib/regions.mjs'
import { selectEmployers, toPortals } from './lib/seed.mjs'
import { parseResumeText } from './lib/resume.mjs'
import { renderDashboard } from './lib/commands/dashboard.mjs'
import { renderTui } from './lib/commands/tui.mjs'
import { mergeScanned, recordEval, serializePipeline, band, isEvaluated } from './lib/evaluations.mjs'
import { cvToHtml, matchedKeywords } from './lib/cv_render.mjs'

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

test('levels: classifyTitle reads seniority signals (exec > senior > mid > entry)', () => {
  assert.equal(classifyTitle('Vice President, Product'), 'exec') // spelled-out — the title that scored 4.1
  assert.equal(classifyTitle('VP of Engineering'), 'exec')
  assert.equal(classifyTitle('Director of Product'), 'exec')
  assert.equal(classifyTitle('Head of Data'), 'exec')
  assert.equal(classifyTitle('Chief Product Officer'), 'exec')
  assert.equal(classifyTitle('Senior Engineer'), 'senior')
  assert.equal(classifyTitle('Staff Data Scientist'), 'senior')
  assert.equal(classifyTitle('Engineer II'), 'mid')
  assert.equal(classifyTitle('Data Specialist'), 'mid')
  assert.equal(classifyTitle('Analyst I'), 'entry')
  assert.equal(classifyTitle('Associate Software Engineer'), 'entry')
  assert.equal(classifyTitle('Product Manager'), 'unclear') // a target role — must NOT read as exec/senior
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

test('levels: executive titles are always above-target and filtered out', () => {
  assert.equal(levelDecision('Vice President, Product', ['entry', 'mid']).include, false)
  assert.equal(levelDecision('Director of Product', ['entry', 'mid']).include, false)
  assert.equal(levelDecision('Head of Growth', ['senior']).include, false) // even a senior target won't admit exec
  const { kept, excluded } = filterByLevel([{ title: 'Vice President, Product' }, { title: 'Product Manager' }], ['entry', 'mid'])
  assert.equal(excluded, 1) // the VP is dropped…
  assert.equal(kept[0].title, 'Product Manager') // …the attainable role passes
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

test('seed: metro is a contains-match, sector filters, and the catalog spans all 3 providers', () => {
  const cincy = selectEmployers({ regions: ['nationwide'], metros: ['Cincinnati'] }).map((e) => e.company)
  assert.ok(cincy.includes('84.51°') && cincy.includes('Bon Secours Mercy Health')) // "Cincinnati" ⊂ "Cincinnati, OH"
  const mwHealth = selectEmployers({ regions: ['midwest'], sectors: ['healthcare'] })
  assert.ok(mwHealth.length >= 10 && mwHealth.every((e) => e.sector === 'healthcare'))
  const se = selectEmployers({ regions: ['southeast'] })
  assert.ok(se.length >= 10 && se.some((e) => e.company === 'Vanderbilt University Medical Center'))
  const urls = selectEmployers({ regions: ['nationwide'] }).map((e) => e.careers_url).join(' ')
  assert.ok(urls.includes('greenhouse.io') && urls.includes('myworkdayjobs.com') && urls.includes('icims.com'))
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

test('security: http guard enforces HTTPS, no credentials, and the host allowlist', () => {
  const allow = [/^api\.example\.com$/]
  assert.ok(assertAllowedUrl('https://api.example.com/x', { hostAllowlist: allow }))
  assert.throws(() => assertAllowedUrl('http://api.example.com/x', { hostAllowlist: allow })) // non-HTTPS
  assert.throws(() => assertAllowedUrl('https://user:pass@api.example.com/x', { hostAllowlist: allow })) // credentials
  assert.throws(() => assertAllowedUrl('https://evil.example.org/x', { hostAllowlist: allow })) // off-allowlist
})

test('providers: greenhouse, workday, icims share the contract (detect + fetch + fetchJob)', () => {
  for (const p of [greenhouse, workday, icims]) {
    assert.equal(typeof p.detect, 'function')
    assert.equal(typeof p.fetch, 'function') // discovery (uniform shape, no JD)
    assert.equal(typeof p.fetchJob, 'function') // eval-time JD fetch — parity across all three
  }
})

test('providers: job-URL parsing for the eval-time JD fetch', () => {
  assert.deepEqual(parseGhJobUrl('https://job-boards.greenhouse.io/enova/jobs/7977401'), { token: 'enova', id: '7977401' })
  const w = parseWorkdayJobUrl('https://nvidia.wd5.myworkdayjobs.com/External/job/US-CA/Engineer_JR123')
  assert.equal(w.tenant, 'nvidia')
  assert.equal(w.shard, 'wd5')
  assert.equal(w.site, 'External')
  assert.equal(w.externalPath, '/job/US-CA/Engineer_JR123')
  assert.equal(parseGhJobUrl('https://job-boards.greenhouse.io/enova'), null) // careers URL, no job id
})

test('dashboard: renders bilingual HTML with active config + portal list', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry'] }
  const portals = [{ company: 'Enova', careers_url: 'https://job-boards.greenhouse.io/enova' }]
  const en = renderDashboard(getT('en'), { profile, portals, rows: [], lang: 'en' })
  assert.ok(en.includes('Jobdar dashboard') && en.includes('Midwest') && en.includes('Enova') && en.includes('greenhouse'))
  const es = renderDashboard(getT('es'), { profile, portals: [], rows: [], lang: 'es' })
  assert.ok(es.includes('Panel de Jobdar') && es.includes('Medio Oeste'))
})

test('tui: evaluated roles show score + band; scanned roles read "pending eval"', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry', 'mid'] }
  const rows = [
    { company: 'Enova', role: 'Data Analyst I', location: 'Chicago, IL', score: '4.7', band: 'apply', status: 'evaluated' },
    { company: 'Acme', role: 'Marketing Analyst', location: 'Austin, TX', score: '3.6', band: 'research', status: 'evaluated' },
    { company: 'Globex', role: 'Software Engineer', location: 'Remote, USA', score: '', band: '', status: 'scanned' },
  ]
  const out = renderTui(getT('en'), { profile, rows, lang: 'en', sort: 'score', filter: 'all', height: 24 })
  assert.ok(out.includes('Data Analyst I') && out.includes('4.7')) // evaluated shows its model score
  assert.ok(out.includes('Apply 1') && out.includes('Research 1') && out.includes('1 pending')) // counts incl pending
  assert.ok(out.includes('Software Engineer') && out.includes('pending')) // scanned role reads pending, not a score
  const pendingOnly = renderTui(getT('en'), { profile, rows, lang: 'en', filter: 'pending', height: 24 })
  assert.ok(pendingOnly.includes('Software Engineer') && !pendingOnly.includes('Data Analyst I')) // pending filter
  const applied = renderTui(getT('en'), { profile, rows, lang: 'en', filter: 'apply', height: 24 })
  assert.ok(applied.includes('Data Analyst I') && !applied.includes('Marketing Analyst')) // band filter
})

test('pipeline: band maps a 0–5 model score to Apply / Research / Dont (empty → no band)', () => {
  assert.equal(band(4.2), 'apply')
  assert.equal(band(3.7), 'research')
  assert.equal(band(3.0), 'dont')
  assert.equal(band(''), '') // no score yet → no band (not "dont")
})

test('pipeline: scan writes DISCOVERED roles (status scanned, no score) — the tool does not score', () => {
  const discovered = [
    { company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' },
    { company: 'Hudl', title: 'Data Analyst', url: 'u2', location: 'Lincoln, NE' },
  ]
  const rows = mergeScanned([], discovered, '2026-06-05')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].status, 'scanned')
  assert.equal(rows[0].role, 'Product Manager')
  assert.equal(rows[0].score, '') // no score comes from scanning
  assert.equal(rows[0].band, '')
  assert.ok(!isEvaluated(rows[0]))
  assert.ok(serializePipeline(rows).startsWith('company\trole\turl'))
})

test('pipeline: eval records the model verdict (score + band), re-scan never clobbers it', () => {
  let rows = mergeScanned([], [{ company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' }], '2026-06-05')
  rows = recordEval(rows, { url: 'u1', score: 4.3, recommendation: 'strong PM fit' }, '2026-06-06')
  const u1 = rows.find((r) => r.url === 'u1')
  assert.equal(u1.status, 'evaluated')
  assert.equal(u1.score, 4.3)
  assert.equal(u1.band, 'apply') // derived from the score
  assert.equal(u1.recommendation, 'strong PM fit')
  assert.equal(u1.company, 'Enova') // discovery fields preserved
  assert.ok(isEvaluated(u1))
  // a later scan that re-discovers u1 must NOT wipe the model's verdict
  const after = mergeScanned(rows, [{ company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' }], '2026-06-07')
  const again = after.find((r) => r.url === 'u1')
  assert.equal(again.status, 'evaluated')
  assert.equal(again.score, 4.3)
})

test('pipeline: eval can score a URL that was never scanned (creates the row)', () => {
  const rows = recordEval([], { url: 'u9', company: 'X', role: 'PM', score: 3.6 }, '2026-06-06')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].band, 'research')
  assert.equal(rows[0].status, 'evaluated')
})

test('résumé: cvToHtml renders ATS HTML (name, sections, bullets) + role tailoring flag', () => {
  const md = '# Jane Doe\nDeveloper · jane@x.com\n## Experience\n### Data Analyst\n- Built **SQL** dashboards\n## Skills\n- Python, SQL'
  const html = cvToHtml(md, { role: 'Data Analyst', company: 'Enova', matched: ['sql', 'python'] })
  assert.ok(html.includes('<h1>Jane Doe</h1>') && html.includes('<h2>Experience</h2>'))
  assert.ok(html.includes('<li>Built <strong>SQL</strong> dashboards</li>'))
  assert.ok(html.includes('Tailored for') && html.includes('Enova') && html.includes('Relevant: sql, python'))
  assert.ok(html.includes('@page') && !html.includes('<table')) // ATS-safe: print CSS, no tables
})

test('résumé: matchedKeywords finds role terms present in the cv', () => {
  assert.deepEqual(matchedKeywords('Data Analyst SQL', 'experienced data analyst with sql and python').sort(), ['analyst', 'data', 'sql'])
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
