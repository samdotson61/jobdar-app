// Jobdar — test runner (zero dependencies). Run with `npm test`.
// Covers the foundation + bilingual core: i18n parity & interpolation, shipped defaults,
// the provider registry / Greenhouse detect(), EN<->ES modes parity, and state aliases.

import { strict as assert } from 'node:assert'
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { getStrings, listKeys, getT } from './lib/i18n.mjs'
import { PROFILE_DEFAULTS, SUPPORTED_LANGUAGES, paths, ROOT as PKG_ROOT } from './lib/config.mjs'
import { resolveProvider, providerIds } from './providers/_contract.mjs'
import greenhouse, { parseJobUrl as parseGhJobUrl } from './providers/greenhouse.mjs'
import workday, { HOST_ALLOWLIST as WORKDAY_HOSTS, parseWorkdayUrl, parseWorkdayJobUrl } from './providers/workday.mjs'
import icims, { HOST_ALLOWLIST as ICIMS_HOSTS, parseJobPostingsFromHtml } from './providers/icims.mjs'
import lever, { parseLeverJobUrl } from './providers/lever.mjs'
import ashby, { parseAshbyJobUrl } from './providers/ashby.mjs'
import jsonldProvider, { parseJsonLdJobs } from './providers/jsonld.mjs'
import { assertAllowedUrl } from './lib/http.mjs'
import { resolveState, stateLabel, allStates } from './lib/states.mjs'
import { classifyTitle, levelDecision, filterByLevel } from './lib/levels.mjs'
import { regionStateSet, locationMatches, filterByLocation, canonicalLocation } from './lib/regions.mjs'
import { selectEmployers, toPortals } from './lib/seed.mjs'
import { parseResumeText } from './lib/resume.mjs'
import { renderDashboard, analyze } from './lib/commands/dashboard.mjs'
import { renderTui, pipelineView } from './lib/commands/tui.mjs'
import { mergeScanned, recordEval, serializePipeline, band, isEvaluated, isTracked, setStatus, pruneScanned, PIPELINE_COLS, recordPrescreen, pendingQueue, roleKey, resolveAlias } from './lib/evaluations.mjs'
import { extractYearsRequired, extractDegreeGate, extractGates, screenDecision, prescreenRole, freshnessPoints, reasonLine, blendSalary } from './lib/prescreen.mjs'
import { extractPay, bandVsTarget, formatPay, paySummary, SALARY_TOLERANCE, SALARY_FLOOR } from './lib/salary.mjs'
import { normalizeResumeDates, monthYear } from './lib/dates.mjs'
import { decodeEntities, stripTags } from './lib/html.mjs'
import { baseRoleTitle, peopleFinderLinks, businessDaysBetween, canContact, canFollowup, dueFollowups, lintDraft } from './lib/outreach.mjs'
import { trackerRowsFrom } from './lib/tracker.mjs'
import { cvToHtml, matchedKeywords } from './lib/cv_render.mjs'
import http from 'node:http'
import { resolveBackend, isLoopbackUrl, parseVerdict, selectActive, backendHealth, callMessages, callOpenAI, callBackend, evaluate, WINC_DEFAULT_URL, LOCAL_RUNTIMES } from './lib/inference.mjs'
import { scoreFromJudgments, parseEvalJson, stripPII, clampVerdict, buildEvalUser, evalRole, buildVerdict, prepEval } from './lib/eval_engine.mjs'
import { bandAgreement, buildBatchRequests, parseBatchResults, clampLogEntry } from './lib/eval_ops.mjs'
import { extractText, isExtractable } from './lib/docparse.mjs'
import { parsePreConfirm } from './lib/eval_engine.mjs'

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

test('portability: package assets resolve from ROOT; user dirs follow JOBDAR_HOME', () => {
  // package assets are never coupled to the user config dir
  assert.equal(paths.i18nDir, path.join(PKG_ROOT, 'config', 'i18n'))
  assert.equal(paths.states, path.join(PKG_ROOT, 'templates', 'states.yml'))
  // a checkout WITH config/profile.yml is repo-local (a self-contained unit); profile.yml is
  // gitignored, so a fresh clone (and CI) must fall back to ~/.jobdar — assert the rule, not
  // one machine's state
  const expectedHome = existsSync(path.join(PKG_ROOT, 'config', 'profile.yml'))
    ? PKG_ROOT
    : path.join(homedir(), '.jobdar')
  assert.equal(paths.home, expectedHome)
  // JOBDAR_HOME relocates every user dir (subprocess: paths resolve at import time)
  const home = path.join(tmpdir(), 'jobdar-portability-test')
  const out = execFileSync(process.execPath, ['-e', "import('./lib/config.mjs').then(m => console.log(JSON.stringify(m.paths)))"], {
    cwd: ROOT,
    env: { ...process.env, JOBDAR_HOME: home, JOBDAR_CONFIG_DIR: '', JOBDAR_DATA_DIR: '', JOBDAR_OUTPUT_DIR: '' },
    encoding: 'utf8',
  })
  const p = JSON.parse(out)
  assert.equal(p.home, home)
  assert.ok(p.configDir.startsWith(home) && p.dataDir.startsWith(home) && p.outputDir.startsWith(home))
  assert.ok(p.i18nDir.startsWith(PKG_ROOT)) // language tables stay with the package
})

test('portability: i18n renders real strings even when the user config dir is elsewhere', () => {
  // Regression: i18n used to load from CONFIG_DIR, so JOBDAR_CONFIG_DIR=<empty> degraded every
  // string to its raw key ("cli.usage"). Tables are a package asset now.
  const out = execFileSync(process.execPath, ['bin/jobdar', '--help'], {
    cwd: ROOT,
    env: { ...process.env, JOBDAR_HOME: path.join(tmpdir(), 'jobdar-empty-home-test') },
    encoding: 'utf8',
  })
  assert.ok(out.includes('Usage: jobdar <command>'), 'help must render real strings')
  assert.ok(!out.includes('cli.usage'), 'raw i18n keys must not leak')
})

