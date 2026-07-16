// Jobfaro — eval operations: calibration (8a.5) + batch economics (8a.7). Kept pure where possible so
// the trust math and the batch wire-shaping are unit-tested offline; the live scorer is the opt-in
// `jobfaro calibrate` command, never `npm test` (preserves the offline-test invariant).

import { appendFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths } from './config.mjs'

// --- 8a.5 calibration --------------------------------------------------------

// Per-tier band agreement between scored verdicts and a hand-banded expected set. Pure.
// rows: [{ got: 'apply'|'research'|'dont', expected: same|undefined }].
export function bandAgreement(rows) {
  const tiers = ['apply', 'research', 'dont']
  const perTier = Object.fromEntries(tiers.map((t) => [t, { correct: 0, total: 0 }]))
  let correct = 0
  let total = 0
  for (const r of rows || []) {
    if (!r || !r.expected || !perTier[r.expected]) continue // ignore rows with no/out-of-tier expected band
    total++
    const hit = r.got === r.expected
    if (hit) correct++
    const p = perTier[r.expected]
    if (p) {
      p.total++
      if (hit) p.correct++
    }
  }
  return { overall: total ? Math.round((correct / total) * 100) : 0, n: total, perTier }
}

// Persist a clamp OVERRIDE (model said X, the gate/pay said Y) to a gitignored data/ log — no CV text
// (outreach-ledger privacy). Lets us watch per-model agreement + drift on every prompt/model change.
export function clampLogEntry(verdict, role = {}) {
  return {
    url: role.url || '',
    company: role.company || '',
    role: role.role || '',
    model: verdict.model || '',
    backend: verdict.backend || '',
    raw_score: verdict.rawScore != null ? verdict.rawScore : null,
    final_score: verdict.score != null ? verdict.score : null,
    band: verdict.band || '',
    reason: verdict.recommendation || '',
  }
}

export function logClamp(entry, dateStr) {
  try {
    mkdirSync(paths.dataDir, { recursive: true })
    appendFileSync(path.join(paths.dataDir, 'clamp-log.jsonl'), JSON.stringify({ ...entry, at: dateStr }) + '\n')
    return true
  } catch {
    return false
  }
}

// --- 8a.7 Message Batches API (50% price, one role per request) --------------

// Shape one Anthropic Batches request per role. Pure. `items`: [{ custom_id?, user }].
export function buildBatchRequests(items, { model, system, maxTokens = 700, cache = true } = {}) {
  const sys = cache ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system
  return (items || []).map((it, i) => ({
    custom_id: it.custom_id || `role-${i}`,
    params: { model, max_tokens: maxTokens, system: sys, messages: [{ role: 'user', content: it.user }] },
  }))
}

// Map Batches API results back to { [custom_id]: { text, usage } }. Pure.
export function parseBatchResults(results) {
  const out = {}
  for (const r of results || []) {
    if (!r || !r.custom_id) continue
    const msg = r.result && r.result.type === 'succeeded' ? r.result.message : null
    const text = msg && Array.isArray(msg.content) ? msg.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('') : ''
    out[r.custom_id] = { text, usage: (msg && msg.usage) || null, status: (r.result && r.result.type) || 'errored' }
  }
  return out
}
