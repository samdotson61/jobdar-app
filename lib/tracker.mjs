// Jobdar — application tracker (read/view).
// Tracker data lives in the gitignored data/ dir as TSV. Phase 0 ships the read
// path; add/update flows arrive with the wizard and pipeline (Phase 6).

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, paths } from './config.mjs'
import { getT } from './i18n.mjs'
import { parseFlags, resolveLang } from './cli.mjs'
import { color, heading } from './ui.mjs'
import { resolveState, stateLabel } from './states.mjs'

const TRACKER_FILE = path.join(paths.dataDir, 'tracker.tsv')

function readRows() {
  if (!existsSync(TRACKER_FILE)) return []
  const lines = readFileSync(TRACKER_FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return [] // header only or empty
  return lines.slice(1).map((line) => {
    const [company = '', role = '', state = '', updated = ''] = line.split('\t')
    return { company, role, state, updated }
  })
}

export async function runTracker(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)

  heading(t('tracker.title'))
  const rows = readRows()
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
    const state = stateLabel(resolveState(r.state) || r.state, lang)
    console.log([r.company, r.role, state, r.updated].join('\t'))
  }
  return { count: rows.length }
}