test('privacy: personal config is gitignored and never shipped to npm', () => {
  const gi = readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  for (const p of ['config/profile.yml', 'config/portals.yml', 'data/*', '.env']) {
    assert.ok(gi.includes(p), `.gitignore must cover ${p}`)
  }
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(!pkg.files.includes('config/'), 'npm files must not pack config/ wholesale (profile.yml has PII)')
  assert.ok(pkg.files.includes('config/i18n/'), 'i18n tables must still ship')
  assert.ok(existsSync(path.join(ROOT, 'config', 'profile.example.yml'))) // PII-free template ships instead
  assert.ok(existsSync(path.join(ROOT, 'config', 'portals.example.yml')))
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
  const r = parseResumeText('Jane Doe\njane.doe@example.com\nIndianapolis, IN\nSkills: JS, SQL')
  assert.equal(r.name, 'Jane Doe')
  assert.equal(r.email, 'jane.doe@example.com')
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

test('providers: job-URL parsing for the eval-time JD fetch', () => {
  assert.deepEqual(parseGhJobUrl('https://job-boards.greenhouse.io/enova/jobs/7977401'), { token: 'enova', id: '7977401' })
  const w = parseWorkdayJobUrl('https://nvidia.wd5.myworkdayjobs.com/External/job/US-CA/Engineer_JR123')
  assert.equal(w.tenant, 'nvidia')
  assert.equal(w.shard, 'wd5')
  assert.equal(w.site, 'External')
  assert.equal(w.externalPath, '/job/US-CA/Engineer_JR123')
  assert.equal(parseGhJobUrl('https://job-boards.greenhouse.io/enova'), null) // careers URL, no job id
})

test('dashboard: renders config, pipeline (TUI parity), analytics charts + tracker', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry'] }
  const portals = [{ company: 'Enova', careers_url: 'https://job-boards.greenhouse.io/enova' }]
  const pipeline = [
    { company: 'Enova', role: 'Data Analyst I', location: 'Chicago, IL', score: '4.6', band: 'apply', status: 'evaluated', url: 'https://job-boards.greenhouse.io/enova/jobs/1' },
    { company: 'Hudl', role: 'Product Manager', location: 'Lincoln, NE', score: '', band: '', status: 'scanned', url: 'https://job-boards.greenhouse.io/hudl/jobs/2' },
  ]
  const catalog = [{ company: 'Enova', sector: 'fintech' }, { company: 'Hudl', sector: 'sports-tech' }]
  const en = renderDashboard(getT('en'), { profile, portals, pipeline, tracker: [], catalog, lang: 'en' })
  assert.ok(en.includes('Jobdar dashboard') && en.includes('Midwest') && en.includes('Enova') && en.includes('greenhouse'))
  assert.ok(en.includes('Data Analyst I') && en.includes('4.6')) // pipeline row — TUI parity
  assert.ok(en.includes('href="https://job-boards.greenhouse.io/enova/jobs/1"')) // role links to the posting
  assert.ok(en.includes('Analytics') && en.includes('<svg') && en.includes('Top companies') && en.includes('Pipeline funnel'))
  assert.ok(en.includes('By sector') && en.includes('By location')) // sector/region breakdown charts
  assert.ok(en.includes('id="pipe"') && en.includes('sessionStorage')) // client-side sortable columns
  const es = renderDashboard(getT('es'), { profile, portals: [], pipeline, tracker: [], catalog, lang: 'es' })
  assert.ok(es.includes('Panel de Jobdar') && es.includes('Analíticas') && es.includes('<svg') && es.includes('Por sector'))
})

test('dashboard: analyze() computes counts, funnel, companies, sectors + locations', () => {
  const pipeline = [
    { company: 'A', location: 'Chicago, IL', score: '4.5', band: 'apply', status: 'evaluated' },
    { company: 'A', location: 'Chicago, IL', score: '3.6', band: 'research', status: 'evaluated' },
    { company: 'B', location: 'Remote, USA', score: '', band: '', status: 'scanned' },
  ]
  const catalog = [{ company: 'A', sector: 'fintech' }, { company: 'B', sector: 'healthcare' }]
  const a = analyze(pipeline, [{ company: 'A', role: 'x', state: 'applied' }], catalog)
  assert.equal(a.total, 3)
  assert.equal(a.evaluated, 2)
  assert.equal(a.counts.apply, 1)
  assert.equal(a.counts.pending, 1)
  assert.equal(a.topCompanies[0].name, 'A') // most roles
  assert.equal(a.funnel.find((s) => s.label === 'applied').value, 1)
  assert.equal(a.sectors.find((s) => s.name === 'fintech').total, 2) // company→sector join from catalog
  assert.ok(a.sectors.find((s) => s.name === 'healthcare'))
  assert.ok(a.locations.find((l) => l.name === 'IL')) // "Chicago, IL" → IL
  assert.ok(a.locations.find((l) => l.name === 'Remote')) // "Remote, USA" → Remote
})

test('tui: evaluated roles show score + band; scanned roles read "pending eval"', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry', 'mid'] }
  const rows = [
    { company: 'Enova', role: 'Data Analyst I', location: 'Chicago, IL', score: '4.7', band: 'apply', status: 'evaluated', url: 'u1' },
    { company: 'Acme', role: 'Marketing Analyst', location: 'Austin, TX', score: '3.6', band: 'research', status: 'evaluated', url: 'u2' },
    { company: 'Globex', role: 'Software Engineer', location: 'Remote, USA', score: '', band: '', status: 'scanned', url: 'u3' },
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

test('tui: position indicator, cursor highlight, and tracked-state rows', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry'] }
  const rows = [
    { company: 'A', role: 'PM', location: 'Chicago, IL', score: '4.4', band: 'apply', status: 'applied', url: 'u1' },
    { company: 'B', role: 'Analyst', location: 'Columbus, OH', score: '', band: '', status: 'scanned', url: 'u2' },
  ]
  const out = renderTui(getT('en'), { profile, rows, lang: 'en', cursor: 0, height: 24 })
  assert.ok(out.includes('1–2 of 2')) // position indicator
  assert.ok(out.includes('\x1b[7m')) // cursor row is inverse-video highlighted
  assert.ok(out.includes('Applied')) // tracked status shows its state label, not a band
  const v = pipelineView(rows, { filter: 'pending' })
  assert.equal(v.length, 1) // shared view helper agrees with the filter
  assert.equal(v[0].url, 'u2')
})

test('pipeline: band maps a 0–5 model score to Apply / Research / Dont (empty → no band)', () => {
  assert.equal(band(4.2), 'apply')
  assert.equal(band(3.7), 'research')
  assert.equal(band(3.0), 'dont')
  assert.equal(band(''), '') // no score yet → no band (not "dont")
})

test('pipeline: scan writes DISCOVERED roles (status scanned, no score) — the tool does not score', () => {
  const discovered = [
    { company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL', postedOn: '2026-06-01T08:00:00Z' },
    { company: 'Hudl', title: 'Data Analyst', url: 'u2', location: 'Lincoln, NE' },
  ]
  const rows = mergeScanned([], discovered, '2026-06-05')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].status, 'scanned')
  assert.equal(rows[0].role, 'Product Manager')
  assert.equal(rows[0].score, '') // no score comes from scanning
  assert.equal(rows[0].band, '')
  assert.equal(rows[0].posted, '2026-06-01') // board posting date persisted (day precision)
  assert.equal(rows[0].first_seen, '2026-06-05') // when scan first found it
  assert.ok(!isEvaluated(rows[0]))
  // a later re-scan keeps the original first_seen
  const again = mergeScanned(rows, [{ company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' }], '2026-06-09')
  assert.equal(again.find((r) => r.url === 'u1').first_seen, '2026-06-05')
  assert.ok(serializePipeline(rows).startsWith('company\trole\turl'))
})

test('pipeline: status advances (applied), tracker derives from it, prune keeps your work', () => {
  let rows = mergeScanned([], [
    { company: 'A', title: 'PM', url: 'u1' },
    { company: 'B', title: 'Analyst', url: 'u2' },
    { company: 'C', title: 'Dev', url: 'u3' },
  ], '2026-06-05')
  rows = recordEval(rows, { url: 'u1', score: 4.4 }, '2026-06-06')
  rows = setStatus(rows, 'u1', 'applied', '2026-06-07')
  const u1 = rows.find((r) => r.url === 'u1')
  assert.equal(u1.status, 'applied')
  assert.ok(isTracked(u1))
  assert.equal(u1.score, 4.4) // score survives the status change
  // a later eval refresh must NOT demote the applied status
  rows = recordEval(rows, { url: 'u1', score: 4.6 }, '2026-06-08')
  assert.equal(rows.find((r) => r.url === 'u1').status, 'applied')
  // tracker = view over the pipeline
  const tracked = trackerRowsFrom(rows)
  assert.equal(tracked.length, 1)
  assert.equal(tracked[0].state, 'applied')
  // prune: u2 vanished from boards (scanned → dropped); u1 applied + u3 still listed → kept
  const { rows: kept, pruned } = pruneScanned(rows, new Set(['u3']))
  assert.equal(pruned, 1)
  assert.ok(kept.find((r) => r.url === 'u1') && kept.find((r) => r.url === 'u3'))
  assert.ok(!kept.find((r) => r.url === 'u2'))
  assert.equal(setStatus(rows, 'nope', 'applied', '2026-06-07'), null) // unknown URL → null
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

// --- Prescreen (the apply-likelihood gate) ---

test('prescreen: years gate parses "N+ years experience" and screens above the selected level', () => {
  const jd = 'We need 5+ years of professional experience shipping data products. 10 years of innovation behind us.'
  const g = extractYearsRequired(jd)
  assert.equal(g.years, 5) // "10 years of innovation" must NOT match (no "experience")
  assert.ok(g.quote.includes('5+ years'))
  const entry = screenDecision(extractGates(jd), { target_levels: ['entry'] })
  assert.ok(entry.screened && entry.reasons[0].kind === 'years')
  const senior = screenDecision(extractGates(jd), { target_levels: ['entry', 'senior'] })
  assert.ok(!senior.screened) // senior ceiling (10) clears a 5-year ask
  const range = extractYearsRequired('1-2 years of experience preferred; 7 years experience is a plus')
  assert.equal(range.years, 1) // the LOWEST stated floor is the requirement
})

test('prescreen: degree gate is yes/no/unclear; no_degree flags a stretch but NEVER screens', () => {
  assert.equal(extractDegreeGate('Bachelor’s degree required in CS.').gate, 'yes')
  assert.equal(extractDegreeGate('Bachelor’s degree or equivalent experience.').gate, 'unclear')
  assert.equal(extractDegreeGate('Great attitude required.').gate, 'no')
  const jd = 'Bachelor’s degree required.'
  const noDegree = screenDecision(extractGates(jd), { tuning_profile: 'no_degree', include_degree_required_roles: true })
  assert.ok(!noDegree.screened, 'no_degree must never auto-screen a degree ask')
  assert.ok(noDegree.flags.some((f) => f.kind === 'degree_stretch'))
  const excluded = screenDecision(extractGates(jd), { include_degree_required_roles: false })
  assert.ok(excluded.screened && excluded.reasons[0].kind === 'degree')
})

test('prescreen: active clearance screens; "able to obtain" + sponsorship + license only flag', () => {
  const hard = screenDecision(extractGates('Must hold an active Top Secret clearance.'), {})
  assert.ok(hard.screened && hard.reasons[0].kind === 'clearance')
  const soft = screenDecision(extractGates('Ability to obtain a security clearance is a plus. No visa sponsorship available. CDL Class A required.'), {})
  assert.ok(!soft.screened)
  const kinds = soft.flags.map((f) => f.kind).sort()
  assert.deepEqual(kinds, ['clearance', 'license', 'sponsorship'])
})

test('prescreen: score blends skill overlap + freshness; flags subtract; screened scores 0', () => {
  const cv = 'Analyst with SQL, Python, Excel dashboards and reporting experience.'
  const jdGood = 'Analyst role: SQL, Python, Excel, dashboards, reporting.'
  const today = '2026-06-12'
  const fresh = prescreenRole({ jdText: jdGood, cvText: cv, posted: '2026-06-10', today, profile: {} })
  const stale = prescreenRole({ jdText: jdGood, cvText: cv, posted: '2026-03-01', today, profile: {} })
  assert.ok(fresh.score > stale.score, 'fresher posting must outrank the same JD stale')
  assert.equal(freshnessPoints('', '', today), 12) // unknown age → neutral
  const noJd = prescreenRole({ jdText: '', cvText: cv, posted: '2026-06-10', today, profile: {} })
  assert.ok(!noJd.screened && !noJd.jdAvailable && noJd.score > 0) // unreachable JD never screens
  const screened = prescreenRole({ jdText: 'Requires 9+ years of experience.', cvText: cv, today, profile: { target_levels: ['entry'] } })
  assert.equal(screened.score, 0)
  assert.ok(reasonLine(screened.reasons).includes('9+ years'), 'reason carries the quote')
})

test('pipeline: prescreen columns persist, recordPrescreen annotates, old files read clean', () => {
  assert.ok(PIPELINE_COLS.includes('prescreen') && PIPELINE_COLS.includes('screen_reason'))
  const rows = mergeScanned([], [{ company: 'Acme', title: 'Analyst I', url: 'u1' }], '2026-06-12')
  const out = recordPrescreen(rows, 'u1', { score: 73, reason: '' }, '2026-06-12')
  assert.equal(out.find((r) => r.url === 'u1').prescreen, '73')
  assert.equal(recordPrescreen(rows, 'missing', { score: 1 }, '2026-06-12'), null) // never invents rows
  // an old pipeline file without the new columns reads with '' backfill (header-name reads)
  const serialized = serializePipeline(out)
  assert.ok(serialized.split('\n')[0].includes('screen_reason'))
})

test('pipeline: pendingQueue ranks by prescreen then freshness; screened excluded unless asked', () => {
  const rows = [
    { url: 'a', status: 'scanned', score: '', prescreen: '40', screen_reason: '', posted: '2026-06-01', first_seen: '' },
    { url: 'b', status: 'scanned', score: '', prescreen: '90', screen_reason: '', posted: '2026-05-01', first_seen: '' },
    { url: 'c', status: 'scanned', score: '', prescreen: '0', screen_reason: 'asks for more experience', posted: '2026-06-11', first_seen: '' },
    { url: 'd', status: 'scanned', score: '', prescreen: '', screen_reason: '', posted: '2026-06-11', first_seen: '' },
    { url: 'e', status: 'applied', score: '', prescreen: '99', screen_reason: '', posted: '', first_seen: '' }, // tracked → not pending
    { url: 'f', status: 'evaluated', score: '4.1', prescreen: '80', screen_reason: '', posted: '', first_seen: '' },
  ]
  const q = pendingQueue(rows)
  assert.deepEqual(q.map((r) => r.url), ['b', 'a', 'd']) // prescreen desc; unscored after scored; screened out
  const all = pendingQueue(rows, { includeScreened: true })
  assert.ok(all.map((r) => r.url).includes('c'))
})

// --- Outreach (the referral lever) ---

test('outreach: people-finder builds LinkedIn search links; manager search strips level tokens', () => {
  assert.equal(baseRoleTitle('Senior Data Analyst II'), 'Data Analyst')
  assert.equal(baseRoleTitle('Jr. Software Engineer'), 'Software Engineer')
  const links = peopleFinderLinks({ company: 'Acme Corp', role: 'Data Analyst I' })
  assert.equal(links.length, 3)
  assert.ok(links.every((l) => l.url.startsWith('https://www.linkedin.com/search/results/people/?keywords=')))
  assert.ok(decodeURIComponent(links[0].url).includes('"Acme Corp" recruiter'))
  assert.ok(decodeURIComponent(links[1].url).includes('"Data Analyst" manager'))
})

test('outreach: business days skip weekends', () => {
  assert.equal(businessDaysBetween('2026-06-05', '2026-06-08'), 1) // Fri → Mon
  assert.equal(businessDaysBetween('2026-06-08', '2026-06-12'), 4) // Mon → Fri same week
  assert.equal(businessDaysBetween('2026-06-12', '2026-06-12'), 0)
})

test('outreach: cadence — role cap of 2, one thread per person, follow-up ripe at 5 business days, then hard stop', () => {
  const ledger = [
    { url: 'u1', person: 'Ana Ruiz', kind: 'contact', date: '2026-06-01' },
    { url: 'u1', person: 'Bob Lee', kind: 'contact', date: '2026-06-02' },
  ]
  assert.equal(canContact(ledger, { url: 'u1', person: 'ana ruiz' }).reason, 'duplicate_person') // case-insensitive
  assert.equal(canContact(ledger, { url: 'u1', person: 'Cara Day' }).reason, 'role_cap')
  assert.ok(canContact(ledger, { url: 'u2', person: 'Cara Day' }).ok) // a different role is fine
  assert.equal(canFollowup(ledger, { url: 'u1', person: 'Nobody', today: '2026-06-12' }).reason, 'no_contact')
  assert.equal(canFollowup(ledger, { url: 'u1', person: 'Ana Ruiz', today: '2026-06-03' }).reason, 'too_soon')
  assert.ok(canFollowup(ledger, { url: 'u1', person: 'Ana Ruiz', today: '2026-06-12' }).ok) // ≥5 business days
  const after = [...ledger, { url: 'u1', person: 'Ana Ruiz', kind: 'followup', date: '2026-06-12' }]
  assert.equal(canFollowup(after, { url: 'u1', person: 'Ana Ruiz', today: '2026-07-01' }).reason, 'followed_up') // hard stop
  const { due, closed } = dueFollowups(after, '2026-06-12')
  assert.deepEqual(due.map((d) => d.person), ['Bob Lee'])
  assert.deepEqual(closed.map((c) => c.person), ['Ana Ruiz'])
})

test('outreach: draft lint catches empty, over-length, placeholders, and a missing recipient name', () => {
  assert.ok(lintDraft('Hi Ana — saw the Analyst I role at Acme. My SQL dashboards cut reporting time 40%. Open to a quick chat?', { channel: 'linkedin', person: 'Ana Ruiz' }).ok)
  assert.ok(lintDraft('', {}).problems.some((p) => p.kind === 'empty'))
  assert.ok(lintDraft('x'.repeat(301), { channel: 'linkedin' }).problems.some((p) => p.kind === 'too_long'))
  assert.ok(lintDraft('x'.repeat(301), { channel: 'email' }).ok) // email has no 300-char cap
  assert.ok(lintDraft('Hi {name}, about the role…', {}).problems.some((p) => p.kind === 'placeholder'))
  assert.ok(lintDraft('Hello! Great role at Acme.', { person: 'Ana Ruiz' }).problems.some((p) => p.kind === 'missing_name'))
})

// --- Phase 7.8: salary, dates, dedup, html entities ---

const CARLE = 'Project Manager. Compensation: the pay rate for this position is $37.64 per hour. 401(k) with match up to 5%.'
const CENSYS = 'Engineer. The budgeted annual salary range for this position is $103,000 - $130,000, plus equity. Tuition reimbursement of $5,250 per year.'
const CINCY_BSA = 'Business Systems Analyst. The salary range for this role is $56,800 - $72,500 per year. Relocation up to $10,000.'

test('salary: extractPay reads the 5 ordered rules (hourly/annual, single/range) with sane annualization', () => {
  const carle = extractPay(CARLE)
  assert.equal(carle.period, 'hourly')
  assert.equal(carle.annualMin, 78291) // $37.64 × 2080, single hourly
  assert.equal(carle.annualMax, 78291)
  const censys = extractPay(CENSYS)
  assert.deepEqual([censys.period, censys.annualMin, censys.annualMax], ['annual', 103000, 130000]) // annual range
  assert.ok(!/5250|5,250/.test(String(censys.annualMin) + censys.annualMax)) // tuition $5,250 not mistaken for pay
  const hourlyRange = extractPay('Pay range: $28.00 - $35.00 per hour.')
  assert.deepEqual([hourlyRange.annualMin, hourlyRange.annualMax], [58240, 72800]) // hourly range × 2080
  const kSuffix = extractPay('Salary 225-300k for this role.')
  assert.deepEqual([kSuffix.annualMin, kSuffix.annualMax], [225000, 300000]) // K-suffix, no $
})

test('salary: bandVsTarget is lenient near target (tolerance 0.05 / floor 0.15), never an unknown crash', () => {
  assert.equal(SALARY_TOLERANCE, 0.05)
  assert.equal(SALARY_FLOOR, 0.15)
  const carle = bandVsTarget(extractPay(CARLE), 80000)
  assert.equal(carle.band, 'near') // $78,291 vs $80k target → caught, not rejected
  assert.equal(carle.score, 0.858) // slightly reduced, not zero
  assert.equal(bandVsTarget(extractPay(CENSYS), 80000).band, 'above') // whole range clears target
  assert.equal(bandVsTarget(extractPay('Salary $75,000 - $95,000 a year.'), 80000).band, 'within') // target inside range
  assert.equal(bandVsTarget(extractPay(CINCY_BSA), 80000).band, 'below') // 9.4% under > 5% tolerance (tighter band)
  assert.equal(bandVsTarget(extractPay(CINCY_BSA), 80000).score, 0.375)
  assert.deepEqual(bandVsTarget(null, 80000), { band: 'unknown', score: null, shortfallPct: null })
  assert.equal(bandVsTarget(extractPay(CENSYS), 0).band, 'unknown') // no target set
})

test('salary: false-positive guards — bare numbers, OTE, and foreign currency are not base pay', () => {
  assert.equal(extractPay('Expect 15-20% travel and managing 8-10 engineers over 10-15 years.'), null) // %/counts/years
  assert.equal(extractPay('Our on-target earnings (OTE) range is $285,000 - $350,000.'), null) // OTE ≠ base
  assert.equal(extractPay('The salary range is CA$120,000 to CA$150,000 CAD.'), null) // foreign currency
  // but a base range stated alongside variable comp IS base pay
  const base = extractPay('Your base salary will be between $73,040 - $91,300 plus a variable compensation.')
  assert.deepEqual([base.annualMin, base.annualMax], [73040, 91300])
})

test('salary: entity- and USD-suffixed ranges parse fully (the production truncation bug)', () => {
  const ent = extractPay('Base Pay Range$73,125&mdash;$117,000 USD') // Greenhouse pay-transparency widget shape
  assert.deepEqual([ent.annualMin, ent.annualMax], [73125, 117000]) // not truncated to the floor
  const usd = extractPay('The salary range is $143,000 USD - $177,000 USD for this position.')
  assert.deepEqual([usd.annualMin, usd.annualMax], [143000, 177000])
  // location-tiered: pick the non-HCOL band for a Midwest/SE candidate
  const tiered = extractPay('For the SF Bay Area: $174,000 - $206,000. For all other US locations: $151,000 - $191,000.')
  assert.equal(tiered.location_tiered, true)
  assert.equal(tiered.annualMin, 151000) // the non-HCOL range
})

test('salary: formatPay / paySummary render compact human labels', () => {
  assert.equal(formatPay(extractPay(CENSYS)), '$103k–130k')
  assert.equal(formatPay(extractPay(CARLE)), '$37.64/hr')
  assert.equal(formatPay(null), '')
  assert.equal(paySummary(extractPay(CENSYS), 80000), '$103k–130k (above)')
  assert.equal(paySummary(null, 80000), '')
})

test('html: decodeEntities now resolves dash/quote entities so JD pay ranges survive', () => {
  assert.equal(decodeEntities('$73,125&mdash;$117,000'), '$73,125—$117,000')
  assert.equal(decodeEntities('a&ndash;b'), 'a–b')
  assert.equal(decodeEntities('Don&rsquo;t &amp; &lt;tag&gt;'), 'Don’t & <tag>')
  assert.equal(stripTags('<p>Pay: <span>$80,000&mdash;$104,000</span></p>'), 'Pay: $80,000—$104,000')
  assert.equal(decodeEntities('&#X2014;'), '—') // capital-X hex entity is valid HTML
  assert.equal(decodeEntities('&amp;#x2014;'), '&#x2014;') // single pass — no double-decode
})

test('dates: normalizeResumeDates resolves Present in ranges to today, leaves prose alone', () => {
  assert.equal(monthYear('2026-06-13'), 'Jun 2026')
  assert.equal(monthYear('nope'), '')
  assert.equal(normalizeResumeDates('Engineer, Mar 2025 – Present', '2026-06-13'), 'Engineer, Mar 2025 – Jun 2026')
  assert.equal(normalizeResumeDates('Analyst, Jan 2023 to current', '2026-06-13'), 'Analyst, Jan 2023 to Jun 2026')
  assert.equal(normalizeResumeDates('I will present my findings to the board.', '2026-06-13'), 'I will present my findings to the board.')
  assert.equal(monthYear('2026-13'), '') // out-of-range month rejected, not clamped (was Dec 2026)
  assert.equal(normalizeResumeDates('Dev, 2024-present', '2026-06-13'), 'Dev, 2024-Jun 2026') // dash range still resolves
  for (const prose of ['Promoted to present role in 2024.', 'Adapted to current standards.', 'Reported to now-retired lead.', 'A present-day example.']) {
    assert.equal(normalizeResumeDates(prose, '2026-06-13'), prose) // to/through + word in prose is NOT a date range
  }
})

test('regions: canonicalLocation collapses a metro to one key, keeps different metros distinct', () => {
  assert.equal(canonicalLocation('Cincinnati, OH'), 'cincinnati')
  assert.equal(canonicalLocation("Cincinnati Children's Hospital, Cincinnati, OH"), 'cincinnati') // campus collapses
  assert.equal(canonicalLocation('Cleveland, OH'), 'cleveland') // same state, different metro → distinct
  assert.equal(canonicalLocation('Remote - US'), 'remote')
  assert.notEqual(canonicalLocation('Chicago, IL'), canonicalLocation('Detroit, MI'))
})

test('pipeline: near-duplicate postings collapse into a survivor alias; writes resolve through it', () => {
  let rows = mergeScanned([], [
    { company: 'Kettering', title: 'PM Oper Excellence', url: 'k1', location: 'Dayton, OH' },
    { company: 'Kettering', title: 'PM Oper Excellence', url: 'k2', location: 'Dayton, OH' }, // dup
    { company: 'Kettering', title: 'Data Engineer', url: 'k3', location: 'Dayton, OH' }, // distinct role
  ], '2026-06-13')
  assert.equal(rows.length, 2) // k2 absorbed into k1; k3 stays
  assert.equal(roleKey('Kettering', 'PM Oper Excellence', 'Dayton, OH'), roleKey('Kettering', 'PM  Oper  Excellence', 'Dayton OH'))
  const survivor = rows.find((r) => r.url === 'k1')
  assert.ok(survivor.aliases.split(',').includes('k2'))
  assert.equal(resolveAlias(rows, 'k2'), 'k1') // a write to the dup lands on the survivor
  rows = recordEval(rows, { url: 'k2', score: 4.2 }, '2026-06-14')
  assert.equal(rows.length, 2) // no resurrected row
  assert.equal(rows.find((r) => r.url === 'k1').score, 4.2)
})

test('pipeline: prune keeps a survivor whose alias is still live; pay column persists', () => {
  const rows = mergeScanned([], [
    { company: 'Acme', title: 'Analyst', url: 'a1', location: 'Chicago, IL' },
    { company: 'Acme', title: 'Analyst', url: 'a2', location: 'Chicago, IL' }, // alias of a1
  ], '2026-06-13')
  assert.equal(pruneScanned(rows, new Set(['a2'])).pruned, 0) // a1 kept because alias a2 is on the board
  assert.equal(pruneScanned(rows, new Set(['gone'])).pruned, 1) // neither live → pruned
  assert.ok(PIPELINE_COLS.includes('pay') && PIPELINE_COLS.includes('aliases'))
  const out = recordPrescreen(rows, 'a1', { score: 80, reason: '', pay: '$103k–130k (above)' }, '2026-06-13')
  assert.equal(out.find((r) => r.url === 'a1').pay, '$103k–130k (above)')
})

test('prescreen: salary blends into rank but never screens a role out (4.5 honesty)', () => {
  assert.equal(blendSalary(80, null, 0.05), 80) // no pay → unchanged
  assert.equal(blendSalary(80, 1, 0), 80) // weight 0 → unchanged
  assert.equal(blendSalary(80, 1, 0.05), 81) // above-target nudges up
  assert.equal(blendSalary(80, 0, 0.05), 76) // below-target dips but never to 0
  assert.ok(blendSalary(50, 0, 1) >= 1) // even at max weight + zero salary, a non-screened role stays > 0
  const cv = 'Analyst with SQL and Python skills.'
  const jd = 'Analyst role using SQL and Python. The annual salary range is $110,000 - $140,000.'
  const hi = prescreenRole({ jdText: jd, cvText: cv, posted: '2026-06-12', today: '2026-06-13', profile: { target_salary: 80000, score_weights: { salary: 0.05 } } })
  const lo = prescreenRole({ jdText: jd, cvText: cv, posted: '2026-06-12', today: '2026-06-13', profile: { target_salary: 200000, score_weights: { salary: 0.05 } } })
  assert.equal(hi.payBand.band, 'above')
  assert.equal(lo.payBand.band, 'below')
  assert.ok(hi.score > lo.score) // same JD, only the target differs → above-target ranks higher
  assert.ok(lo.score > 0) // pay never zeroes a non-screened role
})

test('salary: extractPay runs clean over the committed live corpus, mdash ranges intact (offline)', () => {
  const corpus = JSON.parse(readFileSync(path.join(ROOT, 'test', 'fixtures', 'salary-corpus.json'), 'utf8'))
  assert.ok(corpus.length >= 50, `expected a real corpus, got ${corpus.length}`)
  let extracted = 0
  for (const j of corpus) if (extractPay(j.description)) extracted++ // must never throw on real data
  assert.ok(extracted >= 40, `expected ≥40 extractions over real JDs, got ${extracted}`)
  const mdash = corpus.filter((j) => /\$[\d,]+&mdash;\$[\d,]+/.test(j.description))
  assert.ok(mdash.length >= 5, `expected mdash pay ranges in the corpus, got ${mdash.length}`)
  const fullRanges = mdash.map((j) => extractPay(j.description)).filter((p) => p && p.annualMin !== p.annualMax)
  assert.ok(fullRanges.length >= Math.floor(mdash.length * 0.6), `mdash ranges must parse as ranges not floors: ${fullRanges.length}/${mdash.length}`)
})

// --- Phase 8b: inference backend (winc.cpp local + api), all offline via a loopback mock server ---

// Spin a fake Messages-API server on 127.0.0.1 (loopback = no external network). Returns { url, close }.
function mockBackend({ reply = 'Fit score: 4.2 (Apply)\nRecommendation: strong SQL match' } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') { res.writeHead(200); res.end('ok'); return }
      if (req.method === 'POST' && req.url === '/v1/messages') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ model: 'mock-2b', content: [{ type: 'text', text: reply }], usage: { input_tokens: 40, output_tokens: 12 } }))
        return
      }
      res.writeHead(404); res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }))
  })
}

