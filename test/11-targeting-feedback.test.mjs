// Jobdar tests — zero-config scan, targeting, pay screen, would-apply, search, discover, USAJobs, sponsorship, radar, 1.64 package hygiene, SSRF, doctor.
// Run with `npm test`; `npm test -- targeting-feedback` runs only this file.

import { test } from './_harness.mjs'
import { ALL } from './_helpers.mjs'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { getStrings, getT } from '../lib/i18n.mjs'
import { globalCommandStatus } from '../doctor.mjs'
import { SUPPORTED_LANGUAGES, ROOT as PKG_ROOT } from '../lib/config.mjs'
import { providerIds } from '../providers/_contract.mjs'
import greenhouse from '../providers/greenhouse.mjs'
import { defaultPortalsForRegions } from '../lib/seed.mjs'
import { serializePipeline, parsePipeline, band, recordPrescreen, pendingQueue } from '../lib/evaluations.mjs'
import { recheckTargets } from '../lib/commands/recheck.mjs'
import { extractGates, screenDecision, prescreenRole, extractSponsorship } from '../lib/prescreen.mjs'
import { extractPay, parseSalaryText } from '../lib/salary.mjs'
import http from 'node:http'
import { expandQueryTerms, relevanceScore, parseIntent, termsFromResume } from '../lib/search.mjs'
import { feedbackStats, thumbFromWouldApply, FEEDBACK_COLS } from '../lib/feedback.mjs'
import { buildBetaReport } from '../lib/report_pure.mjs'
import usajobs, { parseUsaJobsSearchUrl, parseUsaJobsJobUrl, buildSearchUrl, mapSearchItems, assembleJd } from '../providers/usajobs.mjs'
import { slugVariants, atsCandidates, discoverCompanies } from '../lib/discover.mjs'
import { parseNextCount, reportFooterLines, distributionWarning, NEXT_MAX } from '../lib/commands/eval.mjs'
import { findRoleMatches } from '../lib/commands/tailor.mjs'
import { resolveJdSafe } from '../lib/commands/_jd.mjs'
import { renderRadar, renderSweep, fmtEta, fmtElapsed, visibleLength, createRadar, SWEEP_FRAMES } from '../lib/progress.mjs'

test('1.56.1 zero-config scan: defaultPortalsForRegions seeds real boards for a fresh home', () => {
  const midwest = defaultPortalsForRegions(['midwest'])
  assert.ok(midwest.length > 5, `midwest catalog seeds portals (got ${midwest.length})`)
  assert.ok(midwest.every((p) => p.company && p.careers_url), 'every portal is scannable (company + careers_url)')
  const everywhere = defaultPortalsForRegions(['nationwide'])
  assert.ok(everywhere.length >= midwest.length, 'nationwide covers at least the region slice')
  // An empty/unknown selection still returns the full catalog — a fresh tester must never scan nothing.
  assert.ok(defaultPortalsForRegions([]).length > 0)
})

test('1.59.0 targeting: termsFromResume turns an infra-IT résumé into terms that rank IT over customer service', () => {
  const cv = [
    '# Alex Doe', 'Columbus, OH · alex@example.com', '',
    'Infrastructure IT professional — systems, cloud, and networks.', '',
    '## Experience', '### Systems Administrator — Initech · 2022–2025',
    '- Administered Windows Server, Active Directory, VMware; 99.9% uptime',
    '### IT Support Specialist — Acme · 2020–2022',
    '- Tier 1/2 support for 500 users; imaging; ticket queue', '',
    '## Skills', '- Azure · Intune · Networking · PowerShell · Windows Server · VMware',
  ].join('\n')
  const terms = termsFromResume(cv)
  assert.ok(terms.titles.includes('systems administrator'), JSON.stringify(terms.titles))
  assert.ok(terms.keywords.includes('azure') && terms.keywords.includes('networking'))
  assert.ok(!terms.keywords.includes('present') && !terms.keywords.includes('experience'), 'résumé furniture filtered')
  // Contact-line city/state must NOT become keywords — a location token hands every local role a
  // relevance hit ("Medical Assistant, Columbus" ranking for an infra résumé, caught live).
  assert.ok(!terms.keywords.includes('columbus') && !terms.keywords.includes('example'), 'contact line filtered: ' + terms.keywords.join(','))
  assert.ok(!terms.keywords.includes('support') && !terms.keywords.includes('administrator'), 'bare role nouns dropped (title phrases carry them): ' + terms.keywords.join(','))
  // The complaint scenario: with these terms, IT titles must clearly outrank customer-service titles.
  const it = relevanceScore('Systems Administrator Kettering Health Dayton, OH', terms)
  const helpdesk = relevanceScore('IT Support Specialist Cleveland Clinic Cleveland, OH', terms)
  const cs = relevanceScore('Customer Service Associate Kroger Columbus, OH', terms)
  assert.ok(it > cs && helpdesk > cs, `it=${it} helpdesk=${helpdesk} cs=${cs}`)
  assert.deepEqual(termsFromResume(''), { keywords: [], titles: [], exclude: [] })
})

