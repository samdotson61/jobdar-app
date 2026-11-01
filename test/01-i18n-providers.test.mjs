// Jobdar tests — i18n parity, shipped defaults, the provider registry, Greenhouse, Workday and iCIMS.
// Run with `npm test`; `npm test -- i18n-providers` runs only this file.

import { test } from './_harness.mjs'
import { ALL } from './_helpers.mjs'
import { strict as assert } from 'node:assert'
import path from 'node:path'
import { getStrings, listKeys, getT } from '../lib/i18n.mjs'
import { PROFILE_DEFAULTS, SUPPORTED_LANGUAGES } from '../lib/config.mjs'
import { resolveProvider, providerIds } from '../providers/_contract.mjs'
import greenhouse from '../providers/greenhouse.mjs'
import workday, { HOST_ALLOWLIST as WORKDAY_HOSTS, parseWorkdayUrl, partitionCandidates, choosePartition } from '../providers/workday.mjs'
import icims, { HOST_ALLOWLIST as ICIMS_HOSTS, parseJobPostingsFromHtml } from '../providers/icims.mjs'
import { assertAllowedUrl } from '../lib/http.mjs'
import http from 'node:http'

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
  assert.equal(PROFILE_DEFAULTS.eval_grammar, true) // guaranteed-JSON evals default-on for local backends
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