test('inference: resolveBackend defaults to local winc, honors profile + env overrides', () => {
  const d = resolveBackend({}, {})
  assert.equal(d.mode, 'local')
  assert.equal(d.localUrl, WINC_DEFAULT_URL)
  assert.ok(d.apiModel && d.apiUrl.startsWith('https://'))
  assert.equal(resolveBackend({ inference: 'api' }, {}).mode, 'api')
  assert.equal(resolveBackend({ inference: 'bogus' }, {}).mode, 'local') // unknown → local
  assert.equal(resolveBackend({ inference_url: 'http://127.0.0.1:9000/' }, {}).localUrl, 'http://127.0.0.1:9000') // trailing slash trimmed
  assert.equal(resolveBackend({}, { JOBDAR_INFERENCE_URL: 'http://localhost:1234' }).localUrl, 'http://localhost:1234')
})

test('inference: isLoopbackUrl gates the no-TLS local path', () => {
  for (const u of ['http://127.0.0.1:8080', 'http://localhost:8080', 'http://[::1]:8080']) assert.ok(isLoopbackUrl(u), u)
  for (const u of ['https://api.anthropic.com', 'http://evil.example.com', 'not a url']) assert.ok(!isLoopbackUrl(u), u)
})

test('inference: parseVerdict reads the modes/eval.md format; band falls back to the score', () => {
  assert.deepEqual(parseVerdict('Fit score: 4.2 (Apply)\nRecommendation: strong fit'), { score: 4.2, band: 'apply', recommendation: 'strong fit' })
  assert.equal(parseVerdict('Fit score: 3.6').band, 'research') // band derived from score when no tag
  assert.equal(parseVerdict('Fit score: 2.0').band, 'dont')
  assert.equal(parseVerdict('no score here').score, null)
  // band comes from the score line's tag, not stray prose (a 2B model's preamble must not hijack it)
  assert.deepEqual(parseVerdict("don't rule it out — Fit score: 4.8 (Apply)"), { score: 4.8, band: 'apply', recommendation: '' })
  assert.equal(parseVerdict('Fit score: 4.5\nRecommendation: research the salary, then apply').band, 'apply') // no tag → from score
  // off-rubric numbers (model drifted to 0–10 / 0–100) are unparsed, never a truncated wrong score
  assert.equal(parseVerdict('Fit score: 10').score, null)
  assert.equal(parseVerdict('Fit score: 50').score, null)
})