test('1.59.0 pay screen: an explicit target screens far-below-target STATED pay — quoted, never silent', () => {
  const jd = 'Customer Service Associate. Pay range: $17.00 – $19.00 per hour. Requirements: friendly attitude.'
  const cvText = 'Systems administrator with Azure and networking experience.'
  // $19/hr tops out ≈ $39.5k — 51% under an $80k target → screened WITH the numbers quoted.
  const withTarget = prescreenRole({ jdText: jd, cvText, today: '2026-08-28', profile: { target_salary: 80000, target_levels: ['entry', 'mid'] } })
  assert.equal(withTarget.screened, true)
  const payReason = withTarget.reasons.find((r) => r.kind === 'pay')
  assert.ok(payReason && /\$8?0k/.test(payReason.quote) && /hr|\$/.test(payReason.quote), JSON.stringify(payReason))
  // No target set → pay never screens (unchanged honesty).
  const noTarget = prescreenRole({ jdText: jd, cvText, today: '2026-08-28', profile: { target_levels: ['entry', 'mid'] } })
  assert.equal(noTarget.screened, false)
  // Near-target (inside 25%) → not screened; ranking handles it.
  const near = prescreenRole({ jdText: 'Analyst. Salary: $70,000 - $75,000 per year.', cvText, today: '2026-08-28', profile: { target_salary: 80000, target_levels: ['entry', 'mid'] } })
  assert.equal(near.screened, false)
  // Unstated pay + target → untouched (absence of a number proves nothing).
  const silent = prescreenRole({ jdText: 'Analyst role. Great team.', cvText, today: '2026-08-28', profile: { target_salary: 80000, target_levels: ['entry', 'mid'] } })
  assert.equal(silent.screened, false)
})

test('1.59.0 salary input: parseSalaryText reads human salary text honestly', () => {
  assert.equal(parseSalaryText('80k'), 80000)
  assert.equal(parseSalaryText('$80,000'), 80000)
  assert.equal(parseSalaryText('80000'), 80000)
  assert.equal(parseSalaryText('$80k+'), 80000)
  assert.equal(parseSalaryText('80'), 80000) // bare "80" means $80k, not $80
  assert.equal(parseSalaryText('62.5k'), 62500)
  assert.equal(parseSalaryText(''), 0) // blank = any
  assert.equal(parseSalaryText('any'), 0)
  assert.equal(parseSalaryText('eighty'), null) // unreadable → null, the UI says so
  assert.equal(parseSalaryText('9999999'), null) // outside sane bounds
})

test('1.55.0 would-apply: thumbFromWouldApply derives agreement per band; Research is never scored', () => {
  assert.equal(thumbFromWouldApply('apply', true), 'up') // eval said Apply, human would apply → right
  assert.equal(thumbFromWouldApply('apply', false), 'down') // eval said Apply, human wouldn't → wrong
  assert.equal(thumbFromWouldApply('dont', true), 'down') // eval said Don't, human WOULD apply → wrong (hidden opportunity)
  assert.equal(thumbFromWouldApply('dont', false), 'up')
  assert.equal(thumbFromWouldApply('research', true), '') // "I'd apply" doesn't contradict "look closer first"
  assert.equal(thumbFromWouldApply('research', false), '')
  assert.equal(thumbFromWouldApply('', true), '') // unknown band → never scored
})

