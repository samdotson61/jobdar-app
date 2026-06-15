// Jobdar — band thresholds (Phase 9.0: extracted PURE — no fs/config — so the scoring path bundles into
// the browser/native apps). The model evaluates on the 0.0–5.0 scale: ≥4.0 Apply, ≥3.5 Research, else Don't.
export const BANDS = { apply: 4.0, research: 3.5 }
export function band(score) {
  if (score === '' || score == null) return '' // no score yet → no band (Number('') is 0, so guard first)
  const n = Number(score)
  if (!Number.isFinite(n)) return ''
  if (n >= BANDS.apply) return 'apply'
  if (n >= BANDS.research) return 'research'
  return 'dont'
}