test('inference: backendHealth — loopback up is true, closed port false, non-loopback false', async () => {
  const m = await mockBackend()
  assert.equal(await backendHealth(m.url), true)
  await m.close()
  assert.equal(await backendHealth(m.url, { timeoutMs: 500 }), false) // server closed
  assert.equal(await backendHealth('https://api.anthropic.com'), false) // not loopback → not probed
})

test('inference: selectActive resolves local/api/auto; auto falls back to api when winc is down', async () => {
  const m = await mockBackend()
  const localProfile = { inference: 'local', inference_url: m.url }
  const up = await selectActive(localProfile)
  assert.equal(up.kind, 'local')
  assert.equal(up.up, true)
  const prevKey = process.env.JOBDAR_API_KEY
  process.env.JOBDAR_API_KEY = 'sk-test'
  try {
    const api = await selectActive({ inference: 'api' })
    assert.equal(api.kind, 'api')
    assert.equal(api.up, true)
    const auto = await selectActive({ inference: 'auto', inference_url: m.url })
    assert.equal(auto.kind, 'local') // winc up → auto picks local
    await m.close()
    const autoDown = await selectActive({ inference: 'auto', inference_url: m.url })
    assert.equal(autoDown.kind, 'api') // winc down + key → auto picks api
  } finally {
    if (prevKey === undefined) delete process.env.JOBDAR_API_KEY
    else process.env.JOBDAR_API_KEY = prevKey
  }
})

