// Jobdar — listing liveness (1.53.0). An evaluated row used to keep its Apply badge forever: rows past
// status `scanned` are never pruned, and the dead-JD honesty shipped in 1.48.1 only fires when the user
// reaches tailor/outreach. Measured on the real pipeline (2026-08-28 audit): 8 of 32 Apply-band roles —
// including both oldest ones — were no longer posted. This module closes that gap by re-using the
// provider contract as the liveness probe:
//   • fetchJob succeeds with real JD text            → 'live'  (the board still serves the posting)
//   • the provider throws HTTP 403 / 404 / 410       → 'gone'  (Workday's CXS API 403s an unposted job,
//     Greenhouse/iCIMS 404 a closed one — verified live against 32 real Apply-band URLs, 2026-08-28)
//   • anything else (network error, empty JD, no provider) → 'unknown' — NEVER claimed gone. Honesty
//     rule: only a positive board signal moves listing_state; an unreachable board proves nothing.

import { fetchJobDescription } from '../providers/_contract.mjs'
import { isEvaluated, isTracked } from './pipeline_pure.mjs'

const GONE_STATUS_RE = /HTTP (?:403|404|410) /

// Pure: classify a provider fetch error message. Exported for offline tests.
export function classifyFetchError(message) {
  return GONE_STATUS_RE.test(String(message || '')) ? 'gone' : 'unknown'
}

// Probe ONE posting. Returns { state: 'live'|'gone'|'unknown', title?, error? }. Never throws.
export async function checkListing(url) {
  try {
    const d = await fetchJobDescription(url)
    if (d && String(d.description || '').trim()) return { state: 'live', title: d.title || '' }
    // A provider matched but returned no JD text (JS-rendered page, odd shape) — not proof either way.
    return { state: 'unknown', title: (d && d.title) || '' }
  } catch (e) {
    return { state: classifyFetchError(e && e.message), error: String((e && e.message) || e).slice(0, 200) }
  }
}

// ——— Verify-before-present (1.60.0) ———
// "Never serve a dead role": every surface that lists actionable roles verifies them first. A row is
// actionable when a user might act on it (evaluated, un-tracked, Apply/Research band, not already
// gone); it is STALE when its last board check isn't from today (scan/eval/recheck all stamp
// `checked`, so after a morning scan most rows are already fresh and this is a no-op).

export const FRESHNESS_MAX_AGE_DAYS = 1

// Pure (exported for tests): the actionable rows whose board check is missing, unparsable, or older
// than maxAgeDays relative to todayStr. maxAgeDays=1 → only a same-day check counts as fresh.
export function staleActionable(rows, todayStr, maxAgeDays = FRESHNESS_MAX_AGE_DAYS) {
  const today = new Date(String(todayStr) + 'T00:00:00Z').getTime()
  return (rows || []).filter((r) => {
    if (!r || !r.url || !isEvaluated(r) || isTracked(r)) return false
    if (r.band !== 'apply' && r.band !== 'research') return false
    if (r.listing_state === 'gone') return false
    const c = String(r.checked || '').trim()
    if (!c) return true
    const age = (today - new Date(c + 'T00:00:00Z').getTime()) / 86400000
    return !(age < maxAgeDays) // NaN-safe: an unparsable date counts as stale
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Probe every stale actionable row and hand positive verdicts to `persist` (injectable, as is
// `probe`, for offline tests). Honesty rules carry over: 'unknown' is counted but never persisted —
// an unreachable board proves nothing, and offline runs degrade to "shown with last-known state".
export async function verifyBeforePresent({ rows, todayStr, maxAgeDays, delayMs = 300, onProbe, persist, probe = checkListing }) {
  const targets = staleActionable(rows, todayStr, maxAgeDays)
  if (!targets.length) return { probed: 0, gone: 0, live: 0, unknown: 0, goneRoles: [] }
  const checks = []
  const goneRoles = []
  let unknown = 0
  let first = true
  for (const row of targets) {
    if (!first) await sleep(delayMs) // politeness between board probes
    first = false
    if (onProbe) onProbe(row)
    const res = await probe(row.url)
    if (res.state === 'unknown') {
      unknown++
      continue
    }
    checks.push({ url: row.url, state: res.state })
    if (res.state === 'gone') goneRoles.push(row)
  }
  if (checks.length && persist) persist(checks, todayStr)
  return { probed: targets.length, gone: goneRoles.length, live: checks.length - goneRoles.length, unknown, goneRoles }
}
