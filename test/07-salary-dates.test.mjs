// Jobdar tests — Phase 7.8: salary, dates, dedup, html entities.
// Run with `npm test`; `npm test -- salary-dates` runs only this file.

import { test, ROOT } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalLocation, regionPriority, regionForLocation } from '../lib/regions.mjs'
import { mergeScanned, recordEval, band, pruneScanned, PIPELINE_COLS, recordPrescreen, roleKey, resolveAlias } from '../lib/evaluations.mjs'
import { prescreenRole, blendSalary } from '../lib/prescreen.mjs'
import { extractPay, bandVsTarget, formatPay, paySummary, SALARY_TOLERANCE, SALARY_FLOOR } from '../lib/salary.mjs'
import { normalizeResumeDates, monthYear } from '../lib/dates.mjs'
import { decodeEntities, stripTags } from '../lib/html.mjs'

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

test('prescreen: salary blends into rank; screens ONLY past the explicit-target 25% line (1.59.0)', () => {
  assert.equal(blendSalary(80, null, 0.05), 80) // no pay → unchanged
  assert.equal(blendSalary(80, 1, 0), 80) // weight 0 → unchanged
  assert.equal(blendSalary(80, 1, 0.05), 81) // above-target nudges up
  assert.equal(blendSalary(80, 0, 0.05), 76) // below-target dips but never to 0
  assert.ok(blendSalary(50, 0, 1) >= 1) // even at max weight + zero salary, a non-screened role stays > 0
  const cv = 'Analyst with SQL and Python skills.'
  const jd = 'Analyst role using SQL and Python. The annual salary range is $110,000 - $140,000.'
  const hi = prescreenRole({ jdText: jd, cvText: cv, posted: '2026-06-12', today: '2026-06-13', profile: { target_salary: 80000, score_weights: { salary: 0.05 } } })
  // $140k ceiling vs a $160k target = 12.5% short — inside the 25% line, so it ranks lower but stays.
  const lo = prescreenRole({ jdText: jd, cvText: cv, posted: '2026-06-12', today: '2026-06-13', profile: { target_salary: 160000, score_weights: { salary: 0.05 } } })
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
