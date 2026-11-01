// Jobdar tests — the apply-likelihood gate.
// Run with `npm test`; `npm test -- prescreen` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { mergeScanned, serializePipeline, PIPELINE_COLS, recordPrescreen, pendingQueue } from '../lib/evaluations.mjs'
import { extractYearsRequired, extractDegreeGate, extractGates, screenDecision, prescreenRole, freshnessPoints, reasonLine, extractCredential, extractField, cvHasField, cvHasCredential, isHardIdentity, UNASSESSABLE_SCORE } from '../lib/prescreen.mjs'
import { clampVerdict } from '../lib/eval_engine.mjs'

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
  assert.equal(noJd.score, UNASSESSABLE_SCORE) // …but it ranks last: a résumé-blind neutral 30 used to put it above readable roles (1.69.0)
  assert.ok(noJd.score < stale.score)
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
