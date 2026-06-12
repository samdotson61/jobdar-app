// Jobdar — prescreen (the apply-likelihood gate). Zero-token and deterministic: after scan discovers
// a role and BEFORE the model spends an eval on it, prescreen reads the JD for hard gates the
// evaluation can't argue with (years required, an active clearance, a degree the user excluded) and
// ranks what's left by skill overlap + freshness. Career-ops rule carried over from the level filter
// (4.5): NEVER hide silently — every screened role keeps a quoted reason and `eval --include-screened`
// brings it back. The model still does all fit *judgment*; prescreen only removes roles whose gate
// makes the judgment moot.

import { matchedKeywords } from './cv_render.mjs'

// Max years a JD may require before it reads as ABOVE the user's highest selected level. Coarse on
// purpose (the rubric judges nuance); the gate only fires on an explicit "N+ years experience" ask.
export const YEARS_CEILING = { entry: 2, mid: 5, senior: 10 }

const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 90)

// --- Gate extraction (pure text → facts, each with the quote that proves it) ---

// "5+ years of experience", "3-5 years' professional experience", "two (2) years exp" → the LOWEST
// number stated is the floor the candidate must clear. "10 years of innovation" never matches: the
// phrase must end in experience/exp.
export function extractYearsRequired(jd) {
  const text = String(jd || '')
  const re = /(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s*\+?\s*(?:years?|yrs?)[’']?s?\s+(?:of\s+)?(?:relevant\s+|related\s+|professional\s+|hands[- ]on\s+|work(?:ing)?\s+|prior\s+|industry\s+)*(?:experience|exp\b)/gi
  let min = null
  let quote = ''
  for (const m of text.matchAll(re)) {
    const n = Number(m[1])
    if (!Number.isFinite(n)) continue
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

// Sponsorship: "no visa sponsorship" never screens (Jobdar can't know the user's status) — it flags.
export function extractSponsorship(jd) {
  const m = String(jd || '').match(/(?:[^.\n]{0,40})(no (?:visa )?sponsorship|unable to sponsor|cannot sponsor|will not (?:now or in the future )?sponsor)(?:[^.\n]{0,40})/i)
  return m ? { flagged: true, quote: clip(m[0]) } : { flagged: false, quote: '' }
}

// License/cert asks (RN, CDL, PE, CPA, journeyman…) flag — too employer-specific to auto-screen.
export function extractLicense(jd) {
  const m = String(jd || '').match(/(?:[^.\n]{0,40})\b(rn license|registered nurse|cdl(?:\s+class\s+[ab])?|p\.?e\.? license|cpa|series \d{1,2}|journeyman)\b(?:[^.\n]{0,40})/i)
  return m ? { flagged: true, quote: clip(m[0]) } : { flagged: false, quote: '' }
}

export function extractGates(jd) {
  return {
    years: extractYearsRequired(jd),
    degree: extractDegreeGate(jd),
    clearance: extractClearance(jd),
    sponsorship: extractSponsorship(jd),
    license: extractLicense(jd),
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
  if (gates.sponsorship.flagged) flags.push({ kind: 'sponsorship', quote: gates.sponsorship.quote })
  if (gates.license.flagged) flags.push({ kind: 'license', quote: gates.license.quote })

  return { screened: reasons.length > 0, reasons, flags }
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

// --- The whole gate for one role: JD text in, verdict out. Pure; the command does the fetching. ---

export function prescreenRole({ jdText, cvText, posted, firstSeen, today, profile }) {
  const gates = extractGates(jdText)
  const decision = screenDecision(gates, profile)
  const score = decision.screened
    ? 0
    : prescreenScore({ jdText, cvText, posted, firstSeen, flags: decision.flags, today })
  return { gates, ...decision, score, jdAvailable: Boolean(String(jdText || '').trim()) }
}
