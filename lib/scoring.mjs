// Jobdar — job scoring (career-ops-style pipeline: scan → SCORE → build). Produces a 0.0–5.0
// weighted composite from four dimensions and an Apply / Research / Don't band — used as a filter,
// not a spray-and-pray list. Location, seniority, and salary are deterministic; the résumé/fit
// dimension is a keyword *estimate* today (flagged) and is replaced by the model's semantic score
// when you eval a role (your AI CLI now, the on-device model in Phase 8).

import { regionStateSet, parseLocation } from './regions.mjs'
import { classifyTitle } from './levels.mjs'

// composite >= apply → Apply; >= research → Research; else Don't.
export const BANDS = { apply: 4.0, research: 3.5 }
export const DEFAULT_WEIGHTS = { resume: 0.4, seniority: 0.25, location: 0.2, salary: 0.15 }
const ORDER = { entry: 1, mid: 2, senior: 3 }
const round1 = (n) => Math.round(n * 10) / 10

export function band(score) {
  if (score >= BANDS.apply) return 'apply'
  if (score >= BANDS.research) return 'research'
  return 'dont'
}

// 0–5: in a selected region = 5; remote-US = 4; ambiguous = 3; US-but-out-of-region = 1.5; offshore = 0.
export function scoreLocation(location, profile) {
  const p = parseLocation(location)
  if (p.foreign && !p.usStates.length && !p.remote) return 0
  const stateSet = regionStateSet(profile.target_regions || ['midwest'])
  const inRegion = stateSet === 'ALL' ? p.usStates.length > 0 : p.usStates.some((s) => stateSet.has(s))
  if (inRegion) return 5
  if (p.remote && !p.foreign) return 4
  if (!p.usStates.length) return 3 // ambiguous ("6 Locations")
  return 1.5 // US but outside the selected region(s)
}

// 0–5: title level vs target_levels. On-target = 5; above the top or below the floor falls off; unclear = 3.5.
export function scoreSeniority(title, profile) {
  const sel = (profile.target_levels || ['entry']).filter((l) => ORDER[l])
  const levels = sel.length ? sel : ['entry']
  const lvl = classifyTitle(title)
  if (lvl === 'unclear') return 3.5
  if (levels.includes(lvl)) return 5
  const max = Math.max(...levels.map((l) => ORDER[l]))
  const min = Math.min(...levels.map((l) => ORDER[l]))
  if (ORDER[lvl] > max) return Math.max(1, 5 - 1.5 * (ORDER[lvl] - max))
  return Math.max(2, 5 - 1.5 * (min - ORDER[lvl]))
}

// 0–5 vs target salary. Unknown on either side → neutral 3.0 (not penalized). At/above target = 5.
export function scoreSalary(jobSalary, profile) {
  const target = Number(profile.target_salary) || 0
  const sal = Number(jobSalary) || 0
  if (!target || !sal) return 3.0
  const ratio = sal / target
  if (ratio >= 1.0) return 5
  if (ratio >= 0.9) return 4.5
  if (ratio >= 0.8) return 3.5
  if (ratio >= 0.7) return 2.5
  if (ratio >= 0.6) return 1.5
  return 0.5
}

// Résumé/fit 0–5 (proxy today): keyword overlap between the role text and the user's cv.md. Returns
// { score, estimate:true } so callers can mark it. No cv text → neutral 3.0.
const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'our', 'your', 'will', 'are', 'that', 'this', 'have', 'from', 'job', 'role', 'team', 'work', 'about', 'who', 'all'])
export function scoreResume(jobText, cvText) {
  const cv = String(cvText || '').toLowerCase()
  if (!cv.trim()) return { score: 3.0, estimate: true }
  const words = [...new Set(String(jobText || '').toLowerCase().match(/[a-z][a-z+#.]{2,}/g) || [])].filter((w) => !STOP.has(w))
  if (!words.length) return { score: 3.0, estimate: true }
  const ratio = words.filter((w) => cv.includes(w)).length / words.length
  return { score: round1(Math.max(0, Math.min(5, 1.5 + ratio * 12))), estimate: true }
}

// Weighted average over whatever dimensions are present (weights renormalized). 0–5, one decimal.
export function compositeScore(scores, weights = DEFAULT_WEIGHTS) {
  let sum = 0
  let wsum = 0
  for (const k of ['resume', 'location', 'salary', 'seniority']) {
    if (scores[k] == null) continue
    const w = weights[k] == null ? DEFAULT_WEIGHTS[k] : weights[k]
    sum += scores[k] * w
    wsum += w
  }
  return wsum ? round1(sum / wsum) : 0
}

// Score one job → { resume, location, salary, seniority, composite, band, estimate }.
export function scoreJob(job, profile, cvText) {
  const weights = profile.score_weights || DEFAULT_WEIGHTS
  const resume = scoreResume(`${job.title || ''} ${job.description || ''}`, cvText)
  const scores = {
    resume: resume.score,
    location: scoreLocation(job.location, profile),
    salary: scoreSalary(job.salary, profile),
    seniority: scoreSeniority(job.title, profile),
  }
  const composite = compositeScore(scores, weights)
  return { ...scores, composite, band: band(composite), estimate: resume.estimate }
}
