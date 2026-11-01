// Jobdar tests — Phase 8a: the automated eval engine, tailoring, customize, outreach drafts, the engine contract, pay.
// Run with `npm test`; `npm test -- eval-engine` runs only this file.

import { test, ROOT } from './_harness.mjs'
import { ALL, mockBackend, mockOpenAI } from './_helpers.mjs'
import { strict as assert } from 'node:assert'
import path from 'node:path'
import { PROFILE_DEFAULTS } from '../lib/config.mjs'
import { band } from '../lib/evaluations.mjs'
import { draftOutreach, buildOutreachUser, OUTREACH_SYSTEM } from '../lib/outreach.mjs'
import http from 'node:http'
import { callBackend } from '../lib/inference.mjs'
import { scoreFromJudgments, parseEvalJson, stripPII, clampVerdict, buildEvalUser, evalRole, buildVerdict, prepEval } from '../lib/eval_engine.mjs'
import { bandAgreement, buildBatchRequests, parseBatchResults, clampLogEntry } from '../lib/eval_ops.mjs'
import { extractText, isExtractable, structureCv } from '../lib/docparse.mjs'
import { importDocument, evaluate as engineEvaluate, recordVerdict, advanceStatus, buildCv, ENGINE_VERSION, tailor as engineTailor } from '../lib/engine.mjs'
import { coverIsComplete, assembleTailoredCv, TAILOR_JSON_SCHEMA, buildTailorUser, directiveBlock, TAILOR_SYSTEM, fillSignature } from '../lib/tailor.mjs'
import { effectiveDirectives, contentHash, recordVariant } from '../lib/customize_store.mjs'
import { parsePreConfirm, isBorderline, evalSystemFor, preConfirmSystemFor } from '../lib/eval_engine.mjs'
import { resolvePay, socForTitle, loadWages, loadSocMap } from '../lib/pay.mjs'

// --- Phase 8a: the automated eval engine (decomposed rubric, code-computed score, §3 gate/clamp) ---

test('8a: scoreFromJudgments computes the weighted 0–5 (code owns the number, not the model)', () => {
  assert.equal(scoreFromJudgments(ALL('strong')), 5.0)
  assert.equal(scoreFromJudgments(ALL('none')), 0.0)
  // skills strong .35 + exp partial .125 + level strong .20 + logistics none 0 + edu partial .025 = .70 / .90 → 3.9 (1.62.0 half-weights)
  assert.equal(scoreFromJudgments({ skills: { rating: 'strong' }, experience: { rating: 'partial' }, level_fit: { rating: 'strong' }, logistics: { rating: 'none' }, education: { rating: 'partial' } }), 3.9)
  assert.equal(scoreFromJudgments({}), 0.0) // missing → none
  // 5-level granularity (1.41.x): good=.75, weak=.25 fill the middle so realistic fits reach the Research band
  assert.equal(scoreFromJudgments(ALL('good')), 3.8) // 0.75 * 5 = 3.75 → 3.8
  // skills good + exp weak + level strong + log strong + edu good = .6125 / .90 → 3.4 — a strong logistics rating no longer lifts a weak-experience fit into Research on its own (1.62.0)
  assert.equal(scoreFromJudgments({ skills: { rating: 'good' }, experience: { rating: 'weak' }, level_fit: { rating: 'strong' }, logistics: { rating: 'strong' }, education: { rating: 'good' } }), 3.4)
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
  // 1.52.0: the logistics criterion is no longer rated blind — candidate location, target regions, and
  // the job's location all reach the model (the audit found logistics was 10% free points without them).
  const loc = buildEvalUser({ jd: 'x', cv: 'y', profile: { location: 'Cincinnati, OH', target_regions: ['midwest'] }, gates, today: '2026-06-14', location: 'Columbus, OH' })
  assert.ok(loc.includes('Candidate location: Cincinnati, OH') && loc.includes('Target region(s): midwest') && loc.includes('Job location: Columbus, OH'))
  assert.ok(buildEvalUser({ jd: 'x', cv: 'y', profile: {}, gates, today: '' }).includes('Job location: not stated')) // absent location stays honest
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
