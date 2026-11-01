// Jobdar tests — 1.70.0: the metro penalty.
// Run with `npm test`; `npm test -- metro-penalty` runs only this file.

import { test } from './_harness.mjs'
import { ALL } from './_helpers.mjs'
import { strict as assert } from 'node:assert'
import workday, { locationFromBullets, normalize as normalizeWorkday } from '../providers/workday.mjs'
import { parseLocation, placesIn, distanceKm, metroPenalty, metroPenaltyPoints, METRO_RADIUS_KM } from '../lib/regions.mjs'
import { recordEval, band } from '../lib/evaluations.mjs'
import { buildVerdict } from '../lib/eval_engine.mjs'

// --- 1.70.0: the metro penalty — code's slight preference for the person's own city ---

test('regions: the place table carries coordinates — placesIn names every place a location points at (1.70.0)', () => {
  const one = (s) => placesIn(s).map((p) => `${p.name}/${p.st}`)
  assert.deepEqual(one('Cincinnati, OH'), ['cincinnati/OH'])
  assert.deepEqual(one("Cincinnati Children's, Cincinnati OH"), ['cincinnati/OH']) // a bare trailing code names the state
  assert.deepEqual(one('Main Campus, Columbus, OH'), ['columbus/OH']) // "Main Campus" places nothing
  assert.deepEqual(one('Main Campus Columbus OH'), ['columbus/OH']) // a name inside a segment, trusted beside its state
  assert.deepEqual(one('Columbus, GA'), ['columbus/GA']) // the named state picks the entry
  assert.deepEqual(one('Columbus'), ['columbus/OH']) // no state → the most populous
  assert.deepEqual(one('US-OH-Cincinnati'), ['cincinnati/OH']) // iCIMS form
  assert.deepEqual(one('Cincinnati, OH; Grand Rapids, MI'), ['cincinnati/OH', 'grand rapids/MI'])
  for (const none of ['', '2 Locations', '8 Locations', 'Remote', 'Ohio', 'OH', 'Main Campus']) assert.deepEqual(one(none), [], JSON.stringify(none))
  const [cin] = placesIn('Cincinnati, OH')
  assert.ok(Math.abs(cin.lat - 39.13) < 0.01 && Math.abs(cin.lon + 84.51) < 0.01)
  const km = (a, b) => distanceKm(placesIn(a)[0], placesIn(b)[0])
  assert.ok(km('Cincinnati, OH', 'Mason, OH') < METRO_RADIUS_KM) // a suburb sits inside the metro circle
  assert.ok(km('Cincinnati, OH', 'Florence, KY') < METRO_RADIUS_KM) // across the river too
  assert.ok(km('Cincinnati, OH', 'Dayton, OH') > METRO_RADIUS_KM) // a neighbouring metro sits outside it
  assert.ok(km('Cincinnati, OH', 'Columbus, OH') > 150 && km('Cincinnati, OH', 'Columbus, OH') < 170)
  // The 1.65.0 placing still reads the same table
  assert.deepEqual(parseLocation('Beavercreek').usStates, ['OH'])
})

test('regions: metroPenalty — nothing in the metro, a fixed few tenths outside it, nothing for remote/unplaced/blank-profile/weight-0 (1.70.0)', () => {
  const profile = { location: 'Cincinnati, OH', score_weights: { resume: 0.7, location: 0.15, seniority: 0.1, salary: 0.05 } }
  const pen = (location, p = profile) => metroPenalty({ location, profile: p })
  // same metro: the city, a suburb the table places near it, the other side of the river
  for (const home of ['Cincinnati, OH', 'Cincinnati', "Cincinnati Children's, Cincinnati OH", 'Mason, OH', 'Blue Ash, OH', 'Covington, KY', 'Florence, KY', 'US-OH-Cincinnati']) assert.deepEqual(pen(home), { points: 0, note: '', tier: 'home' }, home)
  // elsewhere in the state, a neighbouring metro, another state: the same small fixed amount, with the why
  assert.deepEqual(pen('Columbus, OH'), { points: 0.3, note: '0.3 off for Columbus vs Cincinnati', tier: 'away' })
  assert.deepEqual(pen('Main Campus, Columbus, OH'), { points: 0.3, note: '0.3 off for Columbus vs Cincinnati', tier: 'away' })
  assert.equal(pen('Dayton, OH').points, 0.3)
  assert.deepEqual(pen('Grand Rapids, MI'), { points: 0.3, note: '0.3 off for Grand Rapids vs Cincinnati', tier: 'away' })
  assert.equal(pen('Carmel, IN').note, '0.3 off for Carmel vs Cincinnati')
  assert.equal(pen('Chicago, IL').points, 0.3)
  // a multi-site role is measured at its nearest site
  assert.equal(pen('Columbus, OH; Cincinnati, OH').tier, 'home')
  // remote loses nothing, even when anchored elsewhere
  for (const r of ['Remote', 'Remote - Columbus, OH', 'Remote in Ohio']) assert.deepEqual(pen(r), { points: 0, note: '', tier: 'remote' }, r)
  // nothing to measure → nothing comes off
  for (const u of ['', '2 Locations', '8 Locations', 'Ohio', 'OH', 'West Chester, OH']) assert.deepEqual(pen(u), { points: 0, note: '', tier: 'unplaced' }, JSON.stringify(u))
  // a profile with no placeable location
  assert.deepEqual(pen('Columbus, OH', { location: '' }), { points: 0, note: '', tier: 'unplaced' })
  assert.deepEqual(pen('Columbus, OH', { location: 'Midwest' }), { points: 0, note: '', tier: 'unplaced' })
  // the size comes from the location weight: 0.15 → 0.3 (also the default), 0.2 → 0.4, capped at 0.5, 0 → off
  assert.equal(metroPenaltyPoints({}), 0.3)
  assert.equal(metroPenaltyPoints({ score_weights: { location: 0.2 } }), 0.4)
  assert.equal(metroPenaltyPoints({ score_weights: { location: 0.1 } }), 0.2)
  assert.equal(metroPenaltyPoints({ score_weights: { location: 0.9 } }), 0.5)
  assert.equal(metroPenaltyPoints({ score_weights: { location: 0 } }), 0)
  assert.deepEqual(pen('Columbus, OH', { location: 'Cincinnati, OH', score_weights: { location: 0 } }), { points: 0, note: '', tier: 'off' })
  assert.equal(pen('Columbus, OH', { location: 'Mason, OH', score_weights: { location: 0.2 } }).note, '0.4 off for Columbus vs Mason')
})

