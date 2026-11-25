// Jobdar — automated evaluation engine (Phase 8a). The MODEL judges fit; CODE owns the number and the
// gates. Pipeline (rec-spec §3): normalizeDates → extract (prescreen) → gate (screen) → judge (fit-only,
// decomposed sub-criteria) → clamp (requirements/level) + merge pay (salary.mjs) → verdict.
//
// Decomposed rubric (8a.4): the model rates 5 sub-criteria strong/partial/none with quoted evidence and
// fills a requirements-check block FIRST (8a.4b) against facts prescreen already extracted; CODE computes
// the weighted 0–5 and applies the shipped band thresholds. The eval JSON NEVER contains a salary number
// (§3b) — pay is merged post-model. Runs over any backend (winc/api/ollama) via lib/inference.mjs.

import { extractGates, screenDecision, reasonLine } from './prescreen.mjs'
import { extractPay, bandVsTarget, paySummary } from './salary.mjs'
import { normalizeResumeDates } from './dates.mjs'
import { band, BANDS } from './bands.mjs'
import { callBackend } from './inference.mjs'
import { metroPenalty } from './regions.mjs'
import { resumeJobs, buildFieldUser, parseFieldReply, fieldYearsCheck, isYearsOnly, FIELD_SYSTEM, FIELD_JSON_SCHEMA } from './experience.mjs'

// Weighted sub-criteria (rec-spec §3). Raw weights skills 35 / experience 25 / level-fit 20 / logistics 5 /
// education 5 — scoreFromJudgments normalizes by the total (0.90), so the EFFECTIVE shares are 39 / 28 / 22 /
// 5.6 / 5.6. Logistics + education were halved on 2026-09-24 (1.62.0): on the 50-row labeled bench they were
// mostly noise for the eval model (label agreement 32 → 39/50 with Apply precision unchanged; the Research
// band stopped collecting labeled-Don't admin roles parked at exactly 3.5). See
// docs/spark-x2.5-eval-candidate.md → "The zero-weight fix, tried on both models".
export const SUBCRITERIA = [
  { key: 'skills', weight: 0.35 },
  { key: 'experience', weight: 0.25 },
  { key: 'level_fit', weight: 0.2 },
  { key: 'logistics', weight: 0.05 },
  { key: 'education', weight: 0.05 },
]
// 5-level ratings (was 3): the extra steps smooth the score lattice so a genuine early-career fit can land
// in the Research band (3.5–3.9) instead of clustering at Apply/Don't. Back-compat: strong/partial/none
// keep their old values, so older verdicts read identically.
const RATING = { strong: 1, good: 0.75, partial: 0.5, weak: 0.25, none: 0 }

// 8a.4a: the JSON schema for guaranteed-JSON backends (winc-jobdar.4 / OpenAI-compat response_format).
// Default path is prompt + parseEvalJson, which works on every backend incl. winc.cpp jobdar.3.
const SUB = { type: 'object', properties: { rating: { type: 'string', enum: ['strong', 'good', 'partial', 'weak', 'none'] }, evidence: { type: 'string' } }, required: ['rating'] }
export const EVAL_JSON_SCHEMA = {
  name: 'jobdar_eval',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['required', 'skills', 'experience', 'level_fit', 'logistics', 'education', 'recommendation'],
    properties: {
      // 1.71.0: `unmet` lists each HARD requirement the candidate misses, quoted from the JD; [] = none.
      required: { type: 'object', properties: { candidate_meets_all: { type: 'boolean' }, unmet: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } }, required: ['candidate_meets_all', 'unmet'] },
      skills: SUB, experience: SUB, level_fit: SUB, logistics: SUB, education: SUB,
      recommendation: { type: 'string' },
    },
  },
}

// Code computes the 0–5 from the model's categorical sub-judgments — the model never emits a number.
export function scoreFromJudgments(judgments = {}) {
  let sum = 0
  let total = 0
  for (const { key, weight } of SUBCRITERIA) {
    const rating = judgments[key] && judgments[key].rating
    sum += (RATING[rating] != null ? RATING[rating] : 0) * weight
    total += weight
  }
  // Ratings are multiples of .25 and weights of .05, so the true value is an exact decimal; the epsilon only
  // cancels binary float noise at .x5 boundaries (0.675/0.9 = 0.7499999… would otherwise round 3.75 down).
  return Math.round((sum / total) * 5 * 10 + 1e-9) / 10 // 0.0–5.0, one decimal
}