test('inference: callMessages + evaluate complete a round-trip and parse the verdict (mock backend)', async () => {
  const m = await mockBackend()
  const active = { kind: 'local', baseUrl: m.url, key: '', model: '' }
  const r = await callMessages(active, { system: 'sys', user: 'hi', maxTokens: 64 })
  assert.ok(r.text.includes('Fit score'))
  assert.deepEqual(r.usage, { input_tokens: 40, output_tokens: 12 })
  const v = await evaluate({ active, jd: 'Data Analyst — SQL, Excel.', cv: 'Analyst with SQL.', today: '2026-06-13' })
  assert.equal(v.score, 4.2)
  assert.equal(v.band, 'apply')
  assert.equal(v.backend, 'local')
  await m.close()
})

// Mock an OpenAI chat-completions server (Ollama/llamafile shape) on loopback.
function mockOpenAI({ content = 'Fit score: 4.0 (Apply)\nRecommendation: solid' } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/tags') { res.writeHead(200); res.end('{}'); return }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ model: 'ollama-qwen', choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 30, completion_tokens: 9 } }))
        return
      }
      res.writeHead(404); res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }))
  })
}

test('inference: 8b.3 runtime resolution — winc (Messages) default, ollama/llamafile (OpenAI) shims', () => {
  assert.deepEqual(LOCAL_RUNTIMES, ['winc', 'ollama', 'llamafile'])
  const w = resolveBackend({}, {})
  assert.equal(w.runtime, 'winc'); assert.equal(w.protocol, 'messages'); assert.equal(w.healthPath, '/health')
  const o = resolveBackend({ inference_runtime: 'ollama' }, {})
  assert.equal(o.protocol, 'openai'); assert.equal(o.localUrl, 'http://127.0.0.1:11434'); assert.equal(o.healthPath, '/api/tags')
  assert.equal(resolveBackend({ inference_runtime: 'llamafile' }, {}).localUrl, 'http://127.0.0.1:8080')
  assert.equal(resolveBackend({ inference_runtime: 'bogus' }, {}).runtime, 'winc') // unknown → winc
  assert.equal(resolveBackend({ local_model: 'qwen2.5' }, {}).localModel, 'qwen2.5')
})

