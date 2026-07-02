// Jobdar — `jobdar calibrate` (Phase 8a.5). The OPT-IN live scorer: runs the eval engine over a
// hand-banded fixture set (data/calibration.json, or --file) against the configured backend and reports
// per-tier band agreement. Deliberately a command, NOT `npm test` — the offline test suite keeps only
// the pure scoring/agreement functions, preserving the no-network test invariant.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, loadCv, paths, fileExists } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectActive } from '../inference.mjs'
import { evalRole } from '../eval_engine.mjs'
import { bandAgreement } from '../eval_ops.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { color, heading } from '../ui.mjs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function runCalibrate(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  heading(t('calibrate.title'))

  const file = typeof flags.file === 'string' ? flags.file : path.join(paths.dataDir, 'calibration.json')
  let set = null
  if (fileExists(file)) {
    try {
      set = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      set = null
    }
  }
  if (!Array.isArray(set) || set.length === 0) {
    console.log(color.yellow(t('calibrate.none', { file })))
    process.exitCode = 1
    return { n: 0 }
  }

  const active = await selectActive(profile)
  if (!active.up) {
    console.log(color.yellow(t('calibrate.backend_down', { reason: active.reason })))
    process.exitCode = 1
    return { n: 0 }
  }

  const cv = loadCv()
  const today = new Date().toISOString().slice(0, 10)
  console.log(t('calibrate.running', { count: set.length, backend: active.runtime || active.kind }))

  const rows = []
  let first = true
  for (const item of set) {
    if (!first) await sleep(800)
    first = false
    let jd = item.jd || ''
    if (!jd && item.url) {
      try {
        const d = await fetchJobDescription(item.url)
        jd = (d && d.description) || ''
      } catch {
        jd = ''
      }
    }
    if (!jd) continue
    // Per-item résumé (item.cv) lets one calibration set cover multiple personas; else the user's cv.md.
    const itemCv = typeof item.cv === 'string' && item.cv.trim() ? item.cv : cv
    const v = await evalRole({ active, jd, cv: itemCv, profile, today, transferable: item.transferable })
    if (!v.ok) continue
    rows.push({ got: v.band, expected: item.expect, score: v.score })
    const mark = v.band === item.expect ? color.green('✓') : color.yellow('≠')
    console.log(`  ${mark} ${v.band} vs expected ${item.expect || '—'}   ${item.label || item.url || ''}`)
  }

  const a = bandAgreement(rows)
  console.log('\n' + t('calibrate.result', { overall: a.overall, n: a.n }))
  for (const tier of ['apply', 'research', 'dont']) {
    const p = a.perTier[tier]
    if (p.total) console.log(color.dim('  ' + t('calibrate.tier', { tier, correct: p.correct, total: p.total })))
  }
  // Score distribution — surfaces a bimodal evaluator (an empty Research band) at a glance.
  const scores = rows.map((r) => r.score).filter((s) => s != null)
  const dist = { apply: scores.filter((s) => s >= 4).length, research: scores.filter((s) => s >= 3.5 && s < 4).length, dont: scores.filter((s) => s < 3.5).length }
  console.log(color.dim('  ' + t('calibrate.dist', { ...dist, n: scores.length })))
  return { agreement: a, distribution: dist }
}
