// Jobdar — test runner (zero dependencies). Run with `npm test`.
// Covers the foundation + bilingual core: i18n parity & interpolation, shipped defaults,
// the provider registry / Greenhouse detect(), EN<->ES modes parity, and state aliases.

import { strict as assert } from 'node:assert'
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { getStrings, listKeys, getT } from './lib/i18n.mjs'
import { PROFILE_DEFAULTS, SUPPORTED_LANGUAGES, paths, ROOT as PKG_ROOT, atomicWrite } from './lib/config.mjs'
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
import { regionStateSet, locationMatches, filterByLocation, canonicalLocation, regionPriority, regionForLocation } from './lib/regions.mjs'
import { selectEmployers, toPortals } from './lib/seed.mjs'
import { parseResumeText } from './lib/resume.mjs'
import { renderDashboard, analyze } from './lib/commands/dashboard.mjs'
import { renderTui, pipelineView } from './lib/commands/tui.mjs'
import { mergeScanned, recordEval, serializePipeline, band, isEvaluated, isTracked, setStatus, pruneScanned, PIPELINE_COLS, recordPrescreen, pendingQueue, roleKey, resolveAlias } from './lib/evaluations.mjs'
import { extractYearsRequired, extractDegreeGate, extractGates, screenDecision, prescreenRole, freshnessPoints, reasonLine, blendSalary, extractCredential, extractField, cvHasField, cvHasCredential, isHardIdentity, extractSponsorship } from './lib/prescreen.mjs'
import { extractPay, bandVsTarget, formatPay, paySummary, SALARY_TOLERANCE, SALARY_FLOOR } from './lib/salary.mjs'
import { normalizeResumeDates, monthYear } from './lib/dates.mjs'
import { decodeEntities, stripTags } from './lib/html.mjs'
import { baseRoleTitle, peopleFinderLinks, businessDaysBetween, canContact, canFollowup, dueFollowups, lintDraft, draftOutreach, buildOutreachUser, OUTREACH_SYSTEM } from './lib/outreach.mjs'
import { trackerRowsFrom } from './lib/tracker.mjs'
import { cvToHtml, matchedKeywords } from './lib/cv_render.mjs'
import http from 'node:http'
import { resolveBackend, isLoopbackUrl, parseVerdict, selectActive, backendHealth, callMessages, callOpenAI, callBackend, evaluate, WINC_DEFAULT_URL, LOCAL_RUNTIMES } from './lib/inference.mjs'
import { scoreFromJudgments, parseEvalJson, stripPII, clampVerdict, buildEvalUser, evalRole, buildVerdict, prepEval } from './lib/eval_engine.mjs'
import { bandAgreement, buildBatchRequests, parseBatchResults, clampLogEntry } from './lib/eval_ops.mjs'
import { expandQueryTerms, relevanceScore, parseIntent } from './lib/search.mjs'
import { feedbackStats } from './lib/feedback.mjs'
import usajobs, { parseUsaJobsSearchUrl, parseUsaJobsJobUrl, buildSearchUrl, mapSearchItems, assembleJd } from './providers/usajobs.mjs'
import { slugVariants, atsCandidates, discoverCompanies } from './lib/discover.mjs'
import { extractText, isExtractable, structureCv } from './lib/docparse.mjs'
import { importDocument, evaluate as engineEvaluate, recordVerdict, advanceStatus, buildCv, ENGINE_VERSION, tailor as engineTailor } from './lib/engine.mjs'
import { coverIsComplete, assembleTailoredCv, TAILOR_JSON_SCHEMA, buildTailorUser, directiveBlock, TAILOR_SYSTEM, fillSignature } from './lib/tailor.mjs'
import { effectiveDirectives, contentHash, recordVariant } from './lib/customize_store.mjs'
import { parsePreConfirm, isBorderline, evalSystemFor, preConfirmSystemFor } from './lib/eval_engine.mjs'
import { resolvePay, socForTitle, loadWages, loadSocMap } from './lib/pay.mjs'
import { parseNextCount, reportFooterLines, NEXT_MAX } from './lib/commands/eval.mjs'
import { findRoleMatches } from './lib/commands/tailor.mjs'
import { resolveJdSafe } from './lib/commands/_jd.mjs'
import { renderRadar, renderSweep, fmtEta, fmtElapsed, visibleLength, createRadar, SWEEP_FRAMES } from './lib/progress.mjs'

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

test('safety: atomicWrite writes, overwrites in place, and leaves no orphan .tmp on success', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-atomic-'))
  const f = path.join(dir, 'store.tsv')
  atomicWrite(f, 'one\n')
  assert.equal(readFileSync(f, 'utf8'), 'one\n')
  atomicWrite(f, 'two\n') // overwrite an existing store — the crash-safe path must replace, not append
  assert.equal(readFileSync(f, 'utf8'), 'two\n')
  // crash-safety contract: the temp file is renamed onto the target, never left behind on a clean write
  assert.ok(!readdirSync(dir).some((n) => n.endsWith('.tmp')), 'no orphan .tmp after a successful write')
  rmSync(dir, { recursive: true, force: true })
})

