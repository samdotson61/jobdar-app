// Jobdar — `jobdar recheck` (1.53.0). Re-verifies that the listings behind recorded verdicts are
// still publicly posted, so the Apply tab never quietly carries dead roles (the 2026-08-28 audit found
// 25% of the real Apply band gone). Default target: every evaluated, un-tracked row in the Apply or
// Research band — the rows a user acts on. --all widens to every evaluated/tracked row; --url <u>
// checks one. Verdicts land on the row as listing_state ('live'/'gone') + checked (date); an
// 'unknown' probe (network error, unfetchable board) changes NOTHING — only positive board signals
// move the state (honest-UI rule). Gone rows keep their score/band/history — nothing is deleted —
// but they drop out of the eval queue and render as "no longer posted".

import { loadProfile, paths } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, upsertListingChecks, isEvaluated, isTracked } from '../evaluations.mjs'
import { checkListing } from '../liveness.mjs'
import { createRadar } from '../progress.mjs'
import { color, heading } from '../ui.mjs'
import path from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Pure target selection (exported for tests): default = evaluated, un-tracked, apply/research band.
export function recheckTargets(rows, { all = false, url = '' } = {}) {
  if (url) return (rows || []).filter((r) => r.url === url)
  const base = (rows || []).filter((r) => r.url && isEvaluated(r))
  if (all) return base
  return base.filter((r) => !isTracked(r) && (r.band === 'apply' || r.band === 'research'))
}

export async function runRecheck(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  heading(t('recheck.title'))

  const rows = readPipeline()
  const url = typeof flags.url === 'string' ? flags.url : positionals[0] || ''
  const targets = recheckTargets(rows, { all: Boolean(flags.all), url })
  if (!targets.length) {
    console.log(color.dim(t('recheck.none')))
    return { checked: 0 }
  }
  console.log(t('recheck.running', { count: targets.length }))

  const radar = createRadar({
    total: targets.length,
    tallies: [
      { key: 'live', fmt: (n) => color.green(`✓ ${n} ${t('recheck.tally_live')}`) },
      { key: 'gone', fmt: (n) => color.yellow(`✗ ${n} ${t('recheck.tally_gone')}`) },
      { key: 'unknown', fmt: (n) => color.dim(`? ${n}`) },
    ],
  })
  const multi = targets.length > 1
  if (multi) radar.start()

  const checks = []
  const goneRoles = []
  let unknown = 0
  let first = true
  for (const row of targets) {
    if (!first) await sleep(300) // politeness between board probes
    first = false
    radar.label(`${row.company || row.url}${row.role ? ' — ' + row.role : ''}`)
    const res = await checkListing(row.url)
    if (res.state === 'unknown') {
      unknown++
      radar.tick('unknown')
      continue // no signal → no write (never claim gone without a positive board answer)
    }
    checks.push({ url: row.url, state: res.state })
    if (res.state === 'gone') {
      goneRoles.push(row)
      if (multi) radar.log('  ' + color.yellow(`✗ ${t('recheck.gone_line', { company: row.company, role: row.role })}`))
    }
    radar.tick(res.state)
  }
  radar.stop()

  const today = new Date().toISOString().slice(0, 10)
  const applied = upsertListingChecks(checks, today)

  const live = checks.filter((c) => c.state === 'live').length
  console.log('\n' + t('recheck.done', { live, gone: goneRoles.length, unknown }))
  if (goneRoles.length) console.log(color.dim('  ' + t('recheck.gone_note')))
  if (unknown) console.log(color.dim('  ' + t('recheck.unknown_note', { count: unknown })))
  console.log(color.dim('  ' + t('eval.report_where', { file: path.join(paths.dataDir, 'pipeline.tsv') })))
  return { checked: targets.length, live, gone: goneRoles.length, unknown, applied }
}
