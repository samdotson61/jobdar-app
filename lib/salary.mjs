// Jobfaro — deterministic salary extraction + lenient target banding (Phase 7.8.1; rec-spec §1).
// Zero-token and pure: extractPay() reads the STATED pay out of a JD; bandVsTarget() scores it
// against the user's target_salary. The model NEVER produces a pay number — this is the deterministic
// STATED layer beneath the 8d pay resolver. NOT a gate: pay never screens a role out (4.5 honesty);
// it only nudges the prescreen rank via score_weights.salary.
//
// Mirrors lib/prescreen.mjs conventions: a clip() quote helper, matchAll-pick-the-right-match, and
// null-on-absent return shapes. Assumes JD text already ran through lib/html.mjs (entities decoded);
// decodeNamed() below is a cheap safety net for pasted/raw text.

const clip = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 90)

const HOURS_PER_YEAR = 2080
// Sanity bounds (rule guards). Annual band per spec; hourly bound spans minimum-wage..exec.
const ANNUAL_MIN = 20000
const ANNUAL_MAX = 600000
const HOURLY_MIN = 7.25
const HOURLY_MAX = 200

// --- Leniency knobs (config-tunable defaults; halved 2026-06-13 for a tighter salary match) -------
// A role whose top pay is within SALARY_TOLERANCE under target is a "near" match and still scores
// high; the sub-score ramps linearly to 0 at SALARY_FLOOR under target instead of cliffing to 0 the
// moment pay is a dollar short. At an $80k target: near down to $76k, zero at $68k.
export const SALARY_TOLERANCE = 0.05
export const SALARY_FLOOR = 0.15

// Safety net: decode the dash/quote entities lib/html.mjs handles, in case extractPay is handed raw
// or pasted text. Idempotent — already-decoded text passes through untouched.
const NAMED = { '&mdash;': '—', '&ndash;': '–', '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"', '&hellip;': '…', '&bull;': '•' }
const decodeNamed = (s) => String(s || '').replace(/&(mdash|ndash|rsquo|lsquo|ldquo|rdquo|hellip|bull);/g, (m) => NAMED[m] || ' ')

// --- money parsing -----------------------------------------------------------
const toNum = (digits, kSuffix) => {
  const n = parseFloat(String(digits).replace(/,/g, ''))
  if (!Number.isFinite(n)) return null
  return kSuffix ? n * 1000 : n
}
// "$103,000" | "$103,000.00" | "$103K" | "$37.64" | "$78,291" | "130k"
// The comma-group count is BOUNDED ({1,4}, up to billions) — an unbounded `+` backtracks ~O(n²) on a
// degenerate run of ",000" groups in a hostile JD (a 160KB payload measured ~11s).
const MONEY = String.raw`\$?\s?(\d{1,3}(?:,\d{3}){1,4}(?:\.\d{1,2})?|\d{1,3}(?:\.\d{1,2})?)\s?([kK])?`
const RANGE_SRC = `${MONEY}\\s*(?:-|–|—|to|through)\\s*${MONEY}`
const SINGLE_SRC = `\\$\\s?(\\d{1,3}(?:,\\d{3}){1,4}(?:\\.\\d{1,2})?|\\d{1,3}(?:\\.\\d{1,2})?)\\s?([kK])?`
// Regexes are built fresh per use: sharing one /g object across the nested extractPay→candidateFrom
// calls corrupts lastIndex and spins forever. matchAll() clones; non-global .match() is stateless.
const rangeG = () => new RegExp(RANGE_SRC, 'g')
const range1 = () => new RegExp(RANGE_SRC)
const singleG = () => new RegExp(SINGLE_SRC, 'g')

