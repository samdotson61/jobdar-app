// Jobdar tests — the http guard, the provider contract, Lever/Ashby, UKG, Jibe, DirectEmployers, job-URL parsing.
// Run with `npm test`; `npm test -- provider-contract` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { resolveProvider, fetchJobDescription } from '../providers/_contract.mjs'
import ultipro, { parseUltiProUrl, parseUltiProJobUrl } from '../providers/ultipro.mjs'
import jibe, { jobFromJibe } from '../providers/jibe.mjs'
import dejobs, { jobFromSitemapUrl, parseSitemapEntries } from '../providers/dejobs.mjs'
import greenhouse, { parseJobUrl as parseGhJobUrl } from '../providers/greenhouse.mjs'
import workday, { parseWorkdayJobUrl } from '../providers/workday.mjs'
import icims from '../providers/icims.mjs'
import lever, { parseLeverJobUrl } from '../providers/lever.mjs'
import ashby, { parseAshbyJobUrl } from '../providers/ashby.mjs'
import jsonldProvider, { parseJsonLdJobs } from '../providers/jsonld.mjs'
import { assertAllowedUrl } from '../lib/http.mjs'
import http from 'node:http'

test('security: http guard enforces HTTPS, no credentials, and the host allowlist', () => {
  const allow = [/^api\.example\.com$/]
  assert.ok(assertAllowedUrl('https://api.example.com/x', { hostAllowlist: allow }))
  assert.throws(() => assertAllowedUrl('http://api.example.com/x', { hostAllowlist: allow })) // non-HTTPS
  assert.throws(() => assertAllowedUrl('https://user:pass@api.example.com/x', { hostAllowlist: allow })) // credentials
  assert.throws(() => assertAllowedUrl('https://evil.example.org/x', { hostAllowlist: allow })) // off-allowlist
})

test('providers: all six share the contract (detect + fetch + fetchJob)', () => {
  for (const p of [greenhouse, workday, icims, lever, ashby, jsonldProvider]) {
    assert.equal(typeof p.detect, 'function')
    assert.equal(typeof p.fetch, 'function') // discovery (uniform shape, no JD)
    assert.equal(typeof p.fetchJob, 'function') // eval-time JD fetch — parity across all
  }
})

test('providers: lever/ashby detect their board URLs; jsonld is explicit opt-in only', () => {
  assert.equal(lever.detect({ careers_url: 'https://jobs.lever.co/acme' }).site, 'acme')
  assert.equal(lever.detect({ careers_url: 'https://job-boards.greenhouse.io/acme' }), null)
  assert.deepEqual(parseLeverJobUrl('https://jobs.lever.co/acme/123-abc'), { site: 'acme', id: '123-abc' })
  assert.equal(ashby.detect({ careers_url: 'https://jobs.ashbyhq.com/acme' }).org, 'acme')
  assert.deepEqual(parseAshbyJobUrl('https://jobs.ashbyhq.com/acme/uuid-1'), { org: 'acme', id: 'uuid-1' })
  // jsonld never auto-claims a portal — provider: jsonld is required
  assert.equal(jsonldProvider.detect({ careers_url: 'https://careers.example.org/search' }), null)
  assert.equal(jsonldProvider.detect({ careers_url: 'https://careers.example.org/search', provider: 'jsonld' }).host, 'careers.example.org')
  const html = '<script type="application/ld+json">{"@type":"ItemList","itemListElement":[{"item":{"@type":"JobPosting","title":"RN","url":"https://careers.example.org/j/1","jobLocation":{"address":{"addressLocality":"Cincinnati","addressRegion":"OH"}}}}]}</script>'
  const jobs = parseJsonLdJobs(html, 'X')
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].location, 'Cincinnati, OH')
})

