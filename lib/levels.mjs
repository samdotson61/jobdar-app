// Jobdar — level-of-work classification & filtering (Phase 4).
// A coarse, deterministic title pre-filter derived from the user's target_levels. It is a
// PRE-filter only: it drops titles that clearly read as a level the user didn't pick, and passes
// ambiguous titles through for the rubric (modes/_shared.md) to judge on the full JD.
// Entry is the default; mid is first-class; senior is opt-in and ranks on merit when chosen.

export const LEVELS = ['entry', 'mid', 'senior'] // user-selectable; `exec` is internal — always above-target
const ORDER = { entry: 1, mid: 2, senior: 3, exec: 4 }

// Level keyword signals, checked exec -> senior -> mid -> entry (highest wins, so "Senior Analyst II"
// reads senior). Coarse by design — the model does the nuanced read on the JD.
// EXEC = executive / above-the-top (VP, President, Chief/C-suite, Head of, Director, GM, Founder). It is
// never a target for new grads & workforce-entry, so it's always filtered out. The old SENIOR list only
// matched the abbreviation `vp`, so a spelled-out "Vice President, Product" slipped through as "unclear"
// and could ride a high keyword match into Apply — this tier closes that gap.
const EXEC = /\b(vp|svp|evp|vice[\s-]?president|president|chief|ceo|cto|cfo|coo|cio|cmo|cpo|cro|cdo|cso|ciso|chro|cxo|head\s+of|director|managing\s+director|general\s+manager|founder|co-?founder|distinguished)\b/
const SENIOR = /\b(senior|sr\.?|staff|lead|principal)\b/
const MID = /\b(iii|ii)\b|\b(specialist|mid)\b/
const ENTRY = /\b(entry|junior|jr\.?|associate|trainee|apprentice|apprenticeship|coordinator|assistant|graduate|intern|i)\b|\bnew grad\b/

export function classifyTitle(title) {
  const t = String(title || '').toLowerCase()
  if (EXEC.test(t)) return 'exec'
  if (SENIOR.test(t)) return 'senior'
  if (MID.test(t)) return 'mid'
  if (ENTRY.test(t)) return 'entry'
  return 'unclear'
}

// Decide whether a title belongs in a scan for the selected levels:
//   include:false                 -> filtered out (clearly above or below the selected band)
//   include:true,  flagged:true   -> passes but sits in a gap between selected levels
//   include:true,  flagged:false  -> on-target, or ambiguous title (let the rubric judge)
export function levelDecision(title, targetLevels = ['entry']) {
  const sel = (Array.isArray(targetLevels) ? targetLevels : ['entry']).filter((l) => ORDER[l])
  const levels = sel.length ? sel : ['entry']
  const level = classifyTitle(title)
  if (level === 'unclear') return { level, include: true, flagged: false, reason: 'ambiguous-title' }
  if (levels.includes(level)) return { level, include: true, flagged: false, reason: 'on-target' }
  const max = Math.max(...levels.map((l) => ORDER[l]))
  const min = Math.min(...levels.map((l) => ORDER[l]))
  if (ORDER[level] > max) return { level, include: false, flagged: false, reason: 'above-target' }
  if (ORDER[level] < min) return { level, include: false, flagged: false, reason: 'below-target' }
  return { level, include: true, flagged: true, reason: 'between-target' }
}

// Filter a job list by level; returns kept jobs (annotated with { level, flagged }) + counts.
export function filterByLevel(jobs, targetLevels = ['entry']) {
  const kept = []
  let excluded = 0
  for (const job of jobs || []) {
    const d = levelDecision(job.title, targetLevels)
    if (!d.include) {
      excluded++
      continue
    }
    kept.push({ ...job, level: d.level, flagged: d.flagged })
  }
  return { kept, excluded, total: (jobs || []).length }
}