test('inference: 8b.3 OpenAI-compat shim — health, selectActive, and an eval round-trip (mock ollama)', async () => {
  const m = await mockOpenAI()
  const profile = { inference: 'local', inference_runtime: 'ollama', inference_url: m.url, local_model: 'qwen2.5' }
  assert.equal(await backendHealth(m.url, { path: '/api/tags' }), true)
  const active = await selectActive(profile)
  assert.equal(active.protocol, 'openai'); assert.equal(active.up, true); assert.equal(active.model, 'qwen2.5')
  const r = await callOpenAI(active, { system: 's', user: 'u' })
  assert.ok(r.text.includes('Fit score'))
  assert.deepEqual(r.usage, { input_tokens: 30, output_tokens: 9 }) // OpenAI usage mapped to the Messages shape
  const v = await evaluate({ active, jd: 'Data Analyst — SQL.', cv: 'Analyst with SQL.', today: '2026-06-14' })
  assert.equal(v.score, 4.0); assert.equal(v.band, 'apply'); assert.equal(v.runtime, 'ollama') // callBackend dispatched to OpenAI
  await m.close()
})

test('inference: 8b.3 callBackend routes by protocol; callOpenAI enforces the loopback guard', async () => {
  await assert.rejects(callOpenAI({ runtime: 'ollama', baseUrl: 'https://evil.example.com', key: 'k' }, { user: 'x' }), /loopback/)
  const mm = await mockBackend() // answers ONLY /v1/messages (+/health)
  const mo = await mockOpenAI() //  answers ONLY /v1/chat/completions (+/api/tags)
  const viaMessages = await callBackend({ kind: 'local', protocol: 'messages', baseUrl: mm.url }, { user: 'u' })
  assert.ok(viaMessages.text.includes('Fit score')) // routed to /v1/messages (would 404→throw if misrouted)
  const viaOpenAI = await callBackend({ kind: 'local', protocol: 'openai', runtime: 'ollama', baseUrl: mo.url, model: 'm' }, { user: 'u' })
  assert.ok(viaOpenAI.text.includes('Fit score')) // routed to /v1/chat/completions
  await mm.close(); await mo.close()
})