const HOURLY_CUE = /per\s*hour|\/\s?hour|\/\s?hr\b|\bhourly\b|an\s+hour|hour\.|hr\./i
const ANNUAL_CUE = /per\s*year|\/\s?yr\b|\bannual(?:ly|ized)?\b|a\s+year|per\s*annum/i
// "this dollar figure is pay" — anchors a money match.
const SALARY_CUE = /salary|compensation|base\s*pay|base\s*salary|pay\s*range|salary\s*range|pay\s*rate|wage|hiring\s*range|target\s*(?:pay|comp)|expected\s*(?:pay|salary)|the\s+(?:budgeted\s+)?(?:annual\s+)?(?:base\s+|salary\s+)?range/i
// "this nearby dollar figure is NOT base pay" — kills false positives.
const NONPAY_CUE = /401\s?\(?k\)?|match|bonus|equity|stock|rsu|tuition|reimburs|revenue|raised|funding|valuation|customers?|users?|savings|budget of|donat|scholarship|per\s*month|monthly|\bdiscount/i
// On-target earnings = total target comp (base + commission), not base pay. Narrow on purpose —
// "variable compensation" alone is fine when a base range is stated separately.
const OTE_CUE = /on[- ]?target\s+(?:earnings|compensation|comp)|\bote\b|target\s+total\s+comp/i
// Foreign currency — skip (we band against a USD target).
const FOREIGN_CCY = /\bCAD\b|CA\$|\bAUD\b|\bGBP\b|\bEUR\b|£|€|canadian/i
// HCOL / geo markers — >1 range + these → location-tiered.
const GEO_CUE = /colorado|\bnyc\b|new york|california|\bcalif\b|\bwa\b|washington|seattle|san francisco|\bsf\b|bay area|zone\s*\d|tier\s*\d|los angeles|hawaii|jersey|connecticut|\bremote\b|nationwide|other\s+us|all\s+other/i
const HCOL_CUE = /california|\bcalif\b|new york|\bnyc\b|san francisco|\bsf\b|bay area|seattle|los angeles|hawaii|jersey/i

const inBounds = (period, lo, hi) =>
  period === 'hourly' ? lo >= HOURLY_MIN && hi <= HOURLY_MAX : lo >= ANNUAL_MIN && hi <= ANNUAL_MAX

// Build a candidate from a window of text, or null if it isn't credible base pay.
function candidateFrom(window, fullIdx, fullText) {
  const around = fullText.slice(Math.max(0, fullIdx - 80), fullIdx + window.length + 50)
  if (NONPAY_CUE.test(around) && !SALARY_CUE.test(around)) return null
  // OTE ranges are total target comp, not base — reject unless a base label sits right here.
  if (OTE_CUE.test(around) && !/base\s*(?:salary|pay|wage)/i.test(around)) return null
  if (FOREIGN_CCY.test(window)) return null // a non-USD figure (e.g. "CA$148,800")
  const periodHint = HOURLY_CUE.test(around) ? 'hourly' : ANNUAL_CUE.test(around) ? 'annual' : null

  // RANGE first (rules 1 & 3)
  const rm = window.match(range1())
  if (rm) {
    // A bare numeric range ("15-20% travel", "10-15 years", "8-10 engineers") is NOT pay unless it
    // carries a $, a K-suffix, or a salary/period cue. The biggest false-positive guard.
    const hasDollar = /\$/.test(rm[0])
    const hasK = Boolean(rm[2] || rm[4])
    const hasCue = SALARY_CUE.test(around) || HOURLY_CUE.test(around) || ANNUAL_CUE.test(around)
    if (!hasDollar && !hasK && !hasCue) return null
    let lo = toNum(rm[1], rm[2])
    let hi = toNum(rm[3], rm[4])
    if (lo != null && hi != null) {
      if (rm[4] && !rm[2] && lo < 1000) lo *= 1000 // K only on the high end ("$103-130K")
      if (lo > hi) [lo, hi] = [hi, lo]
      const period = periodHint || (hi < 1000 ? 'hourly' : 'annual') // magnitude inference
      if (!inBounds(period, lo, hi)) return null
      const mul = period === 'hourly' ? HOURS_PER_YEAR : 1
      return { period, min: lo, max: hi, annualMin: Math.round(lo * mul), annualMax: Math.round(hi * mul), quote: clip(around), hcol: HCOL_CUE.test(around) }
    }
  }

  // SINGLE (rules 2 & 4) — require a period or salary cue so we don't grab a stray figure.
  if (!periodHint && !SALARY_CUE.test(around)) return null
  for (const sm of window.matchAll(singleG())) {
    const v = toNum(sm[1], sm[2])
    if (v == null) continue
    const period = periodHint || (v < 1000 ? 'hourly' : 'annual')
    if (!inBounds(period, v, v)) continue
    const mul = period === 'hourly' ? HOURS_PER_YEAR : 1
    return { period, min: v, max: v, annualMin: Math.round(v * mul), annualMax: Math.round(v * mul), quote: clip(around), hcol: HCOL_CUE.test(around) }
  }
  return null
}

