// Jobdar — scanner orchestrator (zero-token, deterministic, no model).
// Loads portals, resolves a provider for each, and lists public postings.
// `--dry-run` resolves providers and prints a summary with NO network calls.
//
// Run directly:  node scan.mjs [--dry-run] [--lang en|es]
// Or via the CLI: jobdar scan [--dry-run]

import { loadProfile, loadPortals } from './lib/config.mjs'
import { getT } from './lib/i18n.mjs'
import { parseFlags, resolveLang, isDirectRun } from './lib/cli.mjs'
import { resolveProvider } from './providers/_contract.mjs'
import { filterByLevel } from './lib/levels.mjs'
import { filterByLocation } from './lib/regions.mjs'
import { upsertScanned, prunePipeline } from './lib/evaluations.mjs'
import { color, symbol, heading } from './lib/ui.mjs'

const regionLabel = (t, regions) => (regions || []).map((r) => t(`regions.${r}`)).join(', ') || t('common.none')
const levelLabel = (t, levels) => (levels || []).map((l) => t(`levels.${l}`)).join(', ') || t('common.none')

export async function runScan(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  const dryRun = Boolean(flags['dry-run'] || flags.n)
  const ctx = { render: Boolean(flags.playwright || process.env.JOBDAR_PLAYWRIGHT), lang }
  const levels = flags.levels
    ? String(flags.levels).split(',').map((s) => s.trim()).filter(Boolean)
    : profile.target_levels
  const regions = flags.regions
    ? String(flags.regions).split(',').map((s) => s.trim()).filter(Boolean)
    : profile.target_regions

  heading(dryRun ? t('scan.dry_run_title') : t('scan.title'))
  console.log(
    color.dim(
      t('scan.ctx', {
        region: regionLabel(t, regions),
        levels: levelLabel(t, levels),
        language: lang,
      })
    )
  )

  let portals = loadPortals()
  const companyFilter = typeof flags.company === 'string' ? flags.company.toLowerCase() : null
  if (companyFilter) portals = portals.filter((p) => (p.company || '').toLowerCase().includes(companyFilter))
  console.log(t('scan.portals_count', { count: portals.length }))
  if (portals.length === 0) {
    console.log(color.yellow(t('scan.none')))
    return { portals: 0, jobs: 0 }
  }

  const resolved = portals.map((portal) => ({ portal, hit: resolveProvider(portal) }))

  if (dryRun) {
    for (const { portal, hit } of resolved) {
      if (hit) {
        console.log(`  ${symbol.ok()} ${portal.company}  ${color.dim(`[${hit.provider.id}] ${t('scan.would_scan')}`)}`)
      } else {
        console.log(`  ${symbol.warn()} ${portal.company}  ${color.yellow(t('scan.no_provider'))}`)
      }
    }
    console.log('\n' + color.dim(t('scan.dry_note')))
    console.log(color.dim(t('dashboard.access')))
    return { portals: portals.length, jobs: 0, dryRun: true }
  }

  // Live scan. Portals run through a small concurrency pool (3 at once) — each provider still paces
  // its own pages politely; the pool only overlaps DIFFERENT employers' boards.
  console.log(t('scan.scanning', { count: resolved.length }))
  let total = 0
  let excludedLevel = 0
  let excludedRegion = 0
  const allKept = []
  const queue = resolved.slice()
  const scanOne = async ({ portal, hit }) => {
    if (!hit) {
      console.log(`  ${symbol.warn()} ${t('scan.error_for', { company: portal.company, error: t('scan.no_provider') })}`)
      return
    }
    try {
      const jobs = await hit.provider.fetch(hit.match, ctx)
      const lvl = filterByLevel(jobs, levels)
      const loc = filterByLocation(lvl.kept, regions, { userMetro: profile.location })
      for (const j of loc.kept) allKept.push(j)
      total += loc.kept.length
      excludedLevel += lvl.excluded
      excludedRegion += loc.excluded
      console.log(`  ${symbol.ok()} ${t('scan.found_for', { company: portal.company, count: loc.kept.length })}`)
    } catch (err) {
      console.log(`  ${symbol.fail()} ${t('scan.error_for', { company: portal.company, error: err.message })}`)
    }
  }
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length) await scanOne(queue.shift())
  })
  await Promise.all(workers)
  if (excludedLevel > 0) console.log(color.dim(t('scan.level_note', { count: excludedLevel })))
  if (excludedRegion > 0) console.log(color.dim(t('scan.region_note', { count: excludedRegion })))

  // Persist DISCOVERED roles to the pipeline. Scan only finds + filters roles — it does NOT score fit;
  // that's the model's job in `eval` (career-ops: discover → evaluate → build). Re-scans never clobber a
  // role the model already evaluated.
  if (allKept.length) {
    const date = new Date().toISOString().slice(0, 10)
    upsertScanned(allKept, date)
    // --prune drops stale `scanned` rows no longer on any board. Only safe on a FULL scan — a
    // --company scan would wrongly prune every other portal's roles, so it's skipped there.
    if (flags.prune && !companyFilter) {
      const pruned = prunePipeline(new Set(allKept.map((j) => j.url)))
      if (pruned > 0) console.log(color.dim(t('scan.pruned', { count: pruned })))
    }
    console.log('\n' + t('scan.eval_hint'))
  }

  console.log('\n' + t('scan.total_found', { count: total, portals: resolved.length }))
  console.log(color.dim(t('dashboard.access')))
  return { portals: portals.length, jobs: total }
}

if (isDirectRun(import.meta.url)) {
  runScan(process.argv.slice(2)).catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