// Strip name/contact lines from the CV slice before it reaches the model (8a.6 fairness + less PII out).
export function stripPII(cv, profile = {}) {
  let s = String(cv || '')
  s = s.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  // Phone-SHAPED only (10-digit grouping) — must NOT eat résumé date ranges like "2019-2023" (8 digits),
  // which carry the experience/level-fit signal the model is asked to judge.
  s = s.replace(/(?:\+?\d[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '[phone]')
  s = s.replace(/https?:\/\/\S+/g, '[url]')
  if (profile.name) s = s.split(profile.name).join('[name]')
  return s
}

// Robustly pull the JSON verdict object out of the model reply (8a.4a fallback when no response_format).
export function parseEvalJson(text) {
  const s = String(text || '')
  const start = s.indexOf('{')
  if (start === -1) return null
  const end = s.lastIndexOf('}')
  if (end > start) {
    try {
      return JSON.parse(s.slice(start, end + 1)) // greedy: the whole {…} span (fast path)
    } catch {
      /* fall through to a balanced scan */
    }
  }
  // Balanced-brace scan from the first '{' — survives trailing prose with a stray brace.
  let depth = 0
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++
    else if (s[i] === '}' && --depth === 0) {
      try {
        return JSON.parse(s.slice(start, i + 1))
      } catch {
        return null
      }
    }
  }
  return null
}

// The eval system prompt — decomposed, reason-then-judge, JSON-only. Compact so small local models comply.
// v2 (1.52.0, measured 2026-08-28 on a 50-role real-JD labeled corpus vs the shipped prompt): defines all
// five criteria (v1 never told the model what "logistics"/"education" meant), reserves "strong" as
// strictly as "none" (v1's one-sided none-only caution let the model answer "strong" reflexively — 44%
// Apply, a 7-way tie at 4.8+, ZERO Research verdicts), and the JSON template shows each rating level
// exactly once (v1's template had 3× "strong" — an anchor pushing ratings up). Measured result: band
// distribution 5/11/34 vs hand labels 5/9/36, core agreement 87%→90%, Research band alive (0→11).
// NO anchor examples by design — 8a.4b measured few-shot as harmful. Any wording change here is a
// RECALIBRATION EVENT: re-run the bench before shipping it.
export const EVAL_SYSTEM =
  'You are Jobdar, scoring how well ONE job fits a candidate (new grad / early-career job seeker). Judge ' +
  'ONLY fit against the résumé — do NOT consider salary. Criteria: "skills" = the JD’s named skills/tools ' +
  'vs résumé evidence; "experience" = how much of THIS role’s actual day-to-day work the candidate has ' +
  'done; "level_fit" = the role’s seniority vs the candidate’s target level(s); "logistics" = the job’s ' +
  'location/remote arrangement vs the candidate’s location and target regions; "education" = the JD’s ' +
  'degree/certification asks vs the résumé. For each criterion, reason briefly then rate it on a 5-level ' +
  'scale: "strong" (clearly meets), "good" (mostly meets), "partial" (partial or transferable), "weak" ' +
  '(a little), or "none" (NO relevant signal at all), with a short quoted JD line as evidence. Be strict ' +
  'at BOTH ends: use "none" only when there is genuinely nothing to point to, and use "strong" only when ' +
  'the résumé explicitly demonstrates THIS criterion for THIS role’s actual work — general professional ' +
  'competence, or strength in a different kind of work, is "good" or "partial", never "strong". Most real ' +
  'candidate-job pairs are mixed: rate each criterion independently and expect a mixed set of ratings, ' +
  'not five identical ones. Use the VERIFIED REQUIREMENTS provided to set candidate_meets_all (true only ' +
  'if the candidate clears every HARD requirement) and list in "unmet" each HARD requirement the candidate ' +
  'misses, quoted briefly from the JD — only items the JD REQUIRES, never ones it calls preferred, a plus, ' +
  'or nice to have; an empty list when none are missed. Reply with ONLY this JSON object — no prose, no code ' +
  'fence:\n' +
  '{"required":{"candidate_meets_all":true,"unmet":[],"note":""},"skills":{"rating":"good","evidence":""},' +
  '"experience":{"rating":"partial","evidence":""},"level_fit":{"rating":"strong","evidence":""},' +
  '"logistics":{"rating":"weak","evidence":""},"education":{"rating":"none","evidence":""},' +
  '"recommendation":""}\nNever invent experience the résumé does not show.'

// Transferable-skills mode (the toggle): CREDIT adjacent/foundational skills that genuinely map to the
// role — WITHOUT lowering the bar (this changes what counts as a fit, not how many roles pass). Appended
// to the rubric only when the toggle is on (profile.transferable_skills).
export const TRANSFERABLE_EVAL_NOTE =
  '\n\nTRANSFERABLE-SKILLS MODE (the candidate is a new grad / career changer): rate skills and ' +
  'experience on the STRENGTH OF THE BRIDGE from the résumé to each requirement — NOT on whether the ' +
  'prior title or field matches. A clear, well-evidenced adjacent skill earns the SAME rating a direct ' +
  'one would: "strong" when the bridge is obvious and you can cite it, "partial" when the bridge is real ' +
  'but only partial, "none" when there is no genuine bridge. Cite the résumé item and the requirement it ' +
  'bridges. Do NOT inflate — never invent a bridge and never credit a generic buzzword — but do NOT ' +
  'discount a real, evidenced transferable skill just because it came from another field. Strongly ' +
  'targeted fits only — quality over quantity.' +
  // v2 (1.52.0): the bridge rule needed a floor — without it, "organized, communicates well, technical"
  // bridged an experienced professional into EVERYTHING (eight identical admin-support roles at 4.8).
  ' Generic professional strengths (organization, communication, reliability, “being technical”) are ' +
  'NOT bridges. If the candidate has never done this role’s core day-to-day work — directly or through ' +
  'a genuinely adjacent version of it — cap "experience" at "partial".'
export const evalSystemFor = (transferable) => (transferable ? EVAL_SYSTEM + TRANSFERABLE_EVAL_NOTE : EVAL_SYSTEM)

// Build the user message: today's date + prescreen's verified gate facts + the candidate/job location
// line (1.52.0 — without it the logistics criterion was rated blind) + the PII-stripped, date-
// normalized CV + the JD. Pure (so it's testable). The location line sits with the other per-job lines
// BEFORE the CV, so it doesn't change the (already per-job) prompt-prefix shape 8a.8 relies on.
export function buildEvalUser({ jd, cv, profile = {}, gates, today = '', location = '' }) {
  const lv = Array.isArray(profile.target_levels) && profile.target_levels.length ? profile.target_levels.join('/') : 'entry'
  const regions = Array.isArray(profile.target_regions) && profile.target_regions.length ? profile.target_regions.join('/') : 'midwest'
  const g = gates || {}
  const req = [
    `- Minimum years of experience required: ${g.years ? g.years.years : 'none stated'}`,
    `- Degree requirement: ${g.degree?.gate ?? 'unclear'}`,
    `- Active security clearance required: ${g.clearance?.gate === 'hard' ? 'yes' : 'no'}`,
    `- License/cert asked: ${g.license?.flagged ? g.license.quote : 'none'}`,
  ].join('\n')
  return (
    (today ? `Today's date is ${today}.\n\n` : '') +
    `VERIFIED REQUIREMENTS (Jobdar extracted these from the JD — treat as facts):\n${req}\n` +
    `Candidate target level(s): ${lv}. Profile: ${profile.tuning_profile || 'new_grad'}.\n` +
    `Candidate location: ${profile.location || 'not stated'}. Target region(s): ${regions}. Job location: ${location || 'not stated'}.\n\n` +
    `CANDIDATE RÉSUMÉ:\n${stripPII(String(cv || '(none provided)'), profile).slice(0, 6000)}\n\n` +
    `JOB DESCRIPTION:\n${String(jd || '').slice(0, 6000)}`
  )
}

// Apply the deterministic clamp (rec-spec §3): a HARD blocker forces the verdict below the Research band
// into Don't, carrying the quoted reason. Fairness (8a.6): under no_degree a degree requirement NEVER
// drives the clamp (it only flags). Calibration (1.41.x): a "X+ years" shortfall NEVER hard-clamps —
// transferable or not — because the experience sub-score already reflects it and the prescreen ceiling
// pre-screens egregious over-reach; nuking a strong-skills early-career fit to Don't for a years gap is
// the "cliff" that emptied the Research band. Genuine hard credentials (license / cert / clearance /
// excluded-degree / hard-identity field / no-sponsorship when the user needs it) still clamp even when
// the note mentions a year count. Pure.
export function clampVerdict({ score, judgments, gates, decision, profile = {}, transferable } = {}) {
  const reasons = []
  // Hard gates prescreen already knows about (active clearance, excluded degree, hard credential/field).
  // A prescreen YEARS reason no longer hard-clamps here — the experience sub-score already reflects it and a
  // strong-skills early-career fit shouldn't be nuked to Don't for a years gap (the ceiling still pre-screens
  // egregious over-reach). Genuine hard blockers (license/cert/clearance/excluded-degree/field) still clamp.
  if (decision && decision.screened) {
    for (const r of decision.reasons || []) {
      if (r.kind === 'degree' && profile.tuning_profile === 'no_degree') continue // never auto-zero on degree
      if (r.kind === 'years') continue // a years shortfall shapes the score, it doesn't hard-gate
      reasons.push(r)
    }
  }
  // The model's requirements verdict — accept the common negative spellings, not just strict false.
  const meets = judgments && judgments.required ? judgments.required.candidate_meets_all : true
  const failsReqs = meets === false || meets === 'false' || meets === 'no' || meets === 0
  if (failsReqs) {
    const note = (judgments.required && judgments.required.note) || ''
    const yearsInField = /\b\d+\+?\s*(?:years?|yrs?)\b/i.test(note)
    const hardCredential = /licen|certif|clearance|\bRN\b|\bCPA\b|\bPE\b|\bCDL\b|series \d|\bDEA\b|bar admission|registered nurse/i.test(note)
    // A pure years shortfall never hard-clamps (transferable or not); only a HARD credential/license does.
    if (!(yearsInField && !hardCredential)) reasons.push({ kind: 'requirements', quote: note })
  }

  if (reasons.length === 0) return { score, band: band(score), clamped: false, clampReason: '' }
  const clampedScore = Math.min(score, BANDS.research - 0.1) // force below Research → Don't
  return { score: clampedScore, band: 'dont', clamped: true, clampReason: reasonLine(reasons) }
}

// A degree ask the JD itself waives (1.74.0). "Bachelor's degree in IT, Computer Science, Business
// Administration, or related field (or equivalent experience)" is not a hard requirement, but the model
// still listed it as unmet and answered candidate_meets_all=false ("lacks the specific major"), and
// clampVerdict took that to Don't — Medpace IT PM and Software PM, both 3.5, were clamped on it. When
// prescreen read the waiver (gates.degree.waived), code drops the degree-only lines from "unmet", and if
// nothing but those lines and years asks (which never clamp — the 1.41.x rule) was missing, the
// requirements verdict passes. A line that also names experience, a license or a certification ("Bachelor's
// degree and prior eClinical experience") is not degree-only and stays. Ratings are untouched: the
// education criterion still scores the major as the model judged it. Pure.
const DEGREE_WORDS = /degree|bachelor|master'?s|associate'?s|diploma|\bmajor\b|related field|field of study|\bB\.?[AS]\.?(?![a-z])|\bBSc\b|\bMBA\b/i
const NOT_DEGREE = /experience|\byears?\b|licen|certif|clearance|registered|\bRN\b|\bCPA\b|\bPE\b|\bCDL\b/i
export function isDegreeOnly(s) {
  const t = String(s || '').replace(/\(?\s*(?:or|and\/or)\s+(?:an?\s+)?equivalent[^;)]*\)?/gi, ' ').replace(/in lieu of[^;)]*/gi, ' ')
  return DEGREE_WORDS.test(t) && !NOT_DEGREE.test(t)
}
export function degreeWaiverCheck({ judgments, gates } = {}) {
  const none = { applied: false, judgments, note: '' }
  if (!(gates && gates.degree && gates.degree.waived) || !judgments || !judgments.required) return none
  const unmet = unmetRequirements(judgments)
  const kept = unmet.filter((u) => !isDegreeOnly(u))
  const dropped = unmet.length - kept.length
  const meets = judgments.required.candidate_meets_all
  const failsReqs = meets === false || meets === 'false' || meets === 'no' || meets === 0
  const onlyYearsLeft = kept.every((u) => isYearsOnly(u))
  // Pass the requirements verdict only when the degree was the whole complaint: degree lines dropped and
  // nothing but years asks left, or no list at all and a note that is about the degree alone.
  const pass = failsReqs && onlyYearsLeft && (dropped > 0 || (unmet.length === 0 && isDegreeOnly(judgments.required.note)))
  if (!dropped && !pass) return none
  const required = { ...judgments.required, unmet: kept, ...(pass ? { candidate_meets_all: true } : {}) }
  return { applied: true, judgments: { ...judgments, required }, note: 'the posting accepts equivalent experience in place of its degree ask' }
}