test('8a/1.70.0: buildVerdict takes the metro penalty off BEFORE the band is read — the saved band follows, the note says why, rawScore stays the model number', () => {
  const profile = { location: 'Cincinnati, OH', score_weights: { location: 0.15 } }
  const reply = (r) => JSON.stringify({ required: { candidate_meets_all: true }, ...ALL(r), recommendation: 'Strong hire.' })
  const run = (text, location) => buildVerdict({ text, jd: '', gates: {}, decision: { screened: false }, profile, location })
  const home = run(reply('strong'), 'Cincinnati, OH')
  assert.deepEqual([home.score, home.band, home.rawScore, home.metroPenalty, home.recommendation], [5, 'apply', 5, 0, 'Strong hire.'])
  const away = run(reply('strong'), 'Main Campus, Columbus, OH')
  assert.deepEqual([away.score, away.band, away.rawScore, away.metroPenalty], [4.7, 'apply', 5, 0.3]) // a strong Apply stays an Apply
  assert.equal(away.recommendation, '0.3 off for Columbus vs Cincinnati. Strong hire.')
  assert.equal(away.metroNote, '0.3 off for Columbus vs Cincinnati')
  // a borderline Apply becomes Research — in the band, not just the number
  const edge = JSON.stringify({ required: { candidate_meets_all: true }, skills: { rating: 'strong' }, experience: { rating: 'good' }, level_fit: { rating: 'good' }, logistics: { rating: 'good' }, education: { rating: 'good' }, recommendation: 'ok' }) // 0.7625/0.9 × 5 = 4.24 → 4.2
  assert.deepEqual([run(edge, 'Cincinnati, OH').score, run(edge, 'Cincinnati, OH').band], [4.2, 'apply'])
  assert.deepEqual([run(edge, 'Grand Rapids, MI').score, run(edge, 'Grand Rapids, MI').band], [3.9, 'research'])
  // remote, unplaced and a missing location lose nothing; a clamp keeps its own reason
  for (const loc of ['Remote', '2 Locations', '', undefined]) assert.deepEqual([run(reply('strong'), loc).score, run(reply('strong'), loc).metroPenalty], [5, 0], String(loc))
  const clamped = buildVerdict({ text: JSON.stringify({ required: { candidate_meets_all: false, note: 'active PE license required' }, ...ALL('strong'), recommendation: 'x' }), jd: '', gates: {}, decision: { screened: false }, profile, location: 'Columbus, OH' })
  assert.equal(clamped.band, 'dont')
  assert.ok(!clamped.recommendation.includes('off for'))
  // the pipeline row records the adjusted score and band
  const rows = recordEval([], { url: 'u', score: away.score, band: away.band, recommendation: away.recommendation, source: 'engine' }, '2026-10-15')
  assert.deepEqual([rows[0].score, rows[0].band], [4.7, 'apply'])
})

test('workday: a posting with no locationsText reads its "City, ST" from bulletFields — never a req id or a label (1.70.0)', () => {
  assert.equal(locationFromBullets(['R225927', 'Scheduled Weekly Hours', 'Grand Rapids, MI']), 'Grand Rapids, MI')
  assert.equal(locationFromBullets(['JR-12345', 'Full time']), '')
  assert.equal(locationFromBullets(['2 Locations', 'R1']), '2 Locations')
  assert.equal(locationFromBullets(['Remote', 'R1']), 'Remote')
  assert.equal(locationFromBullets(undefined), '')
  const corewell = normalizeWorkday({ title: 'Agile Product Owner', externalPath: '/job/Grand-Rapids-MI/Agile-Product-Owner_R225927', bulletFields: ['Grand Rapids, MI', 'R225927', 'Scheduled Weekly Hours'] }, 'https://spectrumhealth.wd5.myworkdayjobs.com', 'CorewellHealthCareers', 'Corewell')
  assert.equal(corewell.location, 'Grand Rapids, MI')
  assert.equal(normalizeWorkday({ title: 'x', externalPath: '/job/a', locationsText: 'Indianapolis, IN', bulletFields: ['Columbus, OH'] }, 'https://a.wd5.myworkdayjobs.com', 'S', 'A').location, 'Indianapolis, IN') // locationsText still wins
})