test('safety: a malformed profile.yml raises a clean userFacing error, not a raw YAMLException', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-badyaml-'))
  writeFileSync(path.join(dir, 'profile.yml'), 'name: ok\nname: dup\n') // duplicate mapping key → invalid YAML
  const out = execFileSync(
    process.execPath,
    ['-e', "import('./lib/config.mjs').then((m) => { try { m.loadProfile(); console.log('NO_THROW') } catch (e) { console.log(JSON.stringify({ userFacing: !!e.userFacing, msg: e.message })) } })"],
    { cwd: ROOT, env: { ...process.env, JOBDAR_CONFIG_DIR: dir }, encoding: 'utf8' },
  )
  const r = JSON.parse(out.trim())
  assert.equal(r.userFacing, true, 'malformed YAML must be flagged userFacing so the CLI prints a clean message')
  assert.ok(/not valid YAML/.test(r.msg), 'the message must explain the profile is invalid')
  assert.ok(!/YAMLException/.test(r.msg), 'the user message must not leak the raw exception class')
  rmSync(dir, { recursive: true, force: true })
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
  // A years ask in a SOFT context ("preferred"/"a plus") is NOT a hard floor → it must not screen.
  assert.equal(extractYearsRequired('1-2 years of experience preferred; 7 years experience is a plus'), null)
  assert.equal(extractYearsRequired('Minimum 5 years of experience required.').years, 5) // a required ask still gates
  const softYears = screenDecision(extractGates('5 years experience preferred but not required.'), { target_levels: ['entry'] })
  assert.ok(!softYears.screened, 'a "preferred" years ask must not screen an entry candidate')
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

test('prescreen: hard FIELD gate — an IT résumé is screened OUT of a hard-identity accounting role', () => {
  const itCv = 'A.S. Information Technology. Python, JavaScript, SQL, PowerShell, REST APIs, troubleshooting, asset tracking, imaging, dashboards.'
  const jd = 'Junior Accountant to support month-end close, reconcile accounts, and maintain budget trackers. Entry level welcome.'
  const r = prescreenRole({ jdText: jd, cvText: itCv, title: 'Junior Accountant', today: '2026-06-15', profile: { target_levels: ['entry'] } })
  assert.ok(r.screened && r.score === 0, 'an IT résumé must be screened out of an accounting role')
  assert.equal(r.reasons.find((x) => x.kind === 'field')?.detail, 'accounting')
  // field detection is TITLE-driven; non-hard-identity titles (software/data/ops) never field-gate
  assert.equal(extractField('Operations Analyst'), null)
  assert.equal(extractField('Junior Accountant').field, 'accounting')
  assert.ok(!isHardIdentity('software') && isHardIdentity('accounting'))
})

test('prescreen: hard CREDENTIAL gate — a required CPA/RN gates whoever lacks it; transferable can NOT bypass', () => {
  const itCv = 'A.S. Information Technology. Python, SQL, troubleshooting.'
  const acctCv = 'B.B.A. Accounting. Reconciled vendor accounts, month-end close, accounts payable, QuickBooks, budget tracker.'
  const cpaJd = 'Senior Accountant. CPA license required. Own the close and audits.'
  // A genuine accountant who lacks the CPA is still gated by the hard credential
  const sofia = prescreenRole({ jdText: cpaJd, cvText: acctCv, title: 'Senior Accountant', today: '2026-06-15', profile: { target_levels: ['mid'] } })
  assert.equal(sofia.reasons.find((x) => x.kind === 'credential')?.detail, 'CPA')
  // transferable_skills must NEVER bridge a hard credential
  const it = prescreenRole({ jdText: cpaJd, cvText: itCv, title: 'Senior Accountant', today: '2026-06-15', profile: { target_levels: ['mid'], transferable_skills: true } })
  assert.ok(it.screened && it.reasons.some((x) => x.kind === 'credential'), 'transferable cannot bypass a required CPA')
  // required-context conservatism: "preferred" / "ability to obtain" never gates
  assert.equal(extractCredential('Must hold an active RN license.').credential, 'RN')
  assert.equal(extractCredential('RN preferred but not required.').gate, 'none')
  assert.equal(extractCredential('Ability to obtain a CPA is a plus.').gate, 'none')
})

test('prescreen: NEGATIVE — a real accountant is NOT over-gated on a plain accountant role', () => {
  const acctCv = 'B.B.A. Accounting. Reconciled vendor accounts, month-end close, accounts payable, QuickBooks, budget tracker, Excel.'
  const jd = 'Junior Accountant to support month-end close, reconcile accounts, maintain budget trackers. QuickBooks a plus. Entry level.'
  const r = prescreenRole({ jdText: jd, cvText: acctCv, title: 'Junior Accountant', today: '2026-06-15', profile: { target_levels: ['entry'] } })
  assert.ok(!r.screened && r.score > 0, 'a genuine accountant must pass a plain accountant role (no over-gating)')
  // cvHasField needs >=2 distinct field signals — one stray keyword is not enough
  assert.equal(cvHasField('I once used Excel for a budget.', 'accounting'), false)
  assert.equal(cvHasField(acctCv, 'accounting'), true)
  assert.equal(cvHasCredential(acctCv, 'CPA'), false)
})

test('8a: clampVerdict forces Don\'t on a prescreen credential/field gate; transferable cannot lift it', () => {
  const cred = { screened: true, reasons: [{ kind: 'credential', detail: 'CPA', quote: 'CPA license required' }] }
  const v = clampVerdict({ score: 4.7, judgments: { required: { candidate_meets_all: true } }, decision: cred, profile: { transferable_skills: true }, transferable: true })
  assert.equal(v.band, 'dont'); assert.ok(v.clamped)
  const fld = { screened: true, reasons: [{ kind: 'field', detail: 'accounting', quote: 'Accountant' }] }
  assert.equal(clampVerdict({ score: 4.2, judgments: {}, decision: fld }).band, 'dont')
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
  // Keys are state-qualified (metro|state) so same-named cities in different states don't collapse.
  assert.equal(canonicalLocation('Cincinnati, OH'), 'cincinnati|OH')
  assert.equal(canonicalLocation("Cincinnati Children's Hospital, Cincinnati, OH"), 'cincinnati|OH') // campus collapses
  assert.equal(canonicalLocation('Cleveland, OH'), 'cleveland|OH') // same state, different metro → distinct
  assert.equal(canonicalLocation('Remote - US'), 'remote')
  assert.notEqual(canonicalLocation('Chicago, IL'), canonicalLocation('Detroit, MI'))
  assert.notEqual(canonicalLocation('Columbus, OH'), canonicalLocation('Columbus, GA')) // same name, different state → distinct
})

test('regions: regionPriority ranks in-region first and deprioritizes out-of-timezone remote roles', () => {
  assert.equal(regionPriority('Denver, CO', ['west']), 2) // physically in West
  assert.equal(regionPriority('Phoenix, AZ', ['west']), 1) // Mountain tz overlaps West (not in-region)
  assert.equal(regionPriority('Columbus, Ohio or Remote', ['west']), 0) // Eastern remote → deprioritized for West
  assert.equal(regionPriority('Remote - US', ['west']), 1) // region-agnostic remote → neutral
  assert.equal(regionPriority('Columbus, OH', ['midwest']), 2) // in-region
  assert.equal(regionPriority('Anywhere', ['nationwide']), 2) // no region preference → neutral-high
})

test('regions: regionForLocation maps a résumé location to its region (to seed the search)', () => {
  assert.equal(regionForLocation('Cincinnati, OH'), 'midwest')
  assert.equal(regionForLocation('Denver, CO'), 'west')
  assert.equal(regionForLocation('Austin, TX'), 'southwest')
  assert.equal(regionForLocation('Remote'), '') // no resolvable US state → caller keeps the current region
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
  assert.ok(survivor.aliases.split(/\s+/).includes('k2'))
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
  assert.equal(up.jsonEval, true) // local backends serve guaranteed-JSON evals
  const prevKey = process.env.JOBDAR_API_KEY
  process.env.JOBDAR_API_KEY = 'sk-test'
  try {
    const api = await selectActive({ inference: 'api' })
    assert.equal(api.kind, 'api')
    assert.equal(api.up, true)
    assert.equal(api.jsonEval, false) // Anthropic api is Messages-only (no /v1/chat/completions)
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
  // low-end tuning: a responseFormat (guaranteed-JSON) call routes to /v1/chat/completions even on a
  // Messages backend (the winc JSON-eval path) — mo answers ONLY chat/completions, so a misroute 404→throws.
  const viaJson = await callBackend({ kind: 'local', protocol: 'messages', baseUrl: mo.url, model: 'm' }, { user: 'u', responseFormat: { type: 'json_schema', json_schema: { name: 'x', schema: {} } } })
  assert.ok(viaJson.text.includes('Fit score'))
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
  // 5-level granularity (1.41.x): good=.75, weak=.25 fill the middle so realistic fits reach the Research band
  assert.equal(scoreFromJudgments(ALL('good')), 3.8) // 0.75 * 5 = 3.75 → 3.8
  // skills good + exp weak + level strong + log strong + edu good = 0.70 → 3.5 (a genuine early-career fit lands in Research)
  assert.equal(scoreFromJudgments({ skills: { rating: 'good' }, experience: { rating: 'weak' }, level_fit: { rating: 'strong' }, logistics: { rating: 'strong' }, education: { rating: 'good' } }), 3.5)
})

test('8a: parseEvalJson extracts the verdict object; stripPII scrubs the CV slice', () => {
  assert.deepEqual(parseEvalJson('reasoning… {"required":{"candidate_meets_all":true}} trailing'), { required: { candidate_meets_all: true } })
  assert.equal(parseEvalJson('no json here'), null)
  assert.equal(stripPII('Jane Roe — jane@x.com — 555-123-4567 — https://li.com/in/jane', { name: 'Jane Roe' }), '[name] — [email] — [phone] — [url]')
  assert.equal(stripPII('Acme 2019-2023; B.S. 2015-2019'), 'Acme 2019-2023; B.S. 2015-2019') // date ranges must survive (not eaten as phones)
  assert.deepEqual(parseEvalJson('{"a":1} then a stray } brace'), { a: 1 }) // balanced-brace fallback past trailing prose
})

test('8a/1.41.x: clampVerdict clamps HARD requirements/gates; a years shortfall shapes but does NOT gate; no_degree exempts the degree', () => {
  const meets = clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: false }, profile: {} })
  assert.deepEqual([meets.clamped, meets.band], [false, 'apply'])
  // a model requirements-fail with a HARD credential note clamps to Don't
  const unmet = clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: false, note: 'needs an active PE license' } }, gates: {}, decision: { screened: false }, profile: {} })
  assert.equal(unmet.clamped, true); assert.equal(unmet.band, 'dont'); assert.ok(unmet.score <= 3.4)
  // a years-only requirements-fail no longer clamps (calibration 1.41.x — the experience sub-score reflects it)
  assert.equal(clampVerdict({ score: 4.2, judgments: { required: { candidate_meets_all: false, note: '5+ years of experience' } }, gates: {}, decision: { screened: false }, profile: {} }).clamped, false)
  // a prescreen YEARS gate no longer hard-clamps either — but a hard prescreen gate (credential) still does
  assert.equal(clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'years', quote: '8+ years' }] }, profile: {} }).clamped, false)
  assert.equal(clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'credential', detail: 'CPA', quote: 'active CPA required' }] }, profile: {} }).band, 'dont')
  // no_degree: a degree screen must NOT clamp (4.5 honesty — flag, never auto-zero)
  const degNoDegree = clampVerdict({ score: 4.2, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'degree', quote: "Bachelor's required" }] }, profile: { tuning_profile: 'no_degree' } })
  assert.equal(degNoDegree.clamped, false)
  assert.doesNotThrow(() => clampVerdict({ score: 4, judgments: {}, gates: {}, decision: { screened: true }, profile: {} })) // reasons missing → no crash
  assert.equal(clampVerdict({ score: 4.5, judgments: { required: { candidate_meets_all: 'no' } }, gates: {}, decision: { screened: false }, profile: {} }).band, 'dont') // stringy negative, no note → clamps (unknown reason)
})