test('ultipro: detects a UKG board, pages newest-first, and reads the JD the detail page embeds', async () => {
  const board = 'https://recruiting.ultipro.com/ACME1000ACME/JobBoard/8ee2a2dc-7b3b-419a-83f9-f26ded918f47'
  assert.equal(resolveProvider({ company: 'Acme', careers_url: board }).provider.id, 'ultipro')
  assert.equal(ultipro.detect({ careers_url: 'https://recruiting.ultipro.com.evil.example/ACME/JobBoard/8ee2a2dc-7b3b-419a-83f9-f26ded918f47' }), null)
  assert.equal(parseUltiProUrl('https://recruiting.ultipro.com/ACME1000ACME/JobBoard/not-a-board-id'), null)
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  const realFetch = globalThis.fetch
  const bodies = []
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('LoadSearchResults')) {
      const skip = JSON.parse(opts.body).opportunitySearch.Skip
      bodies.push(skip)
      const n = skip === 0 ? 50 : 5
      return { ok: true, status: 200, json: async () => ({ totalCount: 55, opportunities: Array.from({ length: n }, (_, i) => ({ Id: id(skip + i), Title: `Role ${skip + i}`, PostedDate: '2026-10-01T12:00:00Z', Locations: [{ Address: { City: 'Nashville', State: { Code: 'TN', Name: 'Tennessee' } } }] })) }) }
    }
    return { ok: true, status: 200, text: async () => `<script>var x = new US.Opportunity.CandidateOpportunityDetail(${JSON.stringify({ Title: 'Role 0', Description: '<p>Stock &amp; sell shoes.</p>', Locations: [{ Address: { City: 'Nashville', State: { Code: 'TN' } } }] })});\n</script>` }
  }
  try {
    const match = ultipro.detect({ company: 'Acme', careers_url: board })
    const jobs = await ultipro.fetch(match)
    assert.equal(jobs.length, 55)
    assert.deepEqual(bodies, [0, 50])
    assert.ok(!jobs.incomplete)
    assert.equal(jobs[0].url, `${board}/OpportunityDetail?opportunityId=${id(0)}`)
    assert.equal(jobs[0].location, 'Nashville, TN')
    assert.equal((await ultipro.fetch(match, { maxPostings: 20 })).incomplete, true) // the phone's limit stops after one page
    const jd = await fetchJobDescription(jobs[0].url)
    assert.equal(jd.title, 'Role 0')
    assert.match(jd.description, /Stock & sell shoes\./)
    assert.equal(parseUltiProJobUrl(`${board}/OpportunityDetail?opportunityId=nope`), null)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('jibe: explicit opt-in only; lists roles under the ATS URL the feed names so the JD has a route', async () => {
  assert.equal(jibe.detect({ careers_url: 'https://careers.example.com/jobs' }), null)
  const match = jibe.detect({ company: 'Acme', careers_url: 'https://careers.example.com/jobs', provider: 'jibe' })
  assert.equal(match.host, 'careers.example.com')
  const viaIcims = jobFromJibe({ data: { slug: '12023', req_id: '12023', title: 'Clinical Trial Manager', location_name: 'Cincinnati, OH', posted_date: '2026-10-05T17:29:00+0000', apply_url: 'https://uscareers-acme.icims.com/jobs/12023/login' } }, 'careers.example.com', 'Acme')
  assert.equal(viaIcims.url, 'https://uscareers-acme.icims.com/jobs/12023/job')
  assert.equal(resolveProvider({ careers_url: viaIcims.url }).provider.id, 'icims')
  assert.equal(viaIcims.location, 'Cincinnati, OH')
  // an apply link that is not a known ATS never becomes the role's URL
  assert.equal(jobFromJibe({ slug: 'abc', title: 'X', apply_url: 'https://icims.com.evil.example/jobs/1/login', req_id: '1' }, 'careers.example.com', 'Acme').url, 'https://careers.example.com/jobs/abc')
  const realFetch = globalThis.fetch
  const urls = []
  globalThis.fetch = async (url) => {
    urls.push(String(url))
    const page = Number(new URL(url).searchParams.get('page'))
    return { ok: true, status: 200, json: async () => ({ totalCount: 60, jobs: Array.from({ length: page === 1 ? 50 : 10 }, (_, i) => ({ data: { slug: `s${page}-${i}`, title: `Role ${page}-${i}`, city: 'Cincinnati', state: 'Ohio' } })) }) }
  }
  try {
    const jobs = await jibe.fetch(match)
    assert.equal(jobs.length, 60)
    assert.equal(urls.length, 2)
    assert.ok(urls.every((u) => u.startsWith('https://careers.example.com/api/jobs?') && u.includes('country=United%20States')))
    assert.equal((await jibe.fetch(match, { maxPostings: 10 })).incomplete, true)
  } finally {
    globalThis.fetch = realFetch
  }
})

test('dejobs: a DirectEmployers microsite is read from its job sitemap — title and City, ST from the slug, no dates claimed, the phone cap honoured, no JD claimed', async () => {
  assert.equal(resolveProvider({ company: 'HCA Healthcare', careers_url: 'https://hcahealthcare.dejobs.org/' }).provider.id, 'dejobs')
  assert.equal(dejobs.detect({ careers_url: 'https://dejobs.org.evil.example/' }), null)
  const j = jobFromSitemapUrl('https://hcahealthcare.dejobs.org/fort-walton-beach-fl/rn-med-surg-nights/2416D6506EA3/job/', '2026-10-05', 'HCA Healthcare')
  assert.deepEqual(j, { title: 'RN Med Surg Nights', url: 'https://hcahealthcare.dejobs.org/fort-walton-beach-fl/rn-med-surg-nights/2416D6506EA3/job/', company: 'HCA Healthcare', location: 'Fort Walton Beach, FL', postedOn: null }) // lastmod is the sitemap's date, never claimed as posting date
  assert.equal(jobFromSitemapUrl('https://hcahealthcare.dejobs.org/about/', '', 'X'), null)
  const xml = '<?xml version="1.0"?><urlset><url><loc>https://acme.dejobs.org/nashville-tn/cook/A1/job/</loc><lastmod>2026-10-01</lastmod></url><url><loc>https://acme.dejobs.org/austin-tx/nurse-icu/B2/job/</loc><lastmod>2026-10-04</lastmod></url><url><loc>https://acme.dejobs.org/austin-tx/nurse-icu/B2/job/</loc><lastmod>2026-10-04</lastmod></url></urlset>'
  assert.equal(parseSitemapEntries(xml).length, 3)
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url) => ({ ok: true, status: 200, text: async () => (/sitemaps\/index\.xml$/.test(String(url)) ? '<sitemapindex><sitemap><loc>https://acme.dejobs.org/sitemaps/jobs_1.xml</loc></sitemap></sitemapindex>' : xml) })
  try {
    const match = dejobs.detect({ company: 'Acme', careers_url: 'https://acme.dejobs.org/' })
    const jobs = await dejobs.fetch(match)
    assert.deepEqual(jobs.map((x) => x.title), ['Cook', 'Nurse ICU']) // sitemap order, duplicate URL dropped
    assert.equal(jobs[1].location, 'Austin, TX')
    assert.ok(!jobs.incomplete)
    const capped = await dejobs.fetch(match, { maxPostings: 1 })
    assert.equal(capped.length, 1)
    assert.equal(capped.incomplete, true)
    assert.equal(await fetchJobDescription(jobs[0].url), null) // no description route — said honestly
  } finally {
    globalThis.fetch = realFetch
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
