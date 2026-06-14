// Jobdar — pay resolver (Phase 8d.2a; rec-spec §2). The de-skew engine: three layers, highest-confidence
// first, so a role's pay is NEVER blank and NEVER model-produced. The source label is mandatory UI text.
//   STATED      — extracted from the JD (lib/salary.mjs), high confidence.
//   COMPARABLE  — median of same-SOC/metro roles in this scan (n ≥ 3), medium.
//   BLS         — wage cache percentile by seniority (entry→p25 / mid→median / senior→p75), base.
// The model is the SOC + seniority router ONLY (deterministic data/seed/soc-map fallback for offline);
// software owns every number. Live BLS bulk-download lives in lib/bls.mjs (8d.2b); the national seed
// floor (data/seed/wages-national.yml) keeps this fully offline until then.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { ROOT } from './config.mjs'
import { extractPay, bandVsTarget } from './salary.mjs'

const seed = (name) => {
  const f = path.join(ROOT, 'data', 'seed', name)
  return existsSync(f) ? yaml.load(readFileSync(f, 'utf8')) || {} : {}
}
let _wages
let _socMap
export const loadWages = () => (_wages ||= seed('wages-national.yml'))
export const loadSocMap = () => (_socMap ||= seed('soc-map.yml'))

const k = (n) => `$${Math.round(n / 1000)}k`
const spread = (mid) => ({ annualMin: Math.round(mid * 0.9), annualMax: Math.round(mid * 1.1) }) // ±10% band around a point estimate
const PCT = { entry: 'p25', mid: 'median', senior: 'p75' }

// resolvePay(jd, opts) → { annualMin, annualMax, source, confidence, band, label }. Never blank.
// opts: { target, seniority, comps:[{annualMin,annualMax}], wages:{soc:{p25,median,p75}}, soc, occ }
export function resolvePay(jd, { target = 0, seniority = 'entry', comps = [], wages = null, soc = null, occ = '' } = {}) {
  // Layer 1 — STATED.
  const stated = extractPay(jd)
  if (stated) {
    return { annualMin: stated.annualMin, annualMax: stated.annualMax, source: 'stated', confidence: 'high', band: bandVsTarget(stated, target).band, label: `stated ${k(stated.annualMin)}–${k(stated.annualMax).slice(1)}` }
  }
  // Layer 2 — COMPARABLE (median of in-scan comps for the same SOC + metro).
  const valid = (comps || []).filter((c) => c && Number.isFinite(c.annualMin) && Number.isFinite(c.annualMax))
  if (valid.length >= 3) {
    const mids = valid.map((c) => (c.annualMin + c.annualMax) / 2).sort((a, b) => a - b)
    const med = mids[Math.floor(mids.length / 2)]
    const r = spread(med)
    return { ...r, source: 'comparable', confidence: 'med', band: bandVsTarget(r, target).band, label: `est. ${k(med)} (${valid.length} comparable)` }
  }
  // Layer 3 — BLS percentile by seniority.
  const row = wages && soc ? wages[soc] : null
  const pctKey = PCT[seniority] || 'median'
  if (row && Number.isFinite(row[pctKey])) {
    const r = spread(row[pctKey])
    return { ...r, source: 'bls', confidence: 'base', band: bandVsTarget(r, target).band, label: `est. ${k(row[pctKey])} (BLS ${pctKey}${occ ? `, ${occ}` : soc ? `, ${soc}` : ''})` }
  }
  return { annualMin: null, annualMax: null, source: 'unknown', confidence: 'none', band: 'unknown', label: 'pay not stated' }
}

// Deterministic title → SOC router (the offline/no-model fallback). socMap = { soc: [keyword,…] }.
export function socForTitle(title, socMap = {}) {
  const t = String(title || '').toLowerCase()
  for (const [soc, kws] of Object.entries(socMap)) {
    if ((kws || []).some((kw) => t.includes(String(kw).toLowerCase()))) return soc
  }
  return null
}
