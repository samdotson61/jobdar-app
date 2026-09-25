// Jobdar — application tracker. The tracker is a VIEW over the pipeline store (data/pipeline.tsv), not
// a second file: a role enters the tracker the moment its status moves past discovery/eval — via the
// TUI's `a` key or `jobdar tracker --set <url> <state>`. States are the canonical IDs in
// templates/states.yml (applied, interviewing, offer, …; ES aliases accepted on input).

import { loadProfile } from './config.mjs'
import { getT } from './i18n.mjs'
import { parseFlags, resolveLang } from './cli.mjs'
import { color, heading } from './ui.mjs'
import { resolveState, stateLabel, allStates } from './states.mjs'
import { readPipeline, isTracked, updateStatusByUrl } from './evaluations.mjs'

// Pure: project pipeline rows into tracker rows (only human-tracked statuses).
export function trackerRowsFrom(pipeline) {
  return (pipeline || []).filter(isTracked).map((r) => ({ company: r.company, role: r.role, url: r.url, state: r.status, updated: r.updated }))
}

export function readTrackerRows() {
  return trackerRowsFrom(readPipeline())
}

export async function runTracker(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)

  heading(t('tracker.title'))

  // --set <url> <state>: advance a pipeline row's status (the write path the funnel's "Applied" needs).
  if (flags.set || positionals.length >= 2) {
    const url = typeof flags.set === 'string' ? flags.set : positionals[0]
    const stateInput = typeof flags.set === 'string' ? positionals[0] : positionals[1]
    const state = resolveState(stateInput)
    if (!url || !state) {
      const ids = allStates().map((s) => s.id).join(' | ')
      console.error(t('tracker.set_usage', { states: ids }))
      process.exitCode = 1
      return { set: false }
    }
    if (!updateStatusByUrl(url, state)) {
      console.error(t('tracker.set_missing', { url }))
      process.exitCode = 1
      return { set: false }
    }
    console.log(`  ${color.green('✓')} ${t('tracker.set_done', { state: stateLabel(state, lang), url })}`)
    return { set: true, url, state }
  }

  const rows = readTrackerRows()
  if (rows.length === 0) {
    console.log(color.dim(t('tracker.empty')))
    return { count: 0 }
  }
  console.log(t('tracker.count', { count: rows.length }))
  console.log(
    color.dim(
      [t('tracker.col_company'), t('tracker.col_role'), t('tracker.col_state'), t('tracker.col_updated')].join('\t')
    )
  )
  for (const r of rows) {
    console.log([r.company, r.role, stateLabel(resolveState(r.state) || r.state, lang), r.updated].join('\t'))
  }
  return { count: rows.length }
}