test('1.55.0 beta report: counts are honest, Research stays unscored, and NO personal data leaks', () => {
  const rows = [
    { url: 'u1', status: 'scanned', prescreen: '70', score: '', band: '' },
    { url: 'u2', status: 'scanned', prescreen: '', score: '', band: '' },
    { url: 'u3', status: 'evaluated', score: 4.5, band: 'apply', eval_source: 'engine', listing_state: '' },
    { url: 'u4', status: 'evaluated', score: 3.7, band: 'research', eval_source: 'engine', listing_state: '' },
    { url: 'u5', status: 'evaluated', score: 1.2, band: 'dont', eval_source: 'manual', listing_state: 'gone' },
    { url: 'u6', status: 'applied', score: 4.8, band: 'apply', eval_source: 'engine', listing_state: '' },
  ]
  const feedback = [
    { url: 'u3', company: 'A', role: 'PM', score: 4.5, band: 'apply', thumb: 'up', would_apply: 'yes', date: '2026-08-28' },
    { url: 'u4', company: 'B', role: 'Coord', score: 3.7, band: 'research', thumb: '', would_apply: 'yes', date: '2026-08-28' },
    { url: 'u5', company: 'C', role: 'RN', score: 1.2, band: 'dont', thumb: 'up', would_apply: 'no', date: '2026-08-28' },
  ]
  const profile = { name: 'Sam Dotson', location: 'Cincinnati, OH', target_regions: ['midwest'], target_levels: ['entry', 'mid'], tuning_profile: 'career_changer', transferable_skills: true }
  const { data, md } = buildBetaReport({ rows, feedback, meta: { date: '2026-08-28', cliVersion: '1.55.0', platform: 'darwin arm64', backend: 'winc (local)', profile } })
  assert.equal(data.funnel.scanned, 2)
  assert.equal(data.funnel.prescreened, 1)
  assert.equal(data.funnel.evaluated, 4) // u3,u4,u5 + tracked u6 (tracked rows carry a verdict too)
  assert.equal(data.funnel.listingsGone, 1)
  assert.deepEqual(data.funnel.bands, { apply: 2, research: 1, dont: 0 }) // alive only; the gone dont is excluded
  assert.equal(data.ratings.n, 3)
  assert.equal(data.ratings.wouldApply, 2)
  assert.equal(data.ratings.agreementScored, 2) // the research answer is recorded but never scored
  assert.equal(data.ratings.agreementPct, 100)
  assert.equal(data.ratings.perBand.research.rated, 1)
  // PII guard: the report must not carry the tester's name, city, or any résumé text.
  const all = JSON.stringify(data) + md
  assert.ok(!all.includes('Sam Dotson') && !all.includes('Cincinnati'), 'no personal data in the report')
  assert.ok(md.includes('Would you apply?') && md.includes('no résumé content'), 'human sections present')
})

test('1.55.0 ledger back-compat: an old eval_feedback.tsv without would_apply reads as empty strings', () => {
  // readFeedback is fs-coupled; the parse contract it shares is header-name-driven like the pipeline —
  // simulate via FEEDBACK_COLS fill: an entry missing would_apply must serialize/read as ''.
  assert.ok(FEEDBACK_COLS.includes('would_apply'))
  assert.equal(FEEDBACK_COLS[FEEDBACK_COLS.length - 1], 'date') // date stays last (append-friendly diffing)
})

test('1.53.0 liveness: pendingQueue excludes gone listings; recheckTargets picks the actionable band rows', () => {
  const rows = [
    { url: 'u1', status: 'scanned', score: '', band: '', prescreen: '90', screen_reason: '', listing_state: '' },
    { url: 'u2', status: 'scanned', score: '', band: '', prescreen: '95', screen_reason: '', listing_state: 'gone' }, // dead → never queued for eval
    { url: 'u3', status: 'evaluated', score: 4.5, band: 'apply', screen_reason: '', listing_state: '' },
    { url: 'u4', status: 'evaluated', score: 3.7, band: 'research', screen_reason: '', listing_state: '' },
    { url: 'u5', status: 'evaluated', score: 1.2, band: 'dont', screen_reason: '', listing_state: '' },
    { url: 'u6', status: 'applied', score: 4.5, band: 'apply', screen_reason: '', listing_state: '' }, // tracked → default recheck skips
  ]
  assert.deepEqual(pendingQueue(rows).map((r) => r.url), ['u1'])
  assert.deepEqual(recheckTargets(rows).map((r) => r.url), ['u3', 'u4']) // default: un-tracked apply/research
  assert.deepEqual(recheckTargets(rows, { all: true }).map((r) => r.url), ['u3', 'u4', 'u5', 'u6'])
  assert.deepEqual(recheckTargets(rows, { url: 'u5' }).map((r) => r.url), ['u5'])
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
  assert.ok(tsv.split('\n')[0].endsWith('\tnotes\teval_source\tlisting_state\tchecked'))
})

