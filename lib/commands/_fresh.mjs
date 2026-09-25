// Jobdar — verify-before-present (1.60.0). Shared freshness gate for every surface that lists
// actionable roles (tui, dashboard, report): before rendering, probe each Apply/Research row that
// lacks a same-day board check and stamp the verdicts, so a dead posting can't be presented as an
// opportunity. Quiet when everything is fresh (the common case right after a scan); honest when
// offline — 'unknown' probes persist nothing and the user is told what couldn't be verified.
// `--no-verify` skips the gate for deliberately-offline runs.

import { readPipeline, upsertListingChecks } from '../evaluations.mjs'
import { staleActionable, verifyBeforePresent } from '../liveness.mjs'
import { color } from '../ui.mjs'

export async function ensureFreshListings(t, { skip = false } = {}) {
  if (skip) return { probed: 0, gone: 0, live: 0, unknown: 0, goneRoles: [], skipped: true }
  const todayStr = new Date().toISOString().slice(0, 10)
  const rows = readPipeline()
  const stale = staleActionable(rows, todayStr)
  if (!stale.length) return { probed: 0, gone: 0, live: 0, unknown: 0, goneRoles: [] }
  console.log(color.dim(t('fresh.checking', { count: stale.length })))
  const summary = await verifyBeforePresent({ rows, todayStr, persist: upsertListingChecks })
  for (const row of summary.goneRoles) {
    console.log('  ' + color.yellow(`✗ ${t('recheck.gone_line', { company: row.company || row.url, role: row.role || '' })}`))
  }
  if (summary.unknown) console.log(color.dim('  ' + t('fresh.unknown', { count: summary.unknown })))
  return summary
}