test('inference: selectActive marks an OpenAI runtime with no model NOT ready (ollama /api/tags 200s regardless)', async () => {
  const m = await mockOpenAI()
  const noModel = await selectActive({ inference: 'local', inference_runtime: 'ollama', inference_url: m.url }) // local_model blank
  assert.equal(noModel.up, false) // daemon up but no model → not ready
  assert.match(noModel.reason, /no model/)
  const withModel = await selectActive({ inference: 'local', inference_runtime: 'ollama', inference_url: m.url, local_model: 'qwen2.5' })
  assert.equal(withModel.up, true)
  await m.close()
})

test('inference: callMessages guards — api requires HTTPS + key; local requires loopback', async () => {
  await assert.rejects(callMessages({ kind: 'api', baseUrl: 'http://127.0.0.1:1', key: 'k' }, { user: 'x' }), /non-HTTPS/)
  await assert.rejects(callMessages({ kind: 'api', baseUrl: 'https://api.anthropic.com', key: '' }, { user: 'x' }), /No API key/)
  await assert.rejects(callMessages({ kind: 'local', baseUrl: 'http://evil.example.com', key: '' }, { user: 'x' }), /loopback/)
})

// --- Phase 8a: the automated eval engine (decomposed rubric, code-computed score, §3 gate/clamp) ---

const ALL = (r) => ({ skills: { rating: r }, experience: { rating: r }, level_fit: { rating: r }, logistics: { rating: r }, education: { rating: r } })

test('8a: scoreFromJudgments computes the weighted 0–5 (code owns the number, not the model)', () => {
  assert.equal(scoreFromJudgments(ALL('strong')), 5.0)
  assert.equal(scoreFromJudgments(ALL('none')), 0.0)
  // skills strong .35 + exp partial .125 + level strong .20 + logistics none 0 + edu partial .05 = .725 → 3.6
  assert.equal(scoreFromJudgments({ skills: { rating: 'strong' }, experience: { rating: 'partial' }, level_fit: { rating: 'strong' }, logistics: { rating: 'none' }, education: { rating: 'partial' } }), 3.6)
  assert.equal(scoreFromJudgments({}), 0.0) // missing → none
})

test('8a: parseEvalJson extracts the verdict object; stripPII scrubs the CV slice', () => {
  assert.deepEqual(parseEvalJson('reasoning… {"required":{"candidate_meets_all":true}} trailing'), { required: { candidate_meets_all: true } })
  assert.equal(parseEvalJson('no json here'), null)
  assert.equal(stripPII('Jane Roe — jane@x.com — 555-123-4567 — https://li.com/in/jane', { name: 'Jane Roe' }), '[name] — [email] — [phone] — [url]')
  assert.equal(stripPII('Acme 2019-2023; B.S. 2015-2019'), 'Acme 2019-2023; B.S. 2015-2019') // date ranges must survive (not eaten as phones)
  assert.deepEqual(parseEvalJson('{"a":1} then a stray } brace'), { a: 1 }) // balanced-brace fallback past trailing prose
})

test('8a: clampVerdict forces Don\'t on unmet requirements / hard gates; no_degree exempts the degree', () => {
  const meets = clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: false }, profile: {} })
  assert.deepEqual([meets.clamped, meets.band], [false, 'apply'])
  const unmet = clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: false, note: '5+ yrs' } }, gates: {}, decision: { screened: false }, profile: {} })
  assert.equal(unmet.clamped, true); assert.equal(unmet.band, 'dont'); assert.ok(unmet.score <= 3.4)
  const yearsGate = clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'years', quote: '8+ years' }] }, profile: {} })
  assert.equal(yearsGate.band, 'dont')
  // no_degree: a degree screen must NOT clamp (4.5 honesty — flag, never auto-zero)
  const degNoDegree = clampVerdict({ score: 4.2, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'degree', quote: "Bachelor's required" }] }, profile: { tuning_profile: 'no_degree' } })
  assert.equal(degNoDegree.clamped, false)
  assert.doesNotThrow(() => clampVerdict({ score: 4, judgments: {}, gates: {}, decision: { screened: true }, profile: {} })) // reasons missing → no crash
  assert.equal(clampVerdict({ score: 4.5, judgments: { required: { candidate_meets_all: 'no' } }, gates: {}, decision: { screened: false }, profile: {} }).band, 'dont') // stringy negative still clamps
})