test('phase10: engine seed.mjs is in lockstep with data/seed/employers.yml (regen: node scripts/gen-seed.mjs)', async () => {
  const yaml = (await import('js-yaml')).default
  const yml = yaml.load(readFileSync(path.join(PKG_ROOT, 'data', 'seed', 'employers.yml'), 'utf8'))
  const { SEED_EMPLOYERS } = await import('../packages/engine/seed.mjs')
  assert.deepEqual(SEED_EMPLOYERS, yml.employers) // generated module must mirror the source catalog
})

test('phase10: pure pipeline + outreach splits — parsePipeline round-trips; fs shells re-export unchanged', async () => {
  const pure = await import('../lib/pipeline_pure.mjs')
  const rows = [{ company: 'A', role: 'R', url: 'https://a.test/1', location: 'X', score: '', band: '', recommendation: '', status: 'scanned', posted: '', first_seen: '2026-07-08', updated: '2026-07-08', prescreen: '', screen_reason: '', pay: '', aliases: '', notes: '', eval_source: '', listing_state: '', checked: '' }]
  assert.deepEqual(pure.parsePipeline(pure.serializePipeline(rows)), rows) // pure round-trip
  // legacy text without the notes column parses with notes ''
  const legacy = 'company\trole\turl\nA\tR\thttps://a.test/1'
  assert.equal(pure.parsePipeline(legacy)[0].notes, '')
  // the fs shells re-export the same functions (identity, not forks)
  const evals = await import('../lib/evaluations.mjs')
  assert.equal(evals.mergeScanned, pure.mergeScanned)
  const opure = await import('../lib/outreach_pure.mjs')
  const outreach = await import('../lib/outreach.mjs')
  assert.equal(outreach.lintDraft, opure.lintDraft)
  assert.equal(outreach.draftOutreach, opure.draftOutreach)
  // usajobs creds seam: default dormant, settable, resilient to a throwing source
  const creds = await import('../providers/_creds.mjs')
  assert.deepEqual(creds.getUsaJobsCreds(), { key: '', email: '' })
  creds.setUsaJobsCredsSource(() => ({ key: 'k', email: 'e@x.com' }))
  assert.deepEqual(creds.getUsaJobsCreds(), { key: 'k', email: 'e@x.com' })
  creds.setUsaJobsCredsSource(() => { throw new Error('boom') })
  assert.deepEqual(creds.getUsaJobsCreds(), { key: '', email: '' })
  creds.setUsaJobsCredsSource(() => ({ key: '', email: '' })) // restore dormant for other tests
})

test('backend: compareWincVersion compares by base X.Y.Z (branch/prerelease suffix ignored); unparseable → null', async () => {
  const { compareWincVersion, MIN_WINC } = await import('../lib/commands/backend.mjs')
  assert.equal(MIN_WINC, '1.40.0')
  assert.equal(compareWincVersion('1.41.0-jobdar.1', '1.40.0'), 1)   // current branch build clears the floor
  assert.equal(compareWincVersion('1.21.4-jobdar.4', '1.40.0'), -1)  // the old pin is below it
  assert.equal(compareWincVersion('1.40.0', '1.40.0'), 0)
  assert.equal(compareWincVersion('1.40.0-jobdar.9', '1.40.0'), 0)   // suffix never tips the comparison
  assert.equal(compareWincVersion('1.9.9', '1.40.0'), -1)            // numeric, not lexical (9 < 40)
  assert.equal(compareWincVersion('(unknown)', '1.40.0'), null)      // unknown build → neither old nor new
  assert.equal(compareWincVersion('', '1.40.0'), null)
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
  // 1.52.0 scope line: every footer states that the employer itself isn't verified.
  assert.ok(withPending.includes("employer itself isn't verified"), 'EN scope disclosure present')
  assert.ok(es.includes('el empleador en sí no se verifica'), 'ES scope disclosure present')
})