test('1.41.x: a years shortfall never hard-clamps (transferable or not); hard credentials + hard prescreen gates still do', () => {
  const J = (note) => ({ required: { candidate_meets_all: false, note } })
  // a "2+ years in [field]" shortfall does NOT clamp — transferable OFF or ON → 3.6 stays Research
  assert.equal(clampVerdict({ score: 3.6, judgments: J('2+ years HR generalist experience'), gates: {}, decision: { screened: false }, profile: { transferable_skills: false } }).clamped, false)
  assert.equal(clampVerdict({ score: 3.6, judgments: J('2+ years HR generalist experience'), gates: {}, decision: { screened: false }, profile: { transferable_skills: true } }).band, 'research')
  // a genuine hard credential still clamps even when the note mentions a year count
  const lic = clampVerdict({ score: 3.9, judgments: J('3+ years and an active RN license'), gates: {}, decision: { screened: false }, profile: {} })
  assert.equal(lic.clamped, true); assert.equal(lic.band, 'dont')
  // a hard prescreen gate (credential) still clamps; a prescreen years gate does not
  assert.equal(clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'credential', detail: 'RN', quote: 'active RN' }] }, profile: {} }).band, 'dont')
  assert.equal(clampVerdict({ score: 4.6, judgments: { required: { candidate_meets_all: true } }, gates: {}, decision: { screened: true, reasons: [{ kind: 'years', quote: '8+ years' }] }, profile: {} }).clamped, false)
  // buildVerdict threads it end-to-end (years shortfall → not clamped, strong sub-scores stand)
  const built = buildVerdict({ text: JSON.stringify({ required: { candidate_meets_all: false, note: '2+ years in analytics' }, skills: { rating: 'strong' }, experience: { rating: 'partial' }, level_fit: { rating: 'strong' }, logistics: { rating: 'strong' }, education: { rating: 'partial' }, recommendation: 'bridge' }), jd: 'Analytics role', gates: {}, decision: { screened: false }, profile: {} })
  assert.equal(built.ok, true); assert.equal(built.clamped, false)
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

