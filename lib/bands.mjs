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

// Derive the calibration thumb from a would-apply answer (1.55.0, pure). The beta-tester question is
// "Would you apply to this role?" — a label on the ROLE. An Apply verdict the human would apply to =
// the eval was right ('up'); a Don't they'd apply to anyway = wrong ('down'). A Research verdict is
// deliberately NOT scored either way — "I'd apply" doesn't contradict "look closer first" — so it
// returns '' (recorded in the ledger + beta report, excluded from the agreement rate).
export function thumbFromWouldApply(band, wouldApply) {
  if (band === 'apply') return wouldApply ? 'up' : 'down'
  if (band === 'dont') return wouldApply ? 'down' : 'up'
  return ''
}

// 1.52.0 honesty: an explicitly-passed band may only AGREE with the score it accompanies — a
// contradicting pair (`--score 1.0 --band apply`) must be refused, never persisted (it renders
// identically to a legitimate verdict). Shared by `eval --save`, serve /eval/save, and the native
// backend so the rule can't drift. Returns { derived, conflict }.
export function bandConflict(score, explicit) {
  const derived = band(score)
  const conflict = Boolean(explicit && ['apply', 'research', 'dont'].includes(explicit) && explicit !== derived)
  return { derived, conflict }
}