// Why a reply didn't parse (1.71.0) — a skip used to say only "didn't parse", hiding whether the reply
// was empty, cut off at the output cap, or produced after the guaranteed-JSON call itself failed and the
// eval silently fell back to free text. Pure. Returns { kind, detail }:
//   empty      — the backend returned no text
//   truncated  — stop reason says the output cap was hit (finish_reason=length / stop_reason=max_tokens)
//   no_grammar — the json_schema call failed (detail = its error) and the free-text retry wasn't JSON
//   not_json   — a complete reply that still isn't the expected JSON
export function unparsedCause({ text = '', stop = '', grammarError = '' } = {}) {
  const s = String(stop || '').toLowerCase()
  if (!String(text || '').trim()) return { kind: 'empty', detail: grammarError || s }
  if (s === 'length' || s === 'max_tokens') return { kind: 'truncated', detail: s }
  if (grammarError) return { kind: 'no_grammar', detail: grammarError }
  return { kind: 'not_json', detail: s }
}

// The requirements the model says the candidate misses (1.71.0): `required.unmet`, trimmed and
// de-duplicated. A reply without the list (an older prompt, a backend without the schema) counts as none —
// the cap below never guesses a count from prose. Pure.
export function unmetRequirements(judgments = {}) {
  const raw = judgments && judgments.required && judgments.required.unmet
  const out = []
  for (const v of Array.isArray(raw) ? raw : []) {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim()
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  return out
}

// The Research cap (1.71.0, Sam's call): an Apply verdict whose model names TWO OR MORE unmet hard
// requirements is held at Research, and the note leads with what's missing. One miss stays Apply — a
// single gap (a years count, one tool) is often worth applying through. Never touches a hard clamp (that
// already went to Don't) or a Research/Don't verdict. Pure. Returns { score, band, capped, unmet }.
export const RESEARCH_CAP_MIN_UNMET = 2
export function researchCap({ score, band: b, clamped, judgments }) {
  const unmet = unmetRequirements(judgments)
  if (clamped || b !== 'apply' || unmet.length < RESEARCH_CAP_MIN_UNMET) return { score, band: b, capped: false, unmet }
  const capped = Math.round((BANDS.apply - 0.1) * 10) / 10
  return { score: Math.min(score, capped), band: 'research', capped: true, unmet }
}
const unmetLine = (unmet) => `Research, not Apply — misses ${unmet.length} stated requirements: ${unmet.map((u) => `“${u.slice(0, 120)}”`).join('; ')}`

// Turn a model reply (text) into the final verdict: parse → score → metro penalty → clamp → merge pay.
// Pure (no I/O), so it's shared by the live single-eval path AND the Batches path (8a.7), and
// unit-tested directly. `location` (1.70.0) is the job's location line: a role placed outside the
// person's own metro loses a code-owned few tenths (regions.mjs metroPenalty) BEFORE the band is read,
// so the saved band follows the adjusted score and the verdict's note says why ("0.3 off for Columbus
// vs Cincinnati"). `rawScore` stays the model-only number; `metroPenalty` carries what came off.
export function buildVerdict({ text, jd, gates, decision, profile = {}, usage = null, model = '', backend = '', runtime = '', transferable, location = '', stop = '', grammarError = '', jobs = [], fieldJobs = null } = {}) {
  const parsed = parseEvalJson(text)
  if (!parsed) return { ok: false, raw: text, usage, model, backend, cause: unparsedCause({ text, stop, grammarError }) }
  const rawScore = scoreFromJudgments(parsed)
  // 1.73.0: years IN THE FIELD. `fieldJobs` is the field question's answer (pickFieldJobs): which of
  // the résumé's measured jobs did the kind of work the years ask names. Code sums them and holds the
  // experience rating to what the dates support (experience.mjs). null → the verdict is untouched.
  // 1.74.0: a degree ask the JD waives ("or equivalent experience") is not a missed requirement.
  const waiver = degreeWaiverCheck({ judgments: parsed, gates })
  const field = fieldYearsCheck({ judgments: waiver.judgments, jobs, gates, numbers: fieldJobs })
  const judgments = field.judgments
  const fieldScore = field.applied ? scoreFromJudgments(judgments) : rawScore
  const metro = metroPenalty({ location, profile })
  const adjusted = Math.max(0, Math.round((fieldScore - metro.points) * 10 + 1e-9) / 10)
  const clamp = clampVerdict({ score: adjusted, judgments, gates, decision, profile, transferable })
  const pay = extractPay(jd)
  const payBand = bandVsTarget(pay, Number(profile.target_salary) || 0)
  // 1.71.0: keep the whole note (up to 1,000 chars, whitespace flattened). The old 200-char cut ended
  // most notes mid-word, often right before the blocker ("The primary barrier"). List views truncate
  // at display time; detail views show it all.
  const modelNote = String(judgments.recommendation || '').replace(/\s+/g, ' ').trim().slice(0, 1000)
  const cap = researchCap({ score: clamp.score, band: clamp.band, clamped: clamp.clamped, judgments })
  const lead = [waiver.note, field.applied ? field.note : '', metro.note].filter(Boolean).join('; ')
  const base = lead ? `${lead}. ${modelNote}`.slice(0, 1000) : modelNote
  // A hard clamp's reason replaces the model's note (unchanged since 8a.5); the field-years figure rides
  // after it (1.73.0) — it's code-measured fact, and a clamped row is exactly where a reader asks "and
  // apart from that, do I have the years?".
  const fieldTail = field.applied ? `. ${field.note}` : ''
  const recommendation = clamp.clamped && clamp.clampReason ? `${clamp.clampReason}${fieldTail}`.slice(0, 1000) : cap.capped ? `${unmetLine(cap.unmet)}. ${base}`.slice(0, 1000) : base
  return {
    ok: true, score: cap.score, band: cap.band, recommendation, clamped: clamp.clamped, capped: cap.capped, unmet: cap.unmet, degreeWaived: waiver.applied, rawScore, metroPenalty: metro.points, metroNote: metro.note,
    fieldYears: field.applied ? { years: field.years, months: field.months, asked: field.asked, short: field.short, jobs: field.numbers } : null,
    judgments, pay: paySummary(pay, Number(profile.target_salary) || 0), payBand: payBand.band, usage, model, backend, runtime,
  }
}

// The fixed parts of one role's eval input — gates/decision/user prompt — without calling the model.
// Used by both the live and batch paths. Returns { gates, decision, user }. `location` (1.52.0) is the
// job's location line — without it the logistics criterion (10% of every score) was free points: the
// model was asked to rate location fit while being shown no location at all.
export function prepEval({ jd, cv = '', profile = {}, today = '', title = '', location = '' }) {
  const gates = extractGates(jd, title)
  const decision = screenDecision(gates, { ...profile, cv }) // cv → the hard credential/field gates
  const user = buildEvalUser({ jd, cv: normalizeResumeDates(cv, today), profile, gates, today, location })
  // 1.73.0: the résumé's jobs measured from their dates, and the field question to ask about them
  // (null when the JD states no years ask or the résumé has no dated jobs — then no call is made).
  const jobs = resumeJobs(cv, today)
  const fieldUser = buildFieldUser({ jd, gates, jobs })
  return { gates, decision, user, jobs, fieldUser }
}

// The field question (1.73.0): one short call, separate from the eval so the eval prompt stays exactly
// as benched. Returns { numbers, usage, error }: numbers = the job numbers that count (possibly []), or
// null when the question didn't apply or failed. A failure is RETURNED, never swallowed — evalRole puts
// it on the verdict (`fieldError`) and the verdict stays exactly as it would have been before 1.73.0.
export async function pickFieldJobs({ active, fieldUser, jobs = [], profile = {}, timeoutMs = 60000 }) {
  if (!fieldUser || !jobs.length) return { numbers: null, usage: null, error: '' }
  const rf = active && active.jsonEval && profile.eval_grammar !== false ? { type: 'json_schema', json_schema: FIELD_JSON_SCHEMA } : null
  try {
    const res = await callBackend(active, { system: FIELD_SYSTEM, user: fieldUser, maxTokens: 160, timeoutMs, responseFormat: rf, temperature: 0 })
    const numbers = parseFieldReply(res.text, jobs)
    return { numbers, usage: res.usage || null, error: numbers ? '' : `field question: reply was not the expected JSON (${String(res.text || '').slice(0, 80)})` }
  } catch (e) {
    return { numbers: null, usage: null, error: `field question: ${String((e && e.message) || e).slice(0, 200)}` }
  }
}

// 8a.9 escalation ladder: is a verdict close enough to a band edge that a stronger model is worth it?
// Clamped verdicts are deterministic gates — never escalate them. Scores within `margin` of the
// Research (3.5) or Apply (4.0) threshold are the genuinely-uncertain zone where re-scoring pays off.
export function isBorderline(verdict, margin = 0.3) {
  if (!verdict || !verdict.ok || verdict.clamped || verdict.score == null) return false
  return Math.min(Math.abs(verdict.score - BANDS.research), Math.abs(verdict.score - BANDS.apply)) <= margin
}

// Light AI pre-confirm (the Search-tab thinner): a FAST yes/maybe/no triage — not a score — that drops
// clearly-wrong roles before the expensive decomposed eval, cutting the number of full passes. Shared by
// the CLI (`eval --auto --confirm`) and the Phase 9 Search tab. Unknown → 'maybe' (never silently drop).
export const PRECONFIRM_SYSTEM =
  'You are Jobdar triaging whether a job is worth a FULL evaluation for this candidate — a fast judgment, ' +
  'not a score. Reply with ONLY JSON: {"verdict":"fit|maybe|skip","reason":"<=6 words>"}. ' +
  'fit = clearly plausible; maybe = unsure; skip = clearly wrong field/level/location.'

// In transferable mode the triage also passes genuine cross-field/adjacent fits — but stays strict.
export const TRANSFERABLE_PRECONFIRM_NOTE =
  ' In TRANSFERABLE-SKILLS mode, also pass roles where the candidate\'s foundational/adjacent skills ' +
  'genuinely transfer across field or title — but stay strict: "skip" aspirational stretches with no real bridge.'
export const preConfirmSystemFor = (transferable) => (transferable ? PRECONFIRM_SYSTEM + TRANSFERABLE_PRECONFIRM_NOTE : PRECONFIRM_SYSTEM)

export function parsePreConfirm(text) {
  const j = parseEvalJson(text) || {}
  const verdict = ['fit', 'maybe', 'skip'].includes(j.verdict) ? j.verdict : 'maybe'
  return { verdict, reason: String(j.reason || '').slice(0, 80) }
}

export async function preConfirm({ active, jd, cv = '', profile = {}, transferable, maxTokens = 80, timeoutMs = 60000 }) {
  const xfer = transferable === undefined ? Boolean(profile.transferable_skills) : transferable
  // The triage must know the DECLARED targets (1.59.0): without them it skipped entry-level roles as
  // "level too low" for an experienced candidate who had explicitly opted into entry-level targets.
  const lv = Array.isArray(profile.target_levels) && profile.target_levels.length ? profile.target_levels.join('/') : 'entry'
  const user =
    `Candidate targets ${lv}-level roles (their explicit choice — a role at a targeted level is NEVER "wrong level", even if they are overqualified).\n` +
    `Candidate (résumé excerpt):\n${stripPII(String(cv || '').slice(0, 1500), profile)}\n\nJob:\n${String(jd || '').slice(0, 2000)}`
  const { text, usage } = await callBackend(active, { system: preConfirmSystemFor(xfer), user, maxTokens, timeoutMs, temperature: 0 })
  return { ...parsePreConfirm(text), usage }
}

// Evaluate ONE role end-to-end against the active backend. Returns the verdict + the merged pay band.
// maxTokens 1024 (1.54.1): the v2 prompt's per-criterion definitions elicit slightly longer evidence
// text, and a 700 cap truncated one real long-JD eval mid-JSON (finish_reason=length → parse fail,
// deterministic under greedy). 1024 matches the native app's setting; content is unchanged, only uncut.
export async function evalRole({ active, jd, cv = '', profile = {}, today = '', location = '', maxTokens = 1024, timeoutMs = 120000, responseFormat, transferable }) {
  const xfer = transferable === undefined ? Boolean(profile.transferable_skills) : transferable
  // Guaranteed-JSON evals (response_format=json_schema) by default on local backends that support it
  // (winc/ollama/llamafile), unless the caller forces a value or the profile opts out (eval_grammar:false).
  // Eliminates parse failures and — paired with winc's greedy eval profile — is the low-end accuracy win
  // (qwen3.5-2b: 100% / 0 parse-fails). The Anthropic api (jsonEval:false) stays on Messages.
  const rf = responseFormat !== undefined
    ? responseFormat
    : active && active.jsonEval && profile.eval_grammar !== false
      ? { type: 'json_schema', json_schema: EVAL_JSON_SCHEMA }
      : null
  const { gates, decision, user, jobs, fieldUser } = prepEval({ jd, cv, profile, today, location })
  // temperature 0 pinned IN CODE (1.52.0): the eval-tuning spec says temp 0, and winc's --eval profile
  // serves greedy — but ollama/llamafile/api don't, so an unpinned eval was only reproducible on winc.
  let res
  let grammarError = ''
  try {
    res = await callBackend(active, { system: evalSystemFor(xfer), user, maxTokens, timeoutMs, responseFormat: rf, cache: true, temperature: 0 })
  } catch (e) {
    if (!rf) throw e
    // Degrade to /v1/messages on a JSON-path error — but keep the error (1.71.0): it used to vanish, so a
    // context overflow on the grammar call surfaced only as "didn't parse" on the free-text retry.
    grammarError = String((e && e.message) || e).slice(0, 300)
    res = await callBackend(active, { system: evalSystemFor(xfer), user, maxTokens, timeoutMs, responseFormat: null, cache: true, temperature: 0 })
  }
  const field = await pickFieldJobs({ active, fieldUser, jobs, profile, timeoutMs })
  const v = buildVerdict({ text: res.text, jd, gates, decision, profile, usage: res.usage, model: res.model, backend: active.kind, runtime: active.runtime, transferable: xfer, location, stop: res.stop, grammarError, jobs, fieldJobs: field.numbers })
  const extra = { ...(grammarError ? { grammarError } : {}), ...(field.error ? { fieldError: field.error } : {}), ...(field.usage ? { fieldUsage: field.usage } : {}) }
  return v.ok && Object.keys(extra).length ? { ...v, ...extra } : v
}