test('1.52.0 honesty: distributionWarning fires only on a big, Apply-heavy run', () => {
  const t = getT('en')
  assert.equal(distributionWarning(t, { evaluated: 5, applyCount: 5 }), '') // too small to call a pattern
  assert.equal(distributionWarning(t, { evaluated: 20, applyCount: 8 }), '') // 40% — healthy
  const warn = distributionWarning(t, { evaluated: 20, applyCount: 15 })
  assert.ok(warn.includes('15 of 20') && warn.includes('75%'), warn)
  assert.ok(distributionWarning(getT('es'), { evaluated: 10, applyCount: 9 }).includes('Postúlate'), 'ES parity')
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

test('1.64.0: the Jobfaro-era compat shims are gone — JOBFARO_* env, JOBFARO_API_KEY=, ~/.jobfaro are all ignored (as announced in 1.63)', () => {
  const fakeHome = mkdtempSync(path.join(tmpdir(), 'jobdar-fake-home-'))
  const env = { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, JOBFARO_HOME: path.join(fakeHome, 'old') } // os.homedir() reads USERPROFILE on Windows
  delete env.JOBDAR_HOME; delete env.JOBDAR_DATA_DIR; delete env.JOBDAR_CONFIG_DIR
  mkdirSync(path.join(fakeHome, '.jobfaro'))
  const r = spawnSync(process.execPath, ['-e', "import('./lib/config.mjs').then(m => console.log(JSON.stringify({ home: m.paths.home, keys: Object.keys(m).filter((k) => /legacy/i.test(k)) })))"], {
    cwd: PKG_ROOT, env, encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stderr)
  const out = JSON.parse(r.stdout.trim())
  assert.ok(!r.stderr.includes('legacy env honored'), 'no JOBFARO_* mirroring any more')
  assert.deepEqual(out.keys, [], 'config.mjs exports no legacy shim state')
  // repo-local mode (a checkout with config/profile.yml) wins; otherwise the home is ~/.jobdar even though ~/.jobfaro exists
  assert.equal(out.home, existsSync(path.join(PKG_ROOT, 'config', 'profile.yml')) ? PKG_ROOT : path.join(fakeHome, '.jobdar'))
  const data = path.join(fakeHome, 'data')
  mkdirSync(data)
  const read = () => execFileSync(process.execPath, ['-e', "import('./lib/config.mjs').then(m => console.log(m.loadApiKey({})))"], {
    cwd: PKG_ROOT, env: { ...process.env, JOBDAR_HOME: fakeHome, JOBDAR_DATA_DIR: data }, encoding: 'utf8',
  }).trim()
  writeFileSync(path.join(data, 'credentials.env'), 'JOBFARO_API_KEY=legacy-key-123\n')
  assert.equal(read(), '', 'the 1.49–1.62 key spelling is no longer read')
  writeFileSync(path.join(data, 'credentials.env'), 'JOBDAR_API_KEY=new-key-456\n')
  assert.equal(read(), 'new-key-456')
  const t = getT('en')
  assert.equal(t('doctor.home_legacy'), 'doctor.home_legacy', 'the doctor migration lines are retired with the shims')
  rmSync(fakeHome, { recursive: true, force: true })
})

test('1.64.0: the package is jobdar with bins jobdar + jd only (jf retired), and no user-facing string says jobfaro', () => {
  const pkg = JSON.parse(readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'jobdar')
  assert.deepEqual(Object.keys(pkg.bin).sort(), ['jd', 'jobdar'])
  assert.ok(Object.values(pkg.bin).every((b) => b === 'bin/jobdar'))
  for (const lang of SUPPORTED_LANGUAGES) {
    const strings = JSON.stringify(getStrings(lang))
    // the one remaining mention is the broken-link repair hint that also clears a stale Jobfaro-era global link
    const stray = (strings.match(/jobfaro/gi) || []).length
    const allowed = (strings.match(/npm rm -g jobdar jobfaro/g) || []).length
    assert.equal(stray, allowed, `${lang}: "jobfaro" may only appear in the stale-link cleanup hint`)
  }
  for (const f of ['install.sh', 'install.ps1', 'apps/server/index.mjs', 'apps/desktop/main.cjs', 'apps/jobdar/src/serve.ts', 'apps/jobdar/src/store.ts']) {
    const src = readFileSync(path.join(PKG_ROOT, f), 'utf8')
    assert.ok(!/JOBFARO_|'jobfaro-/.test(src), `${f} still carries a Jobfaro-era shim`)
  }
})

test('1.63.1 SSRF: CGNAT + hex IPv4-mapped literals are blocked, and a hostname that resolves private is refused through the resolver seam', async () => {
  const { isBlockedHost, setHostResolver, assertResolvesPublic, fetchJson } = await import('../lib/http.mjs')
  for (const h of ['100.64.0.1', '100.127.255.255', '::ffff:7f00:1', '::ffff:a00:1', '::ffff:127.0.0.1', '169.254.169.254', '[::1]']) assert.equal(isBlockedHost(h), true, h)
  for (const h of ['100.128.0.1', '100.63.255.255', '::ffff:808:808', '8.8.8.8', 'boards-api.greenhouse.io']) assert.equal(isBlockedHost(h), false, h)
  // No resolver installed (the native app's situation): the name-level guard alone applies.
  setHostResolver(null)
  assert.equal(await assertResolvesPublic('boards-api.greenhouse.io'), null)
  try {
    // A resolver that says the allowed name points at loopback → refused BEFORE any request is sent.
    setHostResolver(async () => ['127.0.0.1'])
    await assert.rejects(() => assertResolvesPublic('boards-api.greenhouse.io'), /private\/loopback address \(127\.0\.0\.1\)/)
    await assert.rejects(() => fetchJson('https://boards-api.greenhouse.io/v1/boards/acme/jobs', { hostAllowlist: [/(^|\.)greenhouse\.io$/] }), /private\/loopback/)
    setHostResolver(async () => ['3.3.3.3', '::ffff:a00:1']) // one public, one private → still refused
    await assert.rejects(() => assertResolvesPublic('x.example'), /private\/loopback/)
    setHostResolver(async () => ['3.3.3.3'])
    assert.deepEqual(await assertResolvesPublic('x.example'), ['3.3.3.3'])
    setHostResolver(async () => { const e = new Error('nope'); e.code = 'ENOTFOUND'; throw e })
    await assert.rejects(() => assertResolvesPublic('x.example'), /Could not resolve x\.example: ENOTFOUND/)
  } finally {
    setHostResolver(null)
  }
  // The Node wiring module installs a real resolver (lib/http_node.mjs) — localhost resolves private.
  await import('../lib/http_node.mjs')
  await assert.rejects(() => assertResolvesPublic('localhost'), /private\/loopback/)
  setHostResolver(null)
})

test('doctor: globalCommandStatus classifies PATH entries — ok / broken (moved checkout) / elsewhere / missing', () => {
  const bin = mkdtempSync(path.join(tmpdir(), 'jobdar-bin-'))
  const repo = mkdtempSync(path.join(tmpdir(), 'jobdar-repo-'))
  mkdirSync(path.join(repo, 'bin'))
  writeFileSync(path.join(repo, 'bin', 'jobdar'), '#!/usr/bin/env node\n')
  const opts = { pathDirs: ['', bin], repoRoot: repo } // empty PATH entries are skipped, not treated as cwd

  assert.deepEqual(globalCommandStatus('jobdar', opts), { status: 'missing', target: null })

  // npm link's symlink chain resolves into the checkout → ok.
  symlinkSync(path.join(repo, 'bin', 'jobdar'), path.join(bin, 'jobdar'))
  assert.equal(globalCommandStatus('jobdar', opts).status, 'ok')

  // The checkout was renamed → the link dangles → broken, and the stale target is reported.
  const gone = path.join(repo, 'old-name', 'bin', 'jobdar')
  symlinkSync(gone, path.join(bin, 'jd'))
  const broken = globalCommandStatus('jd', opts)
  assert.equal(broken.status, 'broken')
  assert.equal(broken.target, gone)

  // A real command that lives outside the checkout (another copy, an npm -g release) → elsewhere.
  const other = mkdtempSync(path.join(tmpdir(), 'jobdar-other-'))
  writeFileSync(path.join(other, 'stray'), '')
  symlinkSync(path.join(other, 'stray'), path.join(bin, 'stray'))
  const elsewhere = globalCommandStatus('stray', opts)
  assert.equal(elsewhere.status, 'elsewhere')
  assert.equal(elsewhere.target, realpathSync(path.join(other, 'stray')))

  // First PATH hit wins, like the shell: a broken link in an earlier dir shadows a good later one.
  const bin2 = mkdtempSync(path.join(tmpdir(), 'jobdar-bin2-'))
  symlinkSync(path.join(repo, 'bin', 'jobdar'), path.join(bin2, 'jd'))
  assert.equal(globalCommandStatus('jd', { pathDirs: [bin, bin2], repoRoot: repo }).status, 'broken')
  assert.equal(globalCommandStatus('jd', { pathDirs: [bin2, bin], repoRoot: repo }).status, 'ok')

  for (const d of [bin, bin2, repo, other]) rmSync(d, { recursive: true, force: true })
})
