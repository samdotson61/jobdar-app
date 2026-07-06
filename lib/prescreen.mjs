// Jobdar — prescreen (the apply-likelihood gate). Zero-token and deterministic: after scan discovers
// a role and BEFORE the model spends an eval on it, prescreen reads the JD for hard gates the
// evaluation can't argue with (years required, an active clearance, a degree the user excluded) and
// ranks what's left by skill overlap + freshness. Career-ops rule carried over from the level filter
// (4.5): NEVER hide silently — every screened role keeps a quoted reason and `eval --include-screened`
// brings it back. The model still does all fit *judgment*; prescreen only removes roles whose gate
// makes the judgment moot.

import { matchedKeywords } from './cv_render.mjs'
import { extractPay, bandVsTarget } from './salary.mjs'

// Max years a JD may require before it reads as ABOVE the user's highest selected level. Coarse on
// purpose (the rubric judges nuance); the gate only fires on an explicit "N+ years experience" ask.
export const YEARS_CEILING = { entry: 2, mid: 5, senior: 10 }

const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 90)

// --- Gate extraction (pure text → facts, each with the quote that proves it) ---

// "5+ years of experience", "3-5 years' professional experience", "two (2) years exp" → the LOWEST
// number stated is the floor the candidate must clear. "10 years of innovation" never matches: the
// phrase must end in experience/exp.
// A years ask in a SOFT context ("5 years preferred", "ideally 7 years", "bonus: 6 years") is NOT a hard
// floor — it must never screen a role out (mirrors extractCredential's SOFT_CTX skip). Only a bare or
// required ask counts.
const YEARS_SOFT = /preferred|a plus|nice[- ]to[- ]have|bonus|ideally|desirable|desired|would be (?:a )?(?:plus|nice)|not required/i
export function extractYearsRequired(jd) {
  const text = String(jd || '')
  const re = /(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)[’']?s?\s+(?:of\s+)?(?:relevant\s+|related\s+|professional\s+|hands[- ]on\s+|work(?:ing)?\s+|prior\s+|industry\s+)*(?:experience|exp\b)/gi
  let min = null
  let quote = ''
  for (const m of text.matchAll(re)) {
    const n = Number(m[1])
    if (!Number.isFinite(n)) continue
    const around = text.slice(Math.max(0, m.index - 45), m.index + m[0].length + 45)
    if (YEARS_SOFT.test(around)) continue // "preferred"/"a plus"/"ideally" → not a hard floor
    if (min === null || n < min) {
      min = n
      quote = clip(m[0])
    }
  }
  return min === null ? null : { years: min, quote }
}

// Degree gate → 'yes' | 'no' | 'unclear' (the 4.6 shape). "or equivalent experience" downgrades a
// hard ask to 'unclear' — the no-degree path treats those as live targets.
export function extractDegreeGate(jd) {
  const text = String(jd || '')
  const degree = /(bachelor[’']?s?\s*(?:degree)?|\bb\.?s\.?\b|\bb\.?a\.?\b|four[- ]year degree|college degree|university degree)/i
  const m = text.match(degree)
  if (!m) return { gate: 'no', quote: '' }
  const start = Math.max(0, m.index - 60)
  const around = text.slice(start, m.index + m[0].length + 90)
  if (/or equivalent|equivalent (?:practical )?experience|in lieu of/i.test(around)) return { gate: 'unclear', quote: clip(around) }
  if (/required|must (?:have|hold|possess)|minimum/i.test(around)) return { gate: 'yes', quote: clip(around) }
  return { gate: 'unclear', quote: clip(around) }
}

// Clearance: an ACTIVE/current clearance (or TS/SCI) is a hard gate; "ability to obtain" is only a flag.
export function extractClearance(jd) {
  const text = String(jd || '')
  const m = text.match(/(?:[^.\n]{0,60})(security clearance|ts\/sci|top secret|secret clearance|public trust)(?:[^.\n]{0,60})/i)
  if (!m) return { gate: 'none', quote: '' }
  const around = m[0]
  if (/ts\/sci|active|current|must (?:hold|have|possess)/i.test(around)) return { gate: 'hard', quote: clip(around) }
  return { gate: 'soft', quote: clip(around) }
}

// Sponsorship — three stances, negative checked FIRST (a restriction wins over marketing copy):
//   'no'       explicit refusal ("no visa sponsorship", "without sponsorship now or in the future",
//              "must be a US citizen") — a hard blocker for a candidate who needs sponsorship
//   'sponsors' explicit offer ("visa sponsorship available", "we sponsor H-1B")
//   'unknown'  the JD is silent — MOST JDs; never screened, never claimed either way (honesty)
// By default a 'no' only FLAGS (Jobdar can't know the user's status); the needs_sponsorship profile
// toggle is the user telling us — then a 'no' is a real gate, quoted like every other screen reason.
const SPONSOR_NO = /(?:[^.\n]{0,60})(no (?:visa |work |immigration )?sponsorship|unable to sponsor|cannot sponsor|will not (?:now or in the future )?(?:be able to )?sponsor|not (?:offer|provide|eligible for) (?:visa )?sponsorship|sponsorship (?:is )?not (?:available|offered|provided)|without (?:the need for |requiring )?(?:visa |employer )?sponsorship|must be (?:a )?u\.?s\.? citizen|u\.?s\.? citizenship (?:is )?required)(?:[^.\n]{0,60})/i
const SPONSOR_YES = /(?:[^.\n]{0,60})((?:visa|h-?1b|immigration|work authorization) sponsorship (?:is )?(?:available|offered|provided|possible)|(?:will|can|do(?:es)?) (?:offer|provide) (?:visa |h-?1b )?sponsorship|(?:willing|able) to sponsor|we sponsor)(?:[^.\n]{0,60})/i
export function extractSponsorship(jd) {
  const text = String(jd || '')
  const no = text.match(SPONSOR_NO)
  if (no) return { stance: 'no', flagged: true, quote: clip(no[0]) }
  const yes = text.match(SPONSOR_YES)
  if (yes) return { stance: 'sponsors', flagged: false, quote: clip(yes[0]) }
  return { stance: 'unknown', flagged: false, quote: '' }
}

// License/cert asks (RN, CDL, PE, CPA, journeyman…) flag — too employer-specific to auto-screen.
export function extractLicense(jd) {
  const m = String(jd || '').match(/(?:[^.\n]{0,40})\b(rn license|registered nurse|cdl(?:\s+class\s+[ab])?|p\.?e\.? license|cpa|series \d{1,2}|journeyman)\b(?:[^.\n]{0,40})/i)
  return m ? { flagged: true, quote: clip(m[0]) } : { flagged: false, quote: '' }
}

// --- HARD entry-requirement gates: named professional credentials + hard-identity occupations. ---
// "Hard and fast": code-owned, deterministic, and NEVER bridged by the transferable_skills toggle (you
// cannot transfer your way into a CPA / RN / bar admission). Conservative on purpose so a genuine
// adjacent fit is never gated — see the two firing conditions below.

// Named credentials: the JD token, plus the résumé token that proves the candidate holds it.
const HARD_CREDENTIALS = [
  { id: 'CPA', jd: /\bcpa\b|certified public accountant/i, cv: /\bcpa\b|certified public accountant/i },
  { id: 'RN', jd: /\brn\b|registered nurse|nursing license/i, cv: /\brn\b|registered nurse|\bbsn\b/i },
  { id: 'PE', jd: /\bp\.?e\.?\b\s*licen|professional engineer/i, cv: /\bp\.?e\.?\b|professional engineer/i },
  { id: 'bar', jd: /bar admission|admitted to the (?:state )?bar|licensed attorney|member of the bar/i, cv: /bar (?:admission|number)|admitted to the bar|\bj\.?d\.?\b|\battorney\b/i },
  { id: 'CDL', jd: /\bcdl\b|commercial driver'?s license/i, cv: /\bcdl\b/i },
  { id: 'series', jd: /\bseries (?:7|63|65|66|24)\b/i, cv: /\bseries (?:7|63|65|66|24)\b/i },
  { id: 'DEA', jd: /\bdea (?:registration|license|number)\b/i, cv: /\bdea\b/i },
  { id: 'medical-license', jd: /medical license|board[- ]certified|board certification/i, cv: /\b(?:md|do)\b|medical license|board[- ]certified/i },
]
// A credential is REQUIRED only inside a required-context window — "preferred"/"a plus"/"ability to
// obtain" never gates (they only flag, like extractLicense).
const REQ_CTX = /required|must (?:have|hold|possess|be)|active|current|valid|need(?:s)? to (?:have|hold)/i
const SOFT_CTX = /preferred|a plus|nice[- ]to[- ]have|bonus|ability to obtain|willing(?:ness)? to (?:obtain|pursue)|or equivalent/i

export function extractCredential(jd) {
  const text = String(jd || '')
  for (const c of HARD_CREDENTIALS) {
    // Scan EVERY mention, not just the first: "CPA preferred … active CPA license required" must still gate
    // on the later required ask (the first-match-only check let a leading "preferred" mask it). Windows
    // overlap, so decide per-occurrence by PROXIMITY: gate when a required cue sits closer to this mention
    // than any soft cue (a distant earlier "preferred" no longer masks a nearby "required").
    const g = new RegExp(c.jd.source, c.jd.flags.includes('g') ? c.jd.flags : c.jd.flags + 'g')
    for (const m of text.matchAll(g)) {
      const start = Math.max(0, m.index - 70)
      const around = text.slice(start, m.index + m[0].length + 70)
      const credPos = m.index - start
      const reqM = around.match(REQ_CTX)
      if (!reqM) continue // no required context near this mention
      const softM = around.match(SOFT_CTX)
      const reqDist = Math.abs(reqM.index - credPos)
      const softDist = softM ? Math.abs(softM.index - credPos) : Infinity
      if (reqDist <= softDist) return { gate: 'required', credential: c.id, quote: clip(around) }
    }
  }
  return { gate: 'none', credential: '', quote: '' }
}
export function cvHasCredential(cv, credentialId) {
  const c = HARD_CREDENTIALS.find((x) => x.id === credentialId)
  return c ? c.cv.test(String(cv || '')) : false
}

// Hard-identity occupations — the TITLE is the field. Closed list (accounting/finance, nursing, legal):
// software/data/marketing/sales/ops are deliberately EXCLUDED so transferable fits are never field-gated.
const FIELD_TITLE = [
  { field: 'accounting', re: /\b(accountant|accounting|auditor|financial controller|comptroller|bookkeeper|tax (?:associate|accountant|preparer|manager|analyst)|accounts (?:payable|receivable) (?:specialist|clerk|manager|associate))\b/i },
  { field: 'nursing', re: /\b(registered nurse|\brn\b|nurse practitioner|\blpn\b|clinical nurse|staff nurse|charge nurse)\b/i },
  { field: 'legal', re: /\b(attorney|lawyer|paralegal|legal counsel|associate counsel|general counsel|litigation associate)\b/i },
]
// Genuine field signal in a résumé — require >=2 distinct hits so one stray keyword can't fake membership.
const FIELD_SIGNALS = {
  accounting: [/accounting/i, /accountant/i, /bookkeep/i, /reconcil(?:e|iation|ing)/i, /accounts payable/i, /accounts receivable/i, /\bledger\b/i, /\bgaap\b/i, /\baudit/i, /month[- ]end (?:close|closing)/i, /quickbooks/i, /\bcpa\b/i, /b\.?b\.?a\.?\s*(?:in\s*)?account/i, /financial statements/i, /budget(?:ing| tracker)/i, /\bpayroll\b/i],
  nursing: [/\bnurse\b/i, /nursing/i, /\brn\b/i, /\bbsn\b/i, /patient care/i, /\bclinical\b/i, /charting/i, /med[- ]surg/i, /vital signs/i, /triage/i],
  legal: [/attorney/i, /paralegal/i, /\blaw\b/i, /\bj\.?d\.?\b/i, /\bbar\b/i, /litigation/i, /contract review/i, /legal research/i, /depositions?/i],
}
const HARD_IDENTITY = new Set(['accounting', 'nursing', 'legal'])
export const isHardIdentity = (field) => HARD_IDENTITY.has(field)

// Detect a hard-identity field from the role TITLE (the strong signal). Ambiguous/no title → null (no gate).
export function extractField(title, jd = '') {
  const t = String(title || '')
  if (t.trim()) for (const f of FIELD_TITLE) if (f.re.test(t)) return { field: f.field, quote: clip(t) }
  return null
}
export function cvHasField(cv, field) {
  const sigs = FIELD_SIGNALS[field]
  if (!sigs) return true // unknown field → never gate
  const text = String(cv || '')
  let hits = 0
  for (const re of sigs) if (re.test(text) && ++hits >= 2) return true
  return false
}

export function extractGates(jd, title = '') {
  return {
    years: extractYearsRequired(jd),
    degree: extractDegreeGate(jd),
    clearance: extractClearance(jd),
    sponsorship: extractSponsorship(jd),
    license: extractLicense(jd),
    credential: extractCredential(jd),
    field: extractField(title, jd),
  }
}

// --- Screen decision (gates × profile → screened/flags, reasons always quoted) ---

export function screenDecision(gates, profile = {}) {
  const levels = Array.isArray(profile.target_levels) && profile.target_levels.length ? profile.target_levels : ['entry']
  const ceiling = Math.max(...levels.map((l) => YEARS_CEILING[l] ?? YEARS_CEILING.entry))
  const reasons = []
  const flags = []

  if (gates.years && gates.years.years > ceiling) {
    reasons.push({ kind: 'years', detail: `${gates.years.years}>${ceiling}`, quote: gates.years.quote })
  }
  if (gates.clearance.gate === 'hard') {
    reasons.push({ kind: 'clearance', detail: 'active-clearance', quote: gates.clearance.quote })
  } else if (gates.clearance.gate === 'soft') {
    flags.push({ kind: 'clearance', quote: gates.clearance.quote })
  }
  if (gates.degree.gate === 'yes') {
    if (profile.include_degree_required_roles === false) {
      reasons.push({ kind: 'degree', detail: 'excluded-by-profile', quote: gates.degree.quote })
    } else if (profile.tuning_profile === 'no_degree') {
      // Core 4.5 rule: under no_degree a degree ask NEVER auto-screens — it flags a stretch.
      flags.push({ kind: 'degree_stretch', quote: gates.degree.quote })
    }
  }
  if (gates.sponsorship.stance === 'no') {
    if (profile.needs_sponsorship) {
      // The user told us they need sponsorship — an explicit "no sponsorship" JD is a job they can't
      // get, screened with the line quoted (same honesty contract as years/clearance/credential).
      reasons.push({ kind: 'sponsorship', detail: 'no-sponsorship', quote: gates.sponsorship.quote })
    } else {
      flags.push({ kind: 'sponsorship', quote: gates.sponsorship.quote })
    }
  }
  if (gates.license.flagged) flags.push({ kind: 'license', quote: gates.license.quote })

  // HARD entry-requirement gates checked against the candidate's résumé (profile.cv). Code-owned, never
  // bridged by transferable_skills. Fire only when the cv is available (can't assess otherwise → no gate).
  const cv = profile.cv || profile.cvText || ''
  if (cv) {
    if (gates.credential && gates.credential.gate === 'required' && !cvHasCredential(cv, gates.credential.credential)) {
      reasons.push({ kind: 'credential', detail: gates.credential.credential, quote: gates.credential.quote })
    }
    if (gates.field && isHardIdentity(gates.field.field) && !cvHasField(cv, gates.field.field)) {
      reasons.push({ kind: 'field', detail: gates.field.field, quote: gates.field.quote })
    }
  }

  // Positive channel: an explicit "we sponsor" is a fit INDICATOR (shown on the role card), never a
  // score input through `flags` (flags subtract headroom; an offer shouldn't cost points).
  return { screened: reasons.length > 0, reasons, flags, sponsors: gates.sponsorship.stance === 'sponsors' }
}

// One-line, human-readable screen reason for the pipeline row (shown verbatim in prescreen output,
// the TUI, and `eval` — the honesty contract: the user always sees WHY).
export function reasonLine(reasons, t = null) {
  return (reasons || [])
    .map((r) => {
      const label = t ? t(`prescreen.reason_${r.kind}`) : r.kind
      return r.quote ? `${label}: “${r.quote}”` : label
    })
    .join(' | ')
}

// --- Score (0–100): skill overlap (0–60) + freshness (0–25) + headroom less soft flags (0–15) ---

const dayMs = 24 * 60 * 60 * 1000

export function freshnessPoints(posted, firstSeen, today) {
  const ref = posted || firstSeen
  if (!ref) return 12 // unknown age → neutral
  const days = Math.floor((new Date(today) - new Date(ref)) / dayMs)
  if (!Number.isFinite(days) || days < 0) return 12
  if (days <= 7) return 25
  if (days <= 14) return 18
  if (days <= 30) return 10
  return 4
}

export function skillPoints(jdText, cvText) {
  const jd = String(jdText || '')
  if (!jd.trim() || !String(cvText || '').trim()) return 30 // JD or CV unavailable → neutral half
  // Same extraction for both sides: matchedKeywords(jd, jd) is the JD's unique non-stop vocabulary,
  // so numerator and denominator filter identically.
  const vocab = matchedKeywords(jd, jd)
  if (vocab.length === 0) return 30
  const matched = matchedKeywords(jd, cvText)
  const ratio = matched.length / vocab.length
  return Math.round(60 * Math.min(1, ratio / 0.4)) // 40% overlap = full marks
}

export function prescreenScore({ jdText, cvText, posted, firstSeen, flags = [], today }) {
  const skills = skillPoints(jdText, cvText)
  const fresh = freshnessPoints(posted, firstSeen, today)
  const headroom = Math.max(0, 15 - 5 * (flags || []).length)
  return Math.min(100, skills + fresh + headroom)
}

// Blend the salary sub-score (0..1) into the 0–100 prescreen score, weighted by score_weights.salary.
// NEVER a gate: a role with no target, no extractable pay, or a screened hard-gate is returned
// unchanged — pay can nudge rank a few points but can't screen a role out (4.5 honesty).
export function blendSalary(baseScore, salaryScore, weight) {
  const w = Math.max(0, Math.min(1, Number(weight) || 0))
  if (salaryScore == null || w === 0) return baseScore
  // Floor at 1: pay nudges rank but must NEVER drop a non-screened role to 0 (0 means "screened").
  // Without this, a high score_weights.salary + a below-target role (salaryScore 0) could zero it.
  return Math.max(1, Math.round(baseScore * (1 - w) + salaryScore * 100 * w))
}

// --- The whole gate for one role: JD text in, verdict out. Pure; the command does the fetching. ---

export function prescreenRole({ jdText, cvText, title = '', posted, firstSeen, today, profile = {} }) {
  const gates = extractGates(jdText, title)
  const decision = screenDecision(gates, { ...profile, cv: cvText })
  // Deterministic STATED pay (7.8.1): annotates every role; nudges rank but never screens it out.
  const target = Number(profile.target_salary) || 0
  const pay = extractPay(jdText)
  const payBand = bandVsTarget(pay, target)
  const base = decision.screened ? 0 : prescreenScore({ jdText, cvText, posted, firstSeen, flags: decision.flags, today })
  const score = decision.screened ? 0 : blendSalary(base, payBand.score, profile.score_weights && profile.score_weights.salary)
  return { gates, ...decision, pay, payBand, score, jdAvailable: Boolean(String(jdText || '').trim()) }
}
