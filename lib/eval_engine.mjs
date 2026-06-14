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
import { band, BANDS } from './evaluations.mjs'
import { callBackend } from './inference.mjs'

// Weighted sub-criteria (rec-spec §3): skills 35 / experience 25 / level-fit 20 / logistics 10 / education 10.
export const SUBCRITERIA = [
  { key: 'skills', weight: 0.35 },
  { key: 'experience', weight: 0.25 },
  { key: 'level_fit', weight: 0.2 },
  { key: 'logistics', weight: 0.1 },
  { key: 'education', weight: 0.1 },
]
const RATING = { strong: 1, partial: 0.5, none: 0 }

// 8a.4a: the JSON schema for guaranteed-JSON backends (winc-jobdar.4 / OpenAI-compat response_format).
// Default path is prompt + parseEvalJson, which works on every backend incl. winc.cpp jobdar.3.
const SUB = { type: 'object', properties: { rating: { type: 'string', enum: ['strong', 'partial', 'none'] }, evidence: { type: 'string' } }, required: ['rating'] }
export const EVAL_JSON_SCHEMA = {
  name: 'jobdar_eval',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['required', 'skills', 'experience', 'level_fit', 'logistics', 'education', 'recommendation'],
    properties: {
      required: { type: 'object', properties: { candidate_meets_all: { type: 'boolean' }, note: { type: 'string' } }, required: ['candidate_meets_all'] },
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
  return Math.round((sum / total) * 5 * 10) / 10 // 0.0–5.0, one decimal
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
export const EVAL_SYSTEM =
  'You are Jobdar, scoring how well ONE job fits a candidate (new grad / early-career job seeker). Judge ' +
  'ONLY fit against the résumé — do NOT consider salary. For each criterion, reason briefly then rate it ' +
  '"strong" (clearly meets), "partial" (partial/transferable), or "none" (absent), with a short quoted JD ' +
  'line as evidence. Use the VERIFIED REQUIREMENTS provided to set candidate_meets_all (true only if the ' +
  'candidate clears every HARD requirement). Reply with ONLY this JSON object — no prose, no code fence:\n' +
  '{"required":{"candidate_meets_all":true,"note":""},"skills":{"rating":"strong","evidence":""},' +
  '"experience":{"rating":"partial","evidence":""},"level_fit":{"rating":"strong","evidence":""},' +
  '"logistics":{"rating":"strong","evidence":""},"education":{"rating":"partial","evidence":""},' +
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
  'targeted fits only — quality over quantity.'
export const evalSystemFor = (transferable) => (transferable ? EVAL_SYSTEM + TRANSFERABLE_EVAL_NOTE : EVAL_SYSTEM)

// Build the user message: today's date + prescreen's verified gate facts + the PII-stripped, date-
// normalized CV + the JD. Pure (so it's testable).
export function buildEvalUser({ jd, cv, profile = {}, gates, today = '' }) {
  const lv = Array.isArray(profile.target_levels) && profile.target_levels.length ? profile.target_levels.join('/') : 'entry'
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
    `Candidate target level(s): ${lv}. Profile: ${profile.tuning_profile || 'new_grad'}.\n\n` +
    `CANDIDATE RÉSUMÉ:\n${stripPII(String(cv || '(none provided)'), profile).slice(0, 6000)}\n\n` +
    `JOB DESCRIPTION:\n${String(jd || '').slice(0, 6000)}`
  )
}

// Apply the deterministic clamp (rec-spec §3): a hard gate or an unmet requirement forces the verdict
// below the Research band into Don't, carrying the quoted reason. Fairness (8a.6): under no_degree a
// degree requirement NEVER drives the clamp (it only flags). Transferable-skills parity (1.24.1): when
// the toggle is on, a "X+ years in [field]" shortfall NEVER drives the clamp either — adjacent
// experience is allowed to bridge it, and the model already rates the bridge's strength (experience
// ≤ "partial"), so the raw score + band thresholds decide. Genuine hard credentials (license / cert /
// clearance) still clamp even when the note happens to mention a year count. Pure.
export function clampVerdict({ score, judgments, gates, decision, profile = {}, transferable } = {}) {
  const xfer = transferable === undefined ? Boolean(profile.transferable_skills) : transferable
  const reasons = []
  // Hard gates prescreen already knows about (years over ceiling, active clearance, excluded degree).
  if (decision && decision.screened) {
    for (const r of decision.reasons || []) {
      if (r.kind === 'degree' && profile.tuning_profile === 'no_degree') continue // never auto-zero on degree
      reasons.push(r)
    }
  }
  // The model's requirements verdict — accept the common negative spellings, not just strict false.
  const meets = judgments && judgments.required ? judgments.required.candidate_meets_all : true
  const failsReqs = meets === false || meets === 'false' || meets === 'no' || meets === 0
  if (failsReqs) {
    const note = (judgments.required && judgments.required.note) || ''
    const yearsInField = /\b\d+\+?\s*(?:years?|yrs?)\b/i.test(note)
    const hardCredential = /licen|certif|clearance|\bRN\b|\bCPA\b|\bPE\b|bar admission|registered nurse/i.test(note)
    if (!(xfer && yearsInField && !hardCredential)) reasons.push({ kind: 'requirements', quote: note })
  }

  if (reasons.length === 0) return { score, band: band(score), clamped: false, clampReason: '' }
  const clampedScore = Math.min(score, BANDS.research - 0.1) // force below Research → Don't
  return { score: clampedScore, band: 'dont', clamped: true, clampReason: reasonLine(reasons) }
}

// Turn a model reply (text) into the final verdict: parse → score → clamp → merge pay. Pure (no I/O),
// so it's shared by the live single-eval path AND the Batches path (8a.7), and unit-tested directly.
export function buildVerdict({ text, jd, gates, decision, profile = {}, usage = null, model = '', backend = '', runtime = '', transferable } = {}) {
  const judgments = parseEvalJson(text)
  if (!judgments) return { ok: false, raw: text, usage, model, backend }
  const rawScore = scoreFromJudgments(judgments)
  const clamp = clampVerdict({ score: rawScore, judgments, gates, decision, profile, transferable })
  const pay = extractPay(jd)
  const payBand = bandVsTarget(pay, Number(profile.target_salary) || 0)
  const recommendation = clamp.clamped && clamp.clampReason ? clamp.clampReason : String(judgments.recommendation || '').slice(0, 200)
  return {
    ok: true, score: clamp.score, band: clamp.band, recommendation, clamped: clamp.clamped, rawScore,
    judgments, pay: paySummary(pay, Number(profile.target_salary) || 0), payBand: payBand.band, usage, model, backend, runtime,
  }
}

// The fixed parts of one role's eval input — gates/decision/user prompt — without calling the model.
// Used by both the live and batch paths. Returns { gates, decision, user }.
export function prepEval({ jd, cv = '', profile = {}, today = '' }) {
  const gates = extractGates(jd)
  const decision = screenDecision(gates, profile)
  const user = buildEvalUser({ jd, cv: normalizeResumeDates(cv, today), profile, gates, today })
  return { gates, decision, user }
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
  const user = `Candidate (résumé excerpt):\n${stripPII(String(cv || '').slice(0, 1500), profile)}\n\nJob:\n${String(jd || '').slice(0, 2000)}`
  const { text, usage } = await callBackend(active, { system: preConfirmSystemFor(xfer), user, maxTokens, timeoutMs })
  return { ...parsePreConfirm(text), usage }
}

// Evaluate ONE role end-to-end against the active backend. Returns the verdict + the merged pay band.
export async function evalRole({ active, jd, cv = '', profile = {}, today = '', maxTokens = 700, timeoutMs = 120000, responseFormat = null, transferable }) {
  const xfer = transferable === undefined ? Boolean(profile.transferable_skills) : transferable
  const { gates, decision, user } = prepEval({ jd, cv, profile, today })
  const { text, usage, model } = await callBackend(active, { system: evalSystemFor(xfer), user, maxTokens, timeoutMs, responseFormat, cache: true })
  return buildVerdict({ text, jd, gates, decision, profile, usage, model, backend: active.kind, runtime: active.runtime, transferable: xfer })
}