test('workday: a zero total after the first page does not end paging; a time budget returns what was gathered', async () => {
  const realFetch = globalThis.fetch
  const page = (start, n, total) => ({ total, jobPostings: Array.from({ length: n }, (_, i) => ({ title: `Role ${start + i}`, externalPath: `/job/r${start + i}` })) })
  // the tenant shape that capped scans at 40: total on page one, 0 afterwards
  globalThis.fetch = async (url, opts) => {
    const offset = JSON.parse(opts.body).offset
    await new Promise((r) => setTimeout(r, 5)) // a request takes time — the budget test needs the clock to move
    return { ok: true, status: 200, json: async () => (offset === 0 ? page(0, 20, 65) : offset < 60 ? page(offset, 20, 0) : page(offset, 5, 0)) }
  }
  try {
    const match = workday.detect({ company: 'Acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/en-US/External' })
    assert.equal((await workday.fetch(match)).length, 65)
    // an already-spent budget still returns the first page rather than nothing
    assert.ok(!(await workday.fetch(match)).incomplete) // read to the end
    // a placeholder entry (no title, no path) is not a role
    const withBlank = globalThis.fetch
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ total: 3, jobPostings: [{ title: 'Real', externalPath: '/job/r1' }, { bulletFields: [] }, { title: '', externalPath: '' }] }) })
    const real = await workday.fetch(match)
    assert.deepEqual(real.map((j) => j.title), ['Real'])
    globalThis.fetch = withBlank
    const partial = await workday.fetch(match, { budgetMs: 1 })
    assert.equal(partial.length, 20)
    assert.equal(partial[0].title, 'Role 0')
    assert.equal(partial.incomplete, true)
    // a page that fails twice ends paging with the pages already read — the board is not lost
    let calls = 0
    globalThis.fetch = async (url, opts) => {
      const offset = JSON.parse(opts.body).offset
      if (offset === 40) { calls++; return { ok: false, status: 502, json: async () => ({}) } }
      return { ok: true, status: 200, json: async () => (offset === 0 ? page(0, 20, 65) : page(offset, 20, 0)) }
    }
    const cut = await workday.fetch(match)
    assert.equal(cut.length, 40)
    assert.equal(cut.incomplete, true)
    assert.equal(calls, 2) // tried, retried once
    // a size limit (the phone's) stops asking once it has that many
    let asked = 0
    globalThis.fetch = async (url, opts) => {
      asked++
      const offset = JSON.parse(opts.body).offset
      return { ok: true, status: 200, json: async () => page(offset, 20, offset === 0 ? 500 : 0) }
    }
    const capped = await workday.fetch(match, { maxPostings: 40 })
    assert.equal(capped.length, 40)
    assert.equal(asked, 2)
    assert.equal(capped.incomplete, true)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('workday: a window-capped board (total reported as 2000, deep offsets wrap) stops at the wrap; the baseline reads it in facet partitions', async () => {
  const realFetch = globalThis.fetch
  // 50 roles; the tenant reports total=2000 and answers any offset >= 40 with page one again
  const ALL = Array.from({ length: 50 }, (_, i) => ({ title: `Role ${i}`, externalPath: `/job/r${i}`, state: i < 30 ? 'IA' : 'MI', shift: i % 2 ? 'day' : 'night' }))
  const facetsFor = (list) => [
    { facetParameter: 'Location_Region_State_Province', values: [{ id: 'ia', descriptor: 'Iowa', count: list.filter((p) => p.state === 'IA').length }, { id: 'mi', descriptor: 'Michigan', count: list.filter((p) => p.state === 'MI').length }] },
    { facetParameter: 'timeType', values: [{ id: 'd', descriptor: 'Day', count: list.filter((p) => p.shift === 'day').length }, { id: 'n', descriptor: 'Night', count: list.filter((p) => p.shift === 'night').length }] },
    { facetParameter: 'locationMainGroup', values: [{ facetParameter: 'locations', descriptor: 'State', values: [{ id: 'g1', descriptor: 'Iowa', count: 30 }, { id: 'g2', descriptor: 'Michigan', count: 20 }] }] },
  ]
  let calls = 0
  globalThis.fetch = async (url, opts) => {
    calls++
    const { offset, appliedFacets } = JSON.parse(opts.body)
    let list = ALL
    if (appliedFacets.Location_Region_State_Province) list = list.filter((p) => p.state === (appliedFacets.Location_Region_State_Province[0] === 'ia' ? 'IA' : 'MI'))
    if (appliedFacets.timeType) list = list.filter((p) => p.shift === (appliedFacets.timeType[0] === 'd' ? 'day' : 'night'))
    const window = Object.keys(appliedFacets).length ? list.length : 40 // unfiltered: only the first 40 are reachable
    const off = offset >= window ? 0 : offset
    return { ok: true, status: 200, json: async () => ({ total: Object.keys(appliedFacets).length ? list.length : 2000, facets: facetsFor(list), jobPostings: list.slice(off, off + 20) }) }
  }
  try {
    const match = workday.detect({ company: 'Acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/External' })
    const plain = await workday.fetch(match, {})
    assert.equal(plain.length, 40) // the window, once — not 5,000 repeats
    assert.equal(plain.incomplete, true)
    assert.equal(plain.total, 2000)
    // the pure helpers: nested values without an id of their own contribute their children; the fewest-partition facet wins
    const cands = partitionCandidates(plain.facets)
    assert.deepEqual(cands.filter((c) => c.param === 'locations').map((c) => c.id), ['g1', 'g2']) // nested group → its own key
    assert.equal(cands.filter((c) => c.param === 'locationMainGroup').length, 0)
    assert.equal(choosePartition(plain.facets, 35).param, 'Location_Region_State_Province') // every facet fits a window of 35 with 2 values each → the first eligible one
    assert.equal(choosePartition(plain.facets, 28).param, 'timeType') // state and location have a 30-value; only timeType (25/25) fits
    const forced = choosePartition(plain.facets, 25) // every facet has a value of 25+ → the least-oversized one, flagged as not fitting
    assert.equal(forced.fits, false)
    assert.equal(forced.param, 'Location_Region_State_Province') // one oversized value (Iowa 30) — timeType has two (25, 25)
    // the baseline: partitioned read unions every role exactly once
    const whole = await workday.fetch(match, { partition: true, maxPages: 1250 })
    assert.equal(whole.length, 50)
    assert.ok(!whole.incomplete)
    assert.ok(whole.partitions >= 2)
    assert.equal(new Set(whole.map((j) => j.url)).size, 50)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('workday: an HTTP 429 is retried with a pause instead of failing the board', async () => {
  const realFetch = globalThis.fetch
  const page = (start, n, total) => ({ total, jobPostings: Array.from({ length: n }, (_, i) => ({ title: `Role ${start + i}`, externalPath: `/job/r${start + i}` })) })
  let hits = 0
  let limited = 0
  globalThis.fetch = async (url, opts) => {
    hits++
    const offset = JSON.parse(opts.body).offset
    if (offset === 20 && limited < 1) { limited++; return { ok: false, status: 429, json: async () => ({}) } }
    return { ok: true, status: 200, json: async () => (offset === 0 ? page(0, 20, 25) : page(20, 5, 25)) }
  }
  try {
    const match = workday.detect({ company: 'Acme', careers_url: 'https://acme.wd5.myworkdayjobs.com/en-US/External' })
    // exercises the real path, including the first 5 s pause — the one slow test in the suite, on purpose
    const t0 = Date.now()
    const jobs = await workday.fetch(match)
    assert.equal(jobs.length, 25)
    assert.ok(!jobs.incomplete)
    assert.equal(limited, 1)
    assert.ok(Date.now() - t0 >= 4500, 'paused before retrying')
    assert.equal(hits, 3) // page 0, the 429, the retry
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
    assert.ok(!jobs.incomplete) // an empty page = read to the end
    // a time budget hands back the pages read so far, marked incomplete (the desktop no longer drops a long board whole)
    const card = (n) => `<li class="iCIMS_JobCardItem"><div class="title"><a href="/jobs/${n}/role-${n}/job"><h3>Role ${n}</h3></a></div></li>`
    globalThis.fetch = async (url) => {
      const pr = Number(new URL(url).searchParams.get('pr'))
      await new Promise((r) => setTimeout(r, 5))
      return { ok: true, status: 200, text: async () => (pr < 5 ? `<html><body><ul>${card(pr * 2)}${card(pr * 2 + 1)}</ul></body></html>` : '<html></html>') }
    }
    const partial = await icims.fetch({ host: 'careers-acmehealth.icims.com', company: 'Acme Health' }, { budgetMs: 1 })
    assert.equal(partial.length, 2)
    assert.equal(partial.incomplete, true)
    const capped = await icims.fetch({ host: 'careers-acmehealth.icims.com', company: 'Acme Health' }, { maxPostings: 4 })
    assert.equal(capped.length, 4)
    assert.equal(capped.incomplete, true)
  } finally {
    globalThis.fetch = realFetch
  }
})