test('8a/1.41.x: prepEval + buildVerdict — a years gate shapes (no clamp) but a hard credential gate clamps despite strong scores', () => {
  const prep = prepEval({ jd: 'Need 5+ years experience. SQL.', cv: 'SQL analyst.', profile: { target_levels: ['entry'] }, today: '2026-06-14' })
  assert.equal(prep.gates.years.years, 5)
  assert.equal(prep.decision.screened, true) // 5 > entry ceiling (2)
  assert.ok(prep.user.includes('5'))
  // A years gate no longer hard-clamps (calibration 1.41.x) — the strong sub-scores stand.
  const v = buildVerdict({ text: JSON.stringify({ required: { candidate_meets_all: true }, ...ALL('strong'), recommendation: 'r' }), jd: 'SQL. Salary $90,000-$110,000.', gates: prep.gates, decision: prep.decision, profile: { target_salary: 80000 } })
  assert.equal(v.clamped, false); assert.equal(v.band, 'apply')
  assert.ok(v.pay.includes('above')) // pay still merged
  // But a HARD credential gate (from prescreen) still clamps despite strong scores.
  const prepCred = prepEval({ jd: 'Active CPA license required. Month-end close.', cv: 'Analyst, SQL, no license.', title: 'Staff Accountant', profile: { target_levels: ['entry', 'mid'] }, today: '2026-06-14' })
  const vCred = buildVerdict({ text: JSON.stringify({ required: { candidate_meets_all: true }, ...ALL('strong'), recommendation: 'r' }), jd: 'CPA role.', gates: prepCred.gates, decision: prepCred.decision, profile: {} })
  assert.equal(vCred.clamped, true); assert.equal(vCred.band, 'dont')
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

test('1.26.0: structureCv adds markdown markers (name #, sections ##, bullets -) without changing words', () => {
  const raw = 'Jen Doe\nColumbus, OH\n\nEDUCATION\nB.S. Business Administration\n\nEXPERIENCE\n• Built dashboards\nSKILLS\nExcel, SQL'
  const s = structureCv(raw)
  assert.ok(s.startsWith('# Jen Doe')) // name → H1
  assert.ok(s.includes('## EDUCATION') && s.includes('## EXPERIENCE') && s.includes('## SKILLS')) // sections → H2
  assert.ok(s.includes('- Built dashboards')) // bullet → markdown
  assert.ok(s.includes('B.S. Business Administration')) // body words unchanged
  assert.ok(!structureCv('Plain line\nanother line').includes('## ')) // no false section headings
})

test('1.26.0: tailor — completeness guard + grounded assembly (pure pieces)', () => {
  // coverIsComplete: a real letter with a sign-off passes; a short truncated one fails (the 4B case)
  const full = Array(140).fill('word').join(' ') + '\n\nSincerely,\nJen Doe' // ≥130 words + sign-off
  assert.equal(coverIsComplete(full), true)
  assert.equal(coverIsComplete('I am excited about this role and my dashboard experience fits well.'), false) // short, no sign-off
  // assembleTailoredCv inserts a Summary section AFTER the name, BEFORE the first section heading
  const cv = '# Jen Doe\nColumbus, OH\n\n## Education\nB.S.\n\n## Experience\nIntern'
  const out = assembleTailoredCv(cv, 'Marketing grad with dashboard + A/B testing experience.')
  assert.ok(out.indexOf('## Summary') < out.indexOf('## Education')) // summary leads the body
  assert.ok(out.indexOf('# Jen Doe') < out.indexOf('## Summary')) // name still first
  assert.equal(assembleTailoredCv(cv, ''), cv) // empty summary → unchanged
  // schema + prompt shape
  assert.deepEqual(TAILOR_JSON_SCHEMA.schema.required, ['summary', 'cover_letter', 'keywords'])
  assert.ok(buildTailorUser({ jd: 'JD', cv: 'CV', role: 'X', company: 'Y' }).includes('X @ Y'))
  assert.equal(typeof engineTailor, 'function') // engine verb exported
})

test('1.28.1: fillSignature restores the candidate name into a "[name]" sign-off (stripPII sentinel)', async () => {
  // pure: the bug case + the common variants small models emit; no-op without a name or a placeholder
  assert.equal(fillSignature('Sincerely,\n[name]', 'Jane Doe'), 'Sincerely,\nJane Doe')
  assert.equal(fillSignature('Best,\n[Your Name]', 'Jane Doe'), 'Best,\nJane Doe')
  assert.equal(fillSignature('Regards,\n[Full Name]', 'Jane Doe'), 'Regards,\nJane Doe')
  assert.equal(fillSignature("Sincerely,\n[Candidate's Name]", 'Jane Doe'), 'Sincerely,\nJane Doe')
  assert.equal(fillSignature('Sincerely,\n[name]', ''), 'Sincerely,\n[name]') // no name → cannot fill (left as-is)
  assert.equal(fillSignature('Sincerely,\nJane Doe', 'Jane Doe'), 'Sincerely,\nJane Doe') // already signed → unchanged
  // integration: a tailored cover letter that signs with the stripPII sentinel gets the real name filled
  const cover = Array(140).fill('word').join(' ') + '\n\nSincerely,\n[name]' // ≥130 words + a "[name]" sign-off
  const m = await mockOpenAI({ content: JSON.stringify({ summary: 'Targeted summary.', cover_letter: cover, keywords: ['sql'] }) })
  const active = { kind: 'local', protocol: 'openai', runtime: 'ollama', baseUrl: m.url, model: 'm', jsonEval: true }
  const r = await engineTailor({ active, jd: 'Data Analyst — SQL', cv: '# Jane Doe\nColumbus, OH\n\n## Experience\nIntern', profile: { name: 'Jane Doe' }, role: 'Data Analyst', company: 'Acme' })
  assert.equal(r.ok, true)
  assert.ok(r.coverLetter.includes('Sincerely,\nJane Doe')) // name filled into the sign-off
  assert.ok(!/\[name\]/i.test(r.coverLetter)) // no placeholder survives
  await m.close()
})

test('8f: customize — directives layer, hash is deterministic, variants bump per artifact (pure)', () => {
  // effectiveDirectives: layering + reset + skip-exact-repeat-of-last + plain re-run reuses
  assert.deepEqual(effectiveDirectives(null, { directive: 'warmer' }), ['warmer'])
  assert.deepEqual(effectiveDirectives({ directives: ['warmer'] }, { directive: 'shorter' }), ['warmer', 'shorter'])
  assert.deepEqual(effectiveDirectives({ directives: ['warmer'] }, { directive: 'warmer' }), ['warmer']) // no dup of the last
  assert.deepEqual(effectiveDirectives({ directives: ['warmer'] }, { directive: 'shorter', reset: true }), ['shorter']) // reset clears first
  assert.deepEqual(effectiveDirectives({ directives: ['warmer'] }, {}), ['warmer']) // plain re-run reuses stored
  // contentHash: same inputs → same hash (idempotent re-run); any input change → different hash (new variant)
  const h1 = contentHash('CV', 'JD', ['warmer'])
  assert.equal(h1, contentHash('CV', 'JD', ['warmer']))
  assert.notEqual(h1, contentHash('CV', 'JD', ['warmer', 'shorter'])) // directive changed
  assert.notEqual(h1, contentHash('CV2', 'JD', ['warmer'])) // résumé changed
  // recordVariant: bumps from prev, preserves role + sibling artifacts
  const r1 = recordVariant({}, { key: 'k', role: 'R', company: 'C', artifact: 'tailor', directives: ['warmer'], hash: h1, dateStr: '2026-06-15' })
  assert.equal(r1.variant, 1)
  const r2 = recordVariant(r1.store, { key: 'k', artifact: 'tailor', directives: ['warmer', 'shorter'], hash: 'h2', dateStr: '2026-06-15' })
  assert.equal(r2.variant, 2)
  assert.equal(r2.store.k.role, 'R') // role survives the bump
  const r3 = recordVariant(r2.store, { key: 'k', artifact: 'outreach', directives: [], hash: 'h3', dateStr: '2026-06-15' })
  assert.equal(r3.variant, 1) // outreach has its own counter
  assert.equal(r3.store.k.artifacts.tailor.variant, 2) // tailor untouched
})

test('8f: customize — user directives steer output but stay subordinate to grounding (prompt order)', () => {
  assert.equal(directiveBlock([]), '') // no directives → no block (backward compatible)
  const b = directiveBlock(['warmer tone', 'one paragraph shorter'])
  assert.ok(b.includes('MUST NOT add or change')) // the grounding-guard clause is present
  assert.ok(b.includes('1. warmer tone') && b.includes('2. one paragraph shorter')) // applied in order
  const system = TAILOR_SYSTEM + b
  assert.ok(system.indexOf('NEVER invent') < system.indexOf('USER DIRECTIVES')) // base grounding precedes directives
})

test('8f: customize — the low-temp path forwards temperature into the request body (both protocols)', async () => {
  let captured = null
  const srv = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let buf = ''
      req.on('data', (c) => (buf += c))
      req.on('end', () => {
        captured = JSON.parse(buf || '{}')
        const json = req.url === '/v1/chat/completions'
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(json ? { model: 'm', choices: [{ message: { content: '{}' } }], usage: {} } : { content: [{ type: 'text', text: '{}' }], usage: {} }))
      })
    })
    s.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${s.address().port}`, close: () => new Promise((r) => s.close(r)) }))
  })
  await callBackend({ kind: 'local', protocol: 'openai', runtime: 'ollama', baseUrl: srv.url, model: 'm' }, { user: 'u', temperature: 0 })
  assert.equal(captured.temperature, 0) // OpenAI-compat path (ollama/llamafile)
  await callBackend({ kind: 'local', protocol: 'messages', baseUrl: srv.url }, { user: 'u', temperature: 0 })
  assert.equal(captured.temperature, 0) // Messages path (winc/api)
  await callBackend({ kind: 'local', protocol: 'openai', runtime: 'ollama', baseUrl: srv.url, model: 'm' }, { user: 'u' })
  assert.equal('temperature' in captured, false) // omitted by default — normal eval/agent calls are untouched
  await srv.close()
})

test('8f.2: draftOutreach — grounded prompt, JSON message, lint gate (mock backend)', async () => {
  // prompt assembly: recipient + role + company present; base grounding precedes any user directives
  const u = buildOutreachUser({ jd: 'JD', cv: 'CV', role: 'Data Analyst', company: 'Acme', person: 'Alex Kim', channel: 'linkedin' })
  assert.ok(u.includes('Alex Kim') && u.includes('Data Analyst') && u.includes('Acme'))
  const sys = OUTREACH_SYSTEM + directiveBlock(['casual'])
  assert.ok(sys.indexOf('NEVER invent') < sys.indexOf('USER DIRECTIVES'))
  // a good JSON message → ok + lint passes
  const good = await mockOpenAI({ content: JSON.stringify({ message: 'Hi Alex, I admire Acme data work. As an analyst with SQL and dashboards, I would value a brief chat — could you point me to the right person?' }) })
  const active = { kind: 'local', protocol: 'openai', runtime: 'ollama', baseUrl: good.url, model: 'm', jsonEval: true }
  const r = await draftOutreach({ active, jd: 'Data Analyst — SQL', cv: 'Analyst with SQL + dashboards.', role: 'Data Analyst', company: 'Acme', person: 'Alex Kim' })
  assert.equal(r.ok, true); assert.ok(r.message.includes('Alex')); assert.equal(r.lint.ok, true)
  await good.close()
  // a too-long message → still ok:true, but the lint gate SURFACES too_long (the note is never silently "good")
  const bad = await mockOpenAI({ content: JSON.stringify({ message: 'Hi Alex, ' + 'x'.repeat(400) }) })
  const r2 = await draftOutreach({ active: { ...active, baseUrl: bad.url }, jd: 'JD', cv: 'CV', role: 'R', company: 'C', person: 'Alex Kim' })
  assert.equal(r2.ok, true); assert.equal(r2.lint.ok, false)
  assert.ok(r2.lint.problems.some((p) => p.kind === 'too_long'))
  await bad.close()
})

test('8f.2: contentHash extra — outreach recipient/channel change the hash; tailor hashes unchanged', () => {
  const h = contentHash('CV', 'JD', ['warm'])
  assert.equal(h, contentHash('CV', 'JD', ['warm'], '')) // empty extra ≡ no extra → tailor hashes stay stable across the upgrade
  assert.notEqual(contentHash('CV', 'JD', ['warm'], 'linkedin|Alex'), contentHash('CV', 'JD', ['warm'], 'linkedin|Sam')) // recipient matters
  assert.notEqual(contentHash('CV', 'JD', ['warm'], 'linkedin|Alex'), contentHash('CV', 'JD', ['warm'], 'email|Alex')) // channel matters
})

test('8c/pre-confirm: parsePreConfirm reads the triage verdict; unknown → maybe (never drops a role)', () => {
  assert.equal(parsePreConfirm('{"verdict":"skip","reason":"wrong field"}').verdict, 'skip')
  assert.equal(parsePreConfirm('reasoning… {"verdict":"fit"}').verdict, 'fit')
  assert.equal(parsePreConfirm('garbage, no json').verdict, 'maybe')
  assert.equal(parsePreConfirm('{"verdict":"weird"}').verdict, 'maybe')
  assert.equal(parsePreConfirm('{"verdict":"skip","reason":"x"}').reason, 'x')
})

test('8a.9: isBorderline flags near-band verdicts for escalation, never clamped/clear ones', () => {
  assert.equal(isBorderline({ ok: true, score: 3.6 }), true) // near Research (3.5)
  assert.equal(isBorderline({ ok: true, score: 3.9 }), true) // near Apply (4.0)
  assert.equal(isBorderline({ ok: true, score: 4.8 }), false) // clearly Apply
  assert.equal(isBorderline({ ok: true, score: 1.5 }), false) // clearly Don't
  assert.equal(isBorderline({ ok: true, score: 3.5, clamped: true }), false) // clamps are deterministic — don't escalate
  assert.equal(isBorderline({ ok: false }), false)
})

test('8e: engine contract drives import → evaluate → record → track with NO CLI; shapes hold', async () => {
  assert.ok(ENGINE_VERSION)
  // import (heuristic, no backend) over a real text file
  const imp = await importDocument(path.join(ROOT, 'CLAUDE.md'), { active: null })
  assert.equal(imp.ok, true)
  assert.ok(imp.cv.length > 50 && imp.fields && Array.isArray(imp.fields.skills))
  assert.equal(imp.structuredBy, 'heuristic')
  // evaluate via the engine over a mock backend (the §3 pipeline)
  const m = await mockBackend({ reply: JSON.stringify({ required: { candidate_meets_all: true }, ...ALL('strong'), recommendation: 'fit' }) })
  const v = await engineEvaluate({ active: { kind: 'local', protocol: 'messages', baseUrl: m.url }, jd: 'Analyst. SQL. Salary $90,000-$110,000.', cv: 'SQL analyst', profile: { target_salary: 80000 }, today: '2026-06-14' })
  assert.equal(v.ok, true)
  assert.equal(v.band, 'apply')
  assert.ok('pay' in v)
  // pre-confirm gate routes through the engine too
  const mSkip = await mockBackend({ reply: '{"verdict":"skip","reason":"x"}' })
  const sk = await engineEvaluate({ active: { kind: 'local', protocol: 'messages', baseUrl: mSkip.url }, jd: 'x', cv: 'y', profile: {}, confirm: true })
  assert.equal(sk.skipped, true)
  await m.close(); await mSkip.close()
  // record + track (pure rows in/out)
  let rows = recordVerdict([], { url: 'u1', score: v.score, band: v.band, company: 'C', role: 'R' }, '2026-06-14')
  assert.equal(rows.find((r) => r.url === 'u1').band, 'apply')
  rows = advanceStatus(rows, 'u1', 'applied', '2026-06-15')
  assert.equal(rows.find((r) => r.url === 'u1').status, 'applied')
  // build
  assert.ok(buildCv('# Jane Doe\n## Skills\n- SQL').includes('<h1>Jane Doe</h1>'))
})

test('8d: resolvePay — three layers (stated → comparable → BLS), source label mandatory, never blank', () => {
  const wages = loadWages()
  const socMap = loadSocMap()
  const stated = resolvePay('The salary range is $90,000 - $110,000 per year.', { target: 80000 })
  assert.equal(stated.source, 'stated'); assert.equal(stated.band, 'above'); assert.ok(stated.label.startsWith('stated'))
  const comp = resolvePay('No pay listed here.', { target: 80000, comps: [{ annualMin: 80000, annualMax: 100000 }, { annualMin: 90000, annualMax: 110000 }, { annualMin: 85000, annualMax: 105000 }] })
  assert.equal(comp.source, 'comparable'); assert.ok(comp.label.includes('3 comparable'))
  const soc = socForTitle('Project Coordinator', socMap)
  assert.equal(soc, '13-1082')
  const bls = resolvePay('No pay.', { target: 80000, seniority: 'mid', wages, soc, occ: wages[soc].occ })
  assert.equal(bls.source, 'bls'); assert.ok(bls.label.includes('median') && bls.annualMin > 0)
  assert.equal(resolvePay('No pay.', { target: 80000 }).label, 'pay not stated') // never blank
})

test('8d: socForTitle routes titles to SOC — specific occupations before the generic catch-all', () => {
  const m = loadSocMap()
  assert.equal(socForTitle('Business Systems Analyst', m), '15-1211')
  assert.equal(socForTitle('Senior Software Engineer', m), '15-1252')
  assert.equal(socForTitle('Recruiting Coordinator', m), '13-1071') // HR wins over the coordinator catch-all
  assert.equal(socForTitle('Marketing Coordinator', m), '43-9061')
  assert.equal(socForTitle('Astronaut', m), null)
})

test('transferable-skills toggle: off by default, steers both AI prompts when on, stays strict', () => {
  assert.equal(PROFILE_DEFAULTS.transferable_skills, false)
  assert.ok(!evalSystemFor(false).includes('TRANSFERABLE-SKILLS MODE'))
  assert.ok(evalSystemFor(true).includes('TRANSFERABLE-SKILLS MODE'))
  assert.ok(evalSystemFor(true).includes('Do NOT inflate')) // crediting transfer ≠ lowering the bar
  assert.ok(evalSystemFor(true).includes('quality over quantity'))
  assert.ok(!preConfirmSystemFor(false).includes('TRANSFERABLE-SKILLS'))
  assert.ok(preConfirmSystemFor(true).includes('stay strict')) // pre-confirm still skips aspirational stretches
})

test('serve: HTTP façade — auth gate, pipeline/profile/cv reads, tracker write, 404 (subprocess, env-isolated, no external net)', async () => {
  const { spawn } = await import('node:child_process')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-serve-'))
  const dataDir = path.join(home, 'data')
  const cfgDir = path.join(home, 'config')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(cfgDir, { recursive: true })
  writeFileSync(path.join(cfgDir, 'profile.yml'), 'name: Test User\ntarget_levels:\n  - entry\n  - mid\ntarget_regions:\n  - midwest\ninference: local\ninference_url: http://127.0.0.1:8080\n')
  const row = { company: 'Acme', role: 'Junior Analyst', url: 'https://acme.test/j/1', location: 'Chicago, IL', score: '', band: '', recommendation: '', status: 'scanned', posted: '2026-06-10', first_seen: '2026-06-12', updated: '2026-06-12', prescreen: '', screen_reason: '', pay: '', aliases: '' }
  writeFileSync(path.join(dataDir, 'pipeline.tsv'), serializePipeline([row]))
  writeFileSync(path.join(dataDir, 'cv.md'), '# Test User\n\nIT support specialist. Help desk, ticketing.\n')
  const PORT = 40000 + (process.pid % 20000)
  const TOKEN = 'test-tok-123'
  const base = `http://127.0.0.1:${PORT}`
  const child = spawn(process.execPath, [path.join(PKG_ROOT, 'bin', 'jobdar'), 'serve', '--port', String(PORT), '--token', TOKEN], { env: { ...process.env, JOBDAR_HOME: home }, stdio: 'ignore' })
  try {
    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      try {
        if ((await fetch(`${base}/profile?token=${TOKEN}`)).status === 200) up = true
      } catch {
        /* not listening yet */
      }
      if (!up) await new Promise((r) => setTimeout(r, 150))
    }
    assert.ok(up, 'serve did not come up')
    assert.equal((await fetch(`${base}/pipeline`)).status, 401) // token required, none sent
    const pj = await (await fetch(`${base}/pipeline?token=${TOKEN}`)).json()
    assert.equal(pj.count, 1)
    assert.equal(pj.rows[0].url, 'https://acme.test/j/1')
    assert.equal(pj.rows[0].status, 'scanned')
    const prof = await (await fetch(`${base}/profile?token=${TOKEN}`)).json()
    assert.deepEqual(prof.target_levels, ['entry', 'mid'])
    assert.equal(prof.inference_url, undefined) // secrets/impl details never leave
    // POST /profile persists whitelisted identity fields; secrets in the body are ignored, not written
    const profPost = await (await fetch(`${base}/profile?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alex Rivera', target_regions: ['west'], target_levels: ['mid'], target_salary: 90000, needs_sponsorship: true, inference_url: 'http://evil', api_key: 'sekret' }) })).json()
    assert.equal(profPost.ok, true)
    const prof2 = await (await fetch(`${base}/profile?token=${TOKEN}`)).json()
    assert.equal(prof2.name, 'Alex Rivera')
    assert.deepEqual(prof2.target_levels, ['mid'])
    assert.equal(prof2.target_salary, 90000)
    assert.equal(prof2.needs_sponsorship, true) // the sponsorship toggle persists like the other identity fields
    assert.equal(prof2.inference_url, undefined) // the inference_url in the POST body was NOT accepted/returned
    const cvj = await (await fetch(`${base}/cv?token=${TOKEN}`)).json()
    assert.ok(cvj.loaded && cvj.content.includes('IT support'))
    const ts = await (await fetch(`${base}/tracker/set?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', status: 'applied' }) })).json()
    assert.equal(ts.ok, true)
    const after = await (await fetch(`${base}/pipeline?token=${TOKEN}`)).json()
    assert.equal(after.rows[0].status, 'applied') // real pipeline.tsv mutation persisted
    // security: /import refuses a path outside the jobdar home (arbitrary-file-read fix)
    assert.equal((await fetch(`${base}/import?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: '/etc/passwd' }) })).status, 403)
    // security: CORS is NOT reflected for a public origin, but IS for a localhost origin (reflective-CORS fix)
    assert.equal((await fetch(`${base}/pipeline?token=${TOKEN}`, { headers: { origin: 'https://evil.example.com' } })).headers.get('access-control-allow-origin'), null)
    assert.equal((await fetch(`${base}/pipeline?token=${TOKEN}`, { headers: { origin: 'http://localhost:8799' } })).headers.get('access-control-allow-origin'), 'http://localhost:8799')
    // /tracker/set rejects an unknown status (taxonomy validation → no demote-to-scanned data loss)
    assert.equal((await fetch(`${base}/tracker/set?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', status: 'not-a-real-status' }) })).status, 400)
    // POST /cv persists the GUI's résumé so scan/prescreen/eval judge against the same text
    assert.equal((await (await fetch(`${base}/cv?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '# New CV\n\nMarketing coordinator, campaigns and analytics.' }) })).json()).ok, true)
    assert.ok((await (await fetch(`${base}/cv?token=${TOKEN}`)).json()).content.includes('Marketing coordinator'))
    // /search/parse works without a backend (deterministic keyword fallback) — search must never 503
    const sp = await (await fetch(`${base}/search/parse?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: 'junior data analyst, midwest' }) })).json()
    assert.equal(sp.ok, true)
    assert.ok(Array.isArray(sp.keywords) && sp.keywords.includes('analyst'))
    // /import/upload parses uploaded bytes, sanitizes the name (no path traversal), and persists the text
    const upRes = await (await fetch(`${base}/import/upload?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '../../evil name.txt', base64: Buffer.from('# Uploaded Person\n\nMarketing analyst with SQL and dashboards.').toString('base64') }) })).json()
    assert.equal(upRes.ok, true)
    assert.ok(upRes.name && !upRes.name.includes('/') && !upRes.name.includes('..')) // file name sanitized
    assert.ok(upRes.text.includes('Marketing analyst'))
    assert.ok(upRes.fields && typeof upRes.fields === 'object') // identity fields returned so the app can seed the profile
    assert.ok((await (await fetch(`${base}/cv?token=${TOKEN}`)).json()).content.includes('Marketing analyst')) // persisted as the active résumé
    // POST /eval/feedback records a thumbs verdict-rating; GET reports the agreement the calibrator reads
    assert.equal((await fetch(`${base}/eval/feedback?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', thumb: 'bogus' }) })).status, 400) // thumb must be up|down
    assert.equal((await (await fetch(`${base}/eval/feedback?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', thumb: 'up', band: 'apply', score: 4.4, role: 'Junior Analyst' }) })).json()).ok, true)
    await fetch(`${base}/eval/feedback?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/2', thumb: 'down', band: 'dont', score: 2.1 }) })
    const fb = await (await fetch(`${base}/eval/feedback?token=${TOKEN}`)).json()
    assert.equal(fb.n, 2); assert.equal(fb.up, 1); assert.equal(fb.down, 1); assert.equal(fb.agreement, 50)
    await fetch(`${base}/eval/feedback?token=${TOKEN}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', thumb: 'down' }) }) // change of mind → de-dup by url, not a new row
    const fb2 = await (await fetch(`${base}/eval/feedback?token=${TOKEN}`)).json()
    assert.equal(fb2.n, 2); assert.equal(fb2.down, 2) // still 2 rows, the flipped one replaced
    assert.equal((await fetch(`${base}/nope?token=${TOKEN}`)).status, 404)
  } finally {
    child.kill('SIGKILL')
    rmSync(home, { recursive: true, force: true })
  }
})

test('fix: prescreen — "controller" alone is not accounting; a soft-then-required credential still gates', () => {
  assert.equal(extractField('Quality Controller'), null) // not a hard-identity accounting role
  assert.equal(extractField('Air Traffic Controller'), null)
  assert.equal(extractField('Financial Controller').field, 'accounting') // genuine accounting still gated
  assert.equal(extractField('Comptroller').field, 'accounting')
  // first-mention "preferred" must NOT mask a later "required" credential ask
  assert.equal(extractCredential('CPA preferred but not necessary. An active CPA license is required for this role.').gate, 'required')
  assert.equal(extractCredential('CPA is a plus.').gate, 'none') // soft-only never gates
})

test('fix: regions — Washington DC is Northeast not West; ambiguous OR/IN aren\'t misread as states', () => {
  assert.equal(locationMatches('Washington, DC', ['northeast']), true)
  assert.equal(locationMatches('Washington, DC', ['west']), false) // not Washington state
  assert.equal(locationMatches('ONSITE OR HYBRID, Dallas', ['southwest']), true) // OR≠Oregon; Dallas→TX
  assert.equal(locationMatches('IN-PERSON role, Phoenix', ['southwest']), true) // IN≠Indiana; Phoenix→AZ
  assert.equal(locationMatches('IN-PERSON role, Phoenix', ['midwest']), false) // proves IN wasn't read as Indiana
})

test('fix: outreach — businessDaysBetween is DST-immune (UTC); lintDraft catches [email] sentinel', () => {
  assert.equal(businessDaysBetween('2026-03-05', '2026-03-11'), 4) // spring-forward week: Fri,Mon,Tue,Wed = 4 (was 5)
  assert.equal(businessDaysBetween('2026-06-01', '2026-06-08'), 5) // a normal Mon→Mon week
  assert.equal(lintDraft('Hi Ana, reach me at [email] to chat.', { person: 'Ana' }).ok, false)
})

test('fix: http — assertAllowedUrl refuses private/loopback/metadata hosts even if the allowlist matches', () => {
  assert.throws(() => assertAllowedUrl('https://169.254.169.254/latest/meta-data/', { hostAllowlist: [/^169\.254\.169\.254$/] }))
  assert.throws(() => assertAllowedUrl('https://127.0.0.1/x', { hostAllowlist: [/^127\.0\.0\.1$/] }))
  assert.throws(() => assertAllowedUrl('https://10.0.0.5/x', { hostAllowlist: [/.*/] }))
  assert.ok(assertAllowedUrl('https://boards.greenhouse.io/acme', { hostAllowlist: [/greenhouse\.io$/] })) // public host still allowed
})

test('fix: pipeline — comma-containing alias URLs resolve; recordEval guards a non-numeric score', () => {
  const rows = mergeScanned([], [
    { company: 'Acme', title: 'Analyst', url: 'https://x.test/clean', location: 'Chicago, IL' },
    { company: 'Acme', title: 'Analyst', url: 'https://x.test/j?loc=us,ca,tx', location: 'Chicago, IL' }, // alias w/ commas
  ], '2026-06-16')
  const survivor = rows.find((r) => r.url === 'https://x.test/clean')
  assert.equal(survivor.aliases, 'https://x.test/j?loc=us,ca,tx') // stored intact (space delimiter, not split on comma)
  assert.equal(resolveAlias(rows, 'https://x.test/j?loc=us,ca,tx'), 'https://x.test/clean') // resolves despite commas
  const base = [{ url: 'u1', company: 'A', role: 'R', location: '', status: 'scanned', score: '', band: '', recommendation: '', first_seen: '2026-06-16' }]
  const bad = recordEval(base, { url: 'u1', score: undefined }, '2026-06-16').find((r) => r.url === 'u1')
  assert.equal(bad.score, '') // never the literal "NaN"
  assert.notEqual(bad.status, 'evaluated') // an invalid score leaves the row un-evaluated
  const good = recordEval(base, { url: 'u1', score: 4.2 }, '2026-06-16').find((r) => r.url === 'u1')
  assert.equal(good.score, 4.2)
  assert.equal(good.status, 'evaluated')
})

test('search: expandQueryTerms drops stopwords; relevanceScore ranks + cuts by intent', () => {
  const terms = expandQueryTerms('entry-level product manager roles, remote')
  assert.ok(terms.keywords.includes('product') && terms.keywords.includes('manager'))
  assert.ok(!terms.keywords.includes('entry') && !terms.keywords.includes('remote') && !terms.keywords.includes('roles')) // stopwords gone
  const t2 = { keywords: ['product', 'manager'], titles: ['product manager'], exclude: ['electrical'] }
  assert.ok(relevanceScore('Product Manager', t2) > relevanceScore('Product Marketing Specialist', t2)) // title phrase + both keywords wins
  assert.ok(relevanceScore('Product Marketing Specialist', t2) > 0) // partial keyword match is still relevant
  assert.equal(relevanceScore('Software Engineer', t2), 0) // no overlap → cut from the intent view
  assert.ok(relevanceScore('Electrical Hardware Engineer', t2) < 0) // an exclude hit → hard cut
})

test('discover: slugVariants + atsCandidates build the right ATS probe URLs', () => {
  assert.deepEqual(slugVariants('May Mobility'), ['maymobility', 'may-mobility'])
  assert.ok(slugVariants('AT&T').includes('at-and-t')) // & → and
  const cands = atsCandidates('Stripe')
  assert.ok(cands.some((c) => c.careers_url === 'https://boards.greenhouse.io/stripe'))
  assert.ok(cands.some((c) => c.careers_url === 'https://jobs.lever.co/stripe'))
  assert.ok(cands.some((c) => c.careers_url === 'https://jobs.ashbyhq.com/stripe'))
})

test('discover: discoverCompanies is a no-op when winc is down or the intent is empty (never throws)', async () => {
  assert.deepEqual(await discoverCompanies({ active: { up: false }, intent: 'product manager' }), { suggested: 0, portals: [], jobs: [] })
  assert.deepEqual(await discoverCompanies({ active: { up: true, jsonEval: false }, intent: '' }), { suggested: 0, portals: [], jobs: [] })
})

test('search: parseIntent falls back to keywords when the backend is down (never throws)', async () => {
  const r = await parseIntent({ active: { up: false }, intent: 'data analyst jobs' })
  assert.equal(r.source, 'keywords')
  assert.ok(r.keywords.includes('data') && r.keywords.includes('analyst'))
  assert.deepEqual((await parseIntent({ active: { up: false }, intent: '' })).keywords, []) // empty intent → empty terms
})

test('usajobs: registered, opt-in detect, and pure parse/map/assemble over a captured-shape fixture', () => {
  // Registered in the provider registry
  assert.ok(providerIds().includes('usajobs'))
  // detect() is opt-in: only usajobs hosts, and it reads the saved-search query into params
  assert.equal(usajobs.detect({ company: 'Acme', careers_url: 'https://boards.greenhouse.io/acme' }), null)
  const m = usajobs.detect({ company: 'USAJobs', careers_url: 'https://data.usajobs.gov/api/search?Keyword=data+analyst&LocationName=Ohio&evil=1' })
  assert.deepEqual(m.params, { Keyword: 'data analyst', LocationName: 'Ohio' }) // 'evil' dropped (param allowlist)
  // parseUsaJobsJobUrl pulls the control number; buildSearchUrl forces public + capped ResultsPerPage
  assert.deepEqual(parseUsaJobsJobUrl('https://www.usajobs.gov/job/838012000'), { id: '838012000' })
  assert.equal(parseUsaJobsJobUrl('https://example.com/job/1'), null)
  const su = new URL(buildSearchUrl({ Keyword: 'nurse', ResultsPerPage: 9999, bogus: 'x' }))
  assert.equal(su.searchParams.get('HiringPath'), 'public')
  assert.equal(su.searchParams.get('ResultsPerPage'), '25') // capped at MAX_RESULTS
  assert.equal(su.searchParams.get('bogus'), null) // not forwarded
  // mapSearchItems + assembleJd over a minimal captured-shape response
  const fixture = {
    SearchResult: { SearchResultItems: [
      { MatchedObjectId: '838012000', MatchedObjectDescriptor: {
        PositionTitle: 'Data Analyst', PositionURI: 'https://www.usajobs.gov:443/job/838012000',
        OrganizationName: 'Dept of Data', PositionLocationDisplay: 'Columbus, Ohio',
        PublicationStartDate: '2026-06-01', QualificationSummary: 'Bachelor + SQL.',
        UserArea: { Details: { JobSummary: 'Analyze datasets.', MajorDutiesList: ['Build reports', 'Clean data'], Requirements: 'US citizenship.' } },
      } },
      { MatchedObjectDescriptor: null }, // malformed item is skipped, not thrown
    ] },
  }
  const jobs = mapSearchItems(fixture, 'USAJobs')
  assert.equal(jobs.length, 1)
  assert.equal(jobs[0].title, 'Data Analyst')
  assert.equal(jobs[0].url, 'https://www.usajobs.gov/job/838012000') // :443 stripped
  assert.equal(jobs[0].company, 'Dept of Data')
  assert.equal(jobs[0].location, 'Columbus, Ohio')
  const jd = assembleJd(fixture.SearchResult.SearchResultItems[0].MatchedObjectDescriptor)
  assert.ok(jd.description.includes('Analyze datasets') && jd.description.includes('Build reports') && jd.description.includes('US citizenship'))
  assert.equal(parseUsaJobsSearchUrl('not a url'), null) // never throws on junk
})

test('sponsorship: three stances — explicit no, explicit sponsors, silent unknown; negative wins', () => {
  // The single most common negative phrasing: "authorized to work … without sponsorship"
  assert.equal(extractSponsorship('Must be authorized to work in the US without the need for visa sponsorship now or in the future.').stance, 'no')
  assert.equal(extractSponsorship('We are unable to sponsor visas at this time.').stance, 'no')
  assert.equal(extractSponsorship('This position does not offer sponsorship.').stance, 'no')
  assert.equal(extractSponsorship('Applicants must be a U.S. citizen (federal contract).').stance, 'no')
  assert.equal(extractSponsorship('Visa sponsorship is available for this role.').stance, 'sponsors')
  assert.equal(extractSponsorship('We sponsor H-1B visas for exceptional candidates.').stance, 'sponsors')
  assert.equal(extractSponsorship('We are willing to sponsor the right candidate.').stance, 'sponsors')
  assert.equal(extractSponsorship('Great benefits: dental, vision, 401k.').stance, 'unknown') // silent = MOST JDs
  assert.equal(extractSponsorship('No visa sponsorship. We value diversity.').stance, 'no') // restriction beats marketing
  assert.equal(extractSponsorship('').stance, 'unknown')
  // back-compat: `flagged` still means "an explicit no was found"
  assert.equal(extractSponsorship('no sponsorship').flagged, true)
  assert.equal(extractSponsorship('sponsorship available').flagged, false)
})

test('sponsorship: the needs_sponsorship toggle turns an explicit "no" into a QUOTED gate; off = flag only', () => {
  const noJd = 'Senior analyst role. Candidates must be authorized to work without sponsorship now or in the future.'
  const gates = extractGates(noJd)
  const on = screenDecision(gates, { needs_sponsorship: true })
  assert.equal(on.screened, true)
  assert.equal(on.reasons[0].kind, 'sponsorship')
  assert.ok(on.reasons[0].quote.includes('without sponsorship')) // the JD line is quoted — never silent
  const off = screenDecision(gates, {})
  assert.equal(off.screened, false) // without the toggle Jobdar can't know the user's status → flag only
  assert.deepEqual(off.flags.map((f) => f.kind), ['sponsorship'])
  // An explicit OFFER is a positive indicator — never a screen, never a point-costing flag
  const yes = screenDecision(extractGates('Visa sponsorship is available. Join us!'), { needs_sponsorship: true })
  assert.equal(yes.screened, false)
  assert.equal(yes.sponsors, true)
  assert.ok(!yes.flags.some((f) => f.kind === 'sponsorship'))
  // prescreenRole surfaces both: screened w/ zero score on a "no", sponsors=true on an offer
  const v = prescreenRole({ jdText: noJd, cvText: 'analyst sql', profile: { needs_sponsorship: true } })
  assert.equal(v.screened, true)
  assert.equal(v.score, 0)
  const v2 = prescreenRole({ jdText: 'Analyst role. Visa sponsorship offered.', cvText: 'analyst sql', profile: { needs_sponsorship: true } })
  assert.equal(v2.sponsors, true)
})

test('sponsorship: recordPrescreen notes — set, explicit-clear, and preserve-on-undefined', () => {
  const rows = [{ url: 'https://a.test/1', prescreen: '', screen_reason: '', pay: '', notes: '', aliases: '' }]
  const set1 = recordPrescreen(rows, 'https://a.test/1', { score: 70, reason: '', pay: '', notes: 'sponsors-visa' }, '2026-07-02')
  assert.equal(set1[0].notes, 'sponsors-visa')
  const kept = recordPrescreen(set1, 'https://a.test/1', { score: 71, reason: '', pay: '' }, '2026-07-03') // notes undefined → keep
  assert.equal(kept[0].notes, 'sponsors-visa')
  const cleared = recordPrescreen(kept, 'https://a.test/1', { score: 72, reason: '', pay: '', notes: '' }, '2026-07-04') // '' → honest clear
  assert.equal(cleared[0].notes, '')
  // pipeline round-trip carries the new column; a legacy file without it parses to ''
  const tsv = serializePipeline(set1)
  assert.ok(tsv.split('\n')[0].endsWith('\tnotes'))
})

test('phase10: engine seed.mjs is in lockstep with data/seed/employers.yml (regen: node scripts/gen-seed.mjs)', async () => {
  const yaml = (await import('js-yaml')).default
  const yml = yaml.load(readFileSync(path.join(PKG_ROOT, 'data', 'seed', 'employers.yml'), 'utf8'))
  const { SEED_EMPLOYERS } = await import('./packages/engine/seed.mjs')
  assert.deepEqual(SEED_EMPLOYERS, yml.employers) // generated module must mirror the source catalog
})

test('phase10: pure pipeline + outreach splits — parsePipeline round-trips; fs shells re-export unchanged', async () => {
  const pure = await import('./lib/pipeline_pure.mjs')
  const rows = [{ company: 'A', role: 'R', url: 'https://a.test/1', location: 'X', score: '', band: '', recommendation: '', status: 'scanned', posted: '', first_seen: '2026-07-08', updated: '2026-07-08', prescreen: '', screen_reason: '', pay: '', aliases: '', notes: '' }]
  assert.deepEqual(pure.parsePipeline(pure.serializePipeline(rows)), rows) // pure round-trip
  // legacy text without the notes column parses with notes ''
  const legacy = 'company\trole\turl\nA\tR\thttps://a.test/1'
  assert.equal(pure.parsePipeline(legacy)[0].notes, '')
  // the fs shells re-export the same functions (identity, not forks)
  const evals = await import('./lib/evaluations.mjs')
  assert.equal(evals.mergeScanned, pure.mergeScanned)
  const opure = await import('./lib/outreach_pure.mjs')
  const outreach = await import('./lib/outreach.mjs')
  assert.equal(outreach.lintDraft, opure.lintDraft)
  assert.equal(outreach.draftOutreach, opure.draftOutreach)
  // usajobs creds seam: default dormant, settable, resilient to a throwing source
  const creds = await import('./providers/_creds.mjs')
  assert.deepEqual(creds.getUsaJobsCreds(), { key: '', email: '' })
  creds.setUsaJobsCredsSource(() => ({ key: 'k', email: 'e@x.com' }))
  assert.deepEqual(creds.getUsaJobsCreds(), { key: 'k', email: 'e@x.com' })
  creds.setUsaJobsCredsSource(() => { throw new Error('boom') })
  assert.deepEqual(creds.getUsaJobsCreds(), { key: '', email: '' })
  creds.setUsaJobsCredsSource(() => ({ key: '', email: '' })) // restore dormant for other tests
})

test('feedback: feedbackStats — agreement% from thumbs, disagreements are the down-rated roles', () => {
  const rows = [
    { url: 'a', thumb: 'up', band: 'apply', score: '4.4', role: 'PM' },
    { url: 'b', thumb: 'down', band: 'apply', score: '4.1', role: 'VP over-level' },
    { url: 'c', thumb: 'up', band: 'dont', score: '1.9', role: 'analyst' },
    { url: 'd', thumb: '', band: '', score: '', role: 'unrated' }, // no thumb → not counted
  ]
  const s = feedbackStats(rows)
  assert.equal(s.n, 3) // only the two up + one down count; the blank thumb is ignored
  assert.equal(s.up, 2)
  assert.equal(s.down, 1)
  assert.equal(s.agreement, 67) // round(2/3*100)
  assert.deepEqual(s.disagreements.map((r) => r.role), ['VP over-level']) // the eval-was-wrong list
  assert.equal(feedbackStats([]).agreement, 0) // empty → 0, no divide-by-zero
})

test('fix: salary — extractPay is bounded against a degenerate comma run (no quadratic hang)', () => {
  const t0 = Date.now()
  extractPay('Compensation: $1' + ',000'.repeat(20000) + ' and benefits.')
  assert.ok(Date.now() - t0 < 1000, 'extractPay must not backtrack super-linearly on a hostile money run')
})

test('eval --next N: parseNextCount — bare/invalid stay guidance, numbers batch, 50 is the ceiling', () => {
  assert.equal(parseNextCount(true), null) // bare --next = the AI-CLI guidance loop, unchanged
  assert.equal(parseNextCount(undefined), null)
  assert.equal(parseNextCount('abc'), null)
  assert.equal(parseNextCount('0'), null)
  assert.equal(parseNextCount('-3'), null)
  assert.deepEqual(parseNextCount('1'), { n: 1, asked: 1, capped: false })
  assert.deepEqual(parseNextCount('15'), { n: 15, asked: 15, capped: false })
  assert.deepEqual(parseNextCount('50'), { n: 50, asked: 50, capped: false })
  assert.deepEqual(parseNextCount('99'), { n: NEXT_MAX, asked: 99, capped: true })
})

test('radar bar: renderRadar is honest — real counts, sweep only mid-run, ETA, fits the width', () => {
  const mid = renderRadar({ done: 3, total: 10, frame: 1, tallyText: '2 Apply · 1 Research', label: 'Cardinal Health — Data Analyst I', width: 110, etaMs: 120000 })
  assert.ok(mid.includes('3/10') && mid.includes('30%'), 'shows the true count and percent')
  assert.ok(mid.includes(SWEEP_FRAMES[1]), 'the sweep head animates by frame')
  assert.ok(mid.includes('~2m') && mid.includes('Cardinal Health'), 'shows the measured ETA and the role in flight')
  const finished = renderRadar({ done: 10, total: 10, frame: 3, tallyText: '', label: '', width: 80 })
  assert.ok(finished.includes('10/10') && finished.includes('100%'))
  for (const f of SWEEP_FRAMES) assert.ok(!finished.includes(f), 'no sweep once complete')
  const narrow = renderRadar({ done: 1, total: 9, frame: 0, tallyText: '', label: 'x'.repeat(300), width: 60 })
  assert.ok(visibleLength(narrow) <= 60, `must fit the terminal: ${visibleLength(narrow)} > 60`)
  const crowded = renderRadar({ done: 4, total: 9, frame: 2, tallyText: "1 Apply · 1 Research · 2 Don't · ✗ 2", label: 'Very Long Company Name — A Very Long Role Title Indeed', width: 80, etaMs: 600000 })
  assert.ok(visibleLength(crowded) <= 80, `tally/ETA/label must never overflow the width: ${visibleLength(crowded)} > 80`)
  assert.equal(fmtEta(45_000), '~45s')
  assert.equal(fmtEta(240_000), '~4m')
  assert.equal(fmtEta(0), '')
})

test('radar sweep (indeterminate): the blip bounces, elapsed is true, tick(key, n) tallies honestly', () => {
  const a = renderSweep({ frame: 0, label: 'tailoring Data Analyst I', width: 90, elapsedMs: 42000 })
  assert.ok(a.includes('42s') && a.includes('tailoring') && !a.includes('%'), 'sweep shows elapsed + label, never a percent')
  // the blip bounces: frame 0 → left edge, frame 23 → right edge, frame 46 → back at the left
  const blipAt = (frame) => {
    const line = renderSweep({ frame, width: 80 })
    const track = line.slice(line.indexOf('[') + 1, line.indexOf(']'))
    return track.search(/[◐◓◑◒]/)
  }
  assert.equal(blipAt(0), 0)
  assert.equal(blipAt(23), 23)
  assert.equal(blipAt(46), 0)
  assert.ok(visibleLength(renderSweep({ frame: 5, label: 'y'.repeat(200), width: 60, elapsedMs: 1000 })) <= 60, 'sweep fits the terminal')
  assert.equal(fmtElapsed(42_000), '42s')
  assert.equal(fmtElapsed(190_000), '3m 10s')
  // controller: caller-defined tallies; tick(key, n) advances one unit and adds n to that tally
  // (scan ticks one portal with however many roles it kept — including zero).
  const writes = []
  const fake = { isTTY: true, columns: 100, write: (s) => writes.push(s) }
  const r = createRadar({ total: 3, stream: fake, tallies: [{ key: 'roles', fmt: (n) => `${n} on the radar` }, { key: 'failed', fmt: (n) => `x${n}` }] })
  r.start('Cardinal')
  r.tick('roles', 5)
  r.tick('roles', 0)
  r.tick('failed')
  const last = writes[writes.length - 1]
  assert.ok(last.includes('3/3') && last.includes('5 on the radar') && last.includes('x1'), `tallies accumulate per unit: ${last}`)
  r.stop()
})

test('eval report footer: always names the report + views; offers --next 5/10/15 only while pending', () => {
  const t = getT('en')
  const withPending = reportFooterLines(t, { file: '/tmp/home/data/pipeline.tsv', pending: 12 }).join('\n')
  assert.ok(withPending.includes('/tmp/home/data/pipeline.tsv'), 'says where the report file lives')
  assert.ok(withPending.includes('jobdar tracker') && withPending.includes('jobdar tui') && withPending.includes('jobdar dashboard'))
  assert.ok(withPending.includes('--next 5') && withPending.includes('12'), 'offers the quick batch sizes with the real pending count')
  const drained = reportFooterLines(t, { file: '/tmp/p.tsv', pending: 0 }).join('\n')
  assert.ok(!drained.includes('--next'), 'no evaluate-more nudge when nothing is pending')
  const es = reportFooterLines(getT('es'), { file: '/x.tsv', pending: 3 }).join('\n')
  assert.ok(es.includes('informe de empleos') && es.includes('--next 5'), 'Spanish footer holds parity')
})

test('fix: dead JD links — findRoleMatches keeps every match; resolveJdSafe never escapes as a stack', async () => {
  const rows = [
    { url: 'u1', company: "Cincinnati Children's", role: 'EMR Analyst I - Epic Trainer' },
    { url: 'u2', company: "Cincinnati Children's", role: 'EMR Analyst I - Epic Patient Access' },
    { url: 'u3', company: 'Enova', role: 'Data Analyst' },
  ]
  assert.deepEqual(findRoleMatches(rows, { url: 'u2' }).map((r) => r.url), ['u2']) // exact --url wins, single
  assert.deepEqual(findRoleMatches(rows, { query: 'emr' }).map((r) => r.url), ['u1', 'u2']) // ALL matches, stored order — the tail becomes suggestions
  assert.deepEqual(findRoleMatches(rows, { query: 'enova' }).map((r) => r.url), ['u3']) // company matches too
  assert.deepEqual(findRoleMatches(rows, { query: 'zzz' }), [])
  assert.deepEqual(findRoleMatches(rows, { query: '' }), [])
  // A dead posting (provider matched, HTTP fetch failed) must resolve ok:false with the friendly
  // line printed — never throw to the global stack-dumping handler. Injected thrower = no network.
  const t = getT('en')
  const dead = await resolveJdSafe('https://acme.wd5.example/dead-posting', t, async () => {
    throw new Error('HTTP 404')
  })
  assert.equal(dead.ok, false)
  assert.equal(dead.description, '')
  // Garbage/unmatched refs RESOLVE empty (ok:true) — that's the caller's no-JD path, not an error.
  const garbage = await resolveJdSafe('https://[malformed', t)
  assert.equal(garbage.ok, true)
  assert.equal(garbage.description, '')
  // Local text files still extract on-device.
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-jd-'))
  const file = path.join(dir, 'jd.txt')
  writeFileSync(file, 'Junior Analyst — writes SQL.')
  const local = await resolveJdSafe(file, t)
  assert.equal(local.ok, true)
  assert.ok(local.description.includes('Junior Analyst'))
  rmSync(dir, { recursive: true, force: true })
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