test('8a: buildEvalUser injects the verified gate facts + today, and the JD/CV', () => {
  const gates = { years: { years: 5, quote: '5+ years' }, degree: { gate: 'yes' }, clearance: { gate: 'none' }, license: { flagged: false } }
  const u = buildEvalUser({ jd: 'Need SQL', cv: 'I know SQL', profile: { target_levels: ['entry'] }, gates, today: '2026-06-14' })
  assert.ok(u.includes("Today's date is 2026-06-14"))
  assert.ok(u.includes('Minimum years of experience required: 5'))
  assert.ok(u.includes('Need SQL') && u.includes('I know SQL'))
  assert.doesNotThrow(() => buildEvalUser({ jd: 'x', cv: 'y', profile: {}, gates: {}, today: '2026-06-14' })) // partial/empty gates are null-safe
})

test('8a: evalRole runs the full pipeline against a backend (mock) — score, band, clamp, pay merge', async () => {
  const verdict = JSON.stringify({ required: { candidate_meets_all: true }, ...ALL('strong'), recommendation: 'strong match' })
  const m = await mockBackend({ reply: verdict })
  const active = { kind: 'local', protocol: 'messages', baseUrl: m.url }
  const jd = 'Data Analyst (entry). SQL, Excel. The annual salary range is $90,000 - $110,000.'
  const v = await evalRole({ active, jd, cv: 'Analyst with SQL and Excel.', profile: { target_salary: 80000 }, today: '2026-06-14' })
  assert.equal(v.ok, true); assert.equal(v.score, 5.0); assert.equal(v.band, 'apply'); assert.equal(v.clamped, false)
  assert.equal(v.recommendation, 'strong match')
  assert.ok(v.pay.includes('above')) // pay merged post-model (not in the score)
  await m.close()
  // a model that fails the requirements clamps to Don't regardless of strong sub-scores
  const m2 = await mockBackend({ reply: JSON.stringify({ required: { candidate_meets_all: false, note: 'needs PE license' }, ...ALL('strong'), recommendation: 'x' }) })
  const v2 = await evalRole({ active: { kind: 'local', protocol: 'messages', baseUrl: m2.url }, jd, cv: 'x', profile: {}, today: '2026-06-14' })
  assert.equal(v2.band, 'dont'); assert.equal(v2.clamped, true)
  await m2.close()
})

test('8a: prepEval + buildVerdict — the batch-shared pure path; a hard gate clamps despite strong scores', () => {
  const prep = prepEval({ jd: 'Need 5+ years experience. SQL.', cv: 'SQL analyst.', profile: { target_levels: ['entry'] }, today: '2026-06-14' })
  assert.equal(prep.gates.years.years, 5)
  assert.equal(prep.decision.screened, true) // 5 > entry ceiling (2)
  assert.ok(prep.user.includes('5'))
  const v = buildVerdict({ text: JSON.stringify({ required: { candidate_meets_all: true }, ...ALL('strong'), recommendation: 'r' }), jd: 'SQL. Salary $90,000-$110,000.', gates: prep.gates, decision: prep.decision, profile: { target_salary: 80000 } })
  assert.equal(v.clamped, true); assert.equal(v.band, 'dont') // years gate overrides the strong sub-scores
  assert.ok(v.pay.includes('above')) // pay still merged
})

test('8a.5: bandAgreement computes overall + per-tier accuracy; clampLogEntry carries no CV text', () => {
  const a = bandAgreement([{ got: 'apply', expected: 'apply' }, { got: 'dont', expected: 'research' }, { got: 'dont', expected: 'dont' }, { got: 'research', expected: undefined }])
  assert.equal(a.n, 3) // the row with no expected band is ignored
  assert.equal(a.overall, 67) // 2 of 3
  assert.deepEqual(a.perTier.dont, { correct: 1, total: 1 })
  assert.deepEqual(a.perTier.research, { correct: 0, total: 1 })
  const e = clampLogEntry({ score: 3.0, rawScore: 4.6, band: 'dont', model: 'm', backend: 'local', recommendation: 'years' }, { url: 'u', company: 'C', role: 'R' })
  assert.deepEqual([e.url, e.raw_score, e.final_score, e.band], ['u', 4.6, 3.0, 'dont'])
  assert.ok(!('cv' in e) && !('resume' in e)) // privacy: never the résumé text
})

test('8a.7: buildBatchRequests + parseBatchResults shape the Batches wire format (cached prefix)', () => {
  const reqs = buildBatchRequests([{ custom_id: 'r0', user: 'u0' }, { user: 'u1' }], { model: 'm', system: 'SYS' })
  assert.equal(reqs.length, 2)
  assert.deepEqual([reqs[0].custom_id, reqs[1].custom_id], ['r0', 'role-1'])
  assert.equal(reqs[0].params.model, 'm')
  assert.equal(reqs[0].params.system[0].cache_control.type, 'ephemeral') // 8a.8 cache on the stable prefix
  assert.equal(reqs[0].params.messages[0].content, 'u0')
  const parsed = parseBatchResults([
    { custom_id: 'r0', result: { type: 'succeeded', message: { content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5 } } } },
    { custom_id: 'r1', result: { type: 'errored' } },
  ])
  assert.equal(parsed.r0.text, 'ok'); assert.deepEqual(parsed.r0.usage, { input_tokens: 5 })
  assert.equal(parsed.r1.status, 'errored'); assert.equal(parsed.r1.text, '')
})

test('8c: extractText reads text, flags missing/unsupported; isExtractable gates file types', () => {
  const md = extractText(path.join(ROOT, 'CLAUDE.md'))
  assert.ok(md.text.length > 50)
  assert.equal(md.error, undefined)
  assert.equal(extractText('/no/such/file.docx').error, 'not-found')
  assert.equal(extractText(path.join(ROOT, 'package.json')).error, 'unsupported') // .json not a doc type
  assert.ok(isExtractable('resume.docx') && isExtractable('jd.pdf') && isExtractable('notes.txt'))
  assert.ok(!isExtractable('photo.png') && !isExtractable('data.csv'))
})

test('8c/pre-confirm: parsePreConfirm reads the triage verdict; unknown → maybe (never drops a role)', () => {
  assert.equal(parsePreConfirm('{"verdict":"skip","reason":"wrong field"}').verdict, 'skip')
  assert.equal(parsePreConfirm('reasoning… {"verdict":"fit"}').verdict, 'fit')
  assert.equal(parsePreConfirm('garbage, no json').verdict, 'maybe')
  assert.equal(parsePreConfirm('{"verdict":"weird"}').verdict, 'maybe')
  assert.equal(parsePreConfirm('{"verdict":"skip","reason":"x"}').reason, 'x')
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