// extractPay(jd) → {period, min, max, annualMin, annualMax, location_tiered, quote} | null
export function extractPay(jd) {
  // Drop a currency-code suffix that sits between the figure and the separator ("$143,000 USD -
  // $177,000 USD" would otherwise collapse to its floor), then decode any stray entities.
  const text = decodeNamed(String(jd || '').replace(/(\d)\s*(?:USD|US\$)\b/gi, '$1'))
  if (!text.trim()) return null
  const cands = []

  // Pass 1: every RANGE occurrence is a candidate site. matchAll() clones the regex so the iterator
  // is immune to candidateFrom() running its own range/single regexes internally.
  for (const m of text.matchAll(rangeG())) {
    const c = candidateFrom(m[0], m.index, text)
    if (c) cands.push(c)
  }
  // Pass 2: salary-cue anchored single (only when no range candidate was found anywhere).
  if (cands.length === 0) {
    for (const cm of text.matchAll(new RegExp(SALARY_CUE.source, 'gi'))) {
      const c = candidateFrom(text.slice(cm.index, cm.index + 120), cm.index, text)
      if (c) { cands.push(c); break }
    }
  }
  if (cands.length === 0) return null

  // Dedup identical annual ranges.
  const uniq = []
  for (const c of cands) if (!uniq.some((u) => u.annualMin === c.annualMin && u.annualMax === c.annualMax)) uniq.push(c)

  // Location-tiered: >1 distinct range + geo markers → pick the non-HCOL (lowest) band for a
  // Midwest/SE candidate, preferring an explicitly non-HCOL-tagged range.
  let pick = uniq[0]
  let tiered = false
  if (uniq.length > 1 && GEO_CUE.test(text)) {
    const nonHcol = uniq.filter((u) => !u.hcol)
    const pool = (nonHcol.length ? nonHcol : uniq).slice().sort((a, b) => a.annualMax - b.annualMax)
    pick = pool[0]
    tiered = true
  }
  return { period: pick.period, min: pick.min, max: pick.max, annualMin: pick.annualMin, annualMax: pick.annualMax, location_tiered: tiered, quote: pick.quote }
}

// bandVsTarget(pay, target) → { band, score, shortfallPct }
// band: 'above' | 'within' | 'near' | 'below' | 'unknown'  ·  score: 0..1 salary sub-score.
export function bandVsTarget(pay, target) {
  if (!pay || !Number.isFinite(target) || target <= 0) return { band: 'unknown', score: null, shortfallPct: null }
  const top = pay.annualMax
  const bottom = pay.annualMin
  if (bottom >= target) return { band: 'above', score: 1, shortfallPct: 0 }
  if (top >= target) return { band: 'within', score: 1, shortfallPct: 0 } // target falls inside the range
  const shortfall = (target - top) / target // role tops out under target
  const score = Math.max(0, Math.min(1, 1 - shortfall / SALARY_FLOOR))
  const band = shortfall <= SALARY_TOLERANCE ? 'near' : 'below'
  return { band, score: Math.round(score * 1000) / 1000, shortfallPct: Math.round(shortfall * 1000) / 10 }
}

// Compact human label for a pay annotation: "$103–130k" | "$28–35/hr" | "$78k". '' if no pay.
export function formatPay(pay) {
  if (!pay) return ''
  if (pay.period === 'hourly') {
    const f = (n) => (Math.round(n * 100) / 100).toString()
    return pay.min === pay.max ? `$${f(pay.min)}/hr` : `$${f(pay.min)}–${f(pay.max)}/hr`
  }
  const k = (n) => `$${Math.round(n / 1000)}k`
  return pay.annualMin === pay.annualMax ? k(pay.annualMin) : `${k(pay.annualMin)}–${k(pay.annualMax).slice(1)}`
}

// One-field pipeline annotation: "$103–130k (above)" — pay + band, '' when nothing is known.
export function paySummary(pay, target) {
  if (!pay) return ''
  const label = formatPay(pay)
  const { band } = bandVsTarget(pay, target)
  return band && band !== 'unknown' ? `${label} (${band})` : label
}
