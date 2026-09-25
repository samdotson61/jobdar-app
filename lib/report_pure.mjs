// Jobdar — the beta report builder (1.55.0, PURE — arrays/meta in, {data, md} out; no fs/config so
// serve and the apps can build it too). The report is the artifact a beta tester sends back: what the
// funnel did on their machine, what the evaluator decided, and where the human disagreed — WITHOUT any
// personal data. It carries pipeline aggregates, the would-apply answers, and the derived agreement
// rate; it never includes the résumé, the tester's name, or any profile field beyond region/level/tuning.

import { band as bandOf } from './bands.mjs'

const pct = (num, den) => (den ? Math.round((num / den) * 100) : 0)

// rows: pipeline rows · feedback: ledger rows · meta: { cliVersion, appVersion?, platform, backend,
// date, profile: { target_regions?, target_levels?, tuning_profile?, transferable_skills? } }
export function buildBetaReport({ rows = [], feedback = [], meta = {} } = {}) {
  const evaluated = rows.filter((r) => r.status && r.status !== 'scanned' && String(r.score || '').trim() !== '')
  const tracked = rows.filter((r) => r.status && r.status !== 'scanned' && r.status !== 'evaluated')
  const scanned = rows.filter((r) => r.status === 'scanned')
  const gone = evaluated.filter((r) => r.listing_state === 'gone')
  const alive = evaluated.filter((r) => r.listing_state !== 'gone')
  const bands = { apply: 0, research: 0, dont: 0 }
  for (const r of alive) if (bands[r.band] != null) bands[r.band]++
  const prescreened = scanned.filter((r) => String(r.prescreen || '').trim() !== '').length
  const bySource = { engine: 0, manual: 0, unknown: 0 }
  for (const r of evaluated) bySource[r.eval_source === 'engine' ? 'engine' : r.eval_source === 'manual' ? 'manual' : 'unknown']++

  const rated = feedback.filter((f) => f.url)
  const would = rated.filter((f) => f.would_apply === 'yes')
  const wouldNot = rated.filter((f) => f.would_apply === 'no')
  const up = rated.filter((f) => f.thumb === 'up').length
  const down = rated.filter((f) => f.thumb === 'down').length
  const scoredN = up + down
  const perBand = {}
  for (const b of ['apply', 'research', 'dont']) {
    const inBand = rated.filter((f) => f.band === b)
    perBand[b] = {
      rated: inBand.length,
      wouldApply: inBand.filter((f) => f.would_apply === 'yes').length,
      up: inBand.filter((f) => f.thumb === 'up').length,
      down: inBand.filter((f) => f.thumb === 'down').length,
    }
  }
  const disagreements = rated.filter((f) => f.thumb === 'down')

  const p = meta.profile || {}
  const data = {
    kind: 'jobdar-beta-report',
    version: 1,
    date: meta.date || '',
    cliVersion: meta.cliVersion || '',
    appVersion: meta.appVersion || '',
    platform: meta.platform || '',
    backend: meta.backend || '',
    profile: {
      regions: Array.isArray(p.target_regions) ? p.target_regions : [],
      levels: Array.isArray(p.target_levels) ? p.target_levels : [],
      tuning: p.tuning_profile || '',
      transferable: Boolean(p.transferable_skills),
    },
    funnel: {
      totalRows: rows.length,
      scanned: scanned.length,
      prescreened,
      evaluated: evaluated.length,
      evaluatedAlive: alive.length,
      listingsGone: gone.length,
      tracked: tracked.length,
      bands,
      evalSource: bySource,
    },
    ratings: {
      n: rated.length,
      wouldApply: would.length,
      wouldNot: wouldNot.length,
      agreementScored: scoredN,
      agreementUp: up,
      agreementDown: down,
      agreementPct: pct(up, scoredN),
      perBand,
    },
    ratedRoles: rated.map((f) => ({
      company: f.company || '',
      role: f.role || '',
      url: f.url,
      score: f.score !== '' && f.score != null ? Number(f.score) : null,
      band: f.band || (f.score !== '' && f.score != null ? bandOf(f.score) : ''),
      wouldApply: f.would_apply || '',
      thumb: f.thumb || '',
      date: f.date || '',
    })),
  }

  const line = (l = '') => l + '\n'
  let md = ''
  md += line(`# Jobdar beta report — ${data.date}`)
  md += line()
  md += line(`CLI ${data.cliVersion}${data.appVersion ? ` · app ${data.appVersion}` : ''} · ${data.platform} · backend: ${data.backend || 'unknown'}`)
  md += line(`Profile: regions ${data.profile.regions.join('/') || '—'} · levels ${data.profile.levels.join('/') || '—'} · tuning ${data.profile.tuning || '—'}${data.profile.transferable ? ' · transferable ON' : ''}`)
  md += line()
  md += line('## Funnel')
  md += line()
  md += line(`- ${data.funnel.totalRows} roles in the pipeline: ${data.funnel.scanned} discovered (${data.funnel.prescreened} prescreened), ${data.funnel.evaluated} scored, ${data.funnel.tracked} tracked past scoring`)
  md += line(`- Scored & still posted: ${data.funnel.evaluatedAlive} — Apply ${bands.apply} · Research ${bands.research} · Don't ${bands.dont}`)
  md += line(`- Listings verified no-longer-posted: ${data.funnel.listingsGone}`)
  md += line(`- Verdict provenance: ${bySource.engine} engine · ${bySource.manual} manual${bySource.unknown ? ` · ${bySource.unknown} pre-provenance` : ''}`)
  md += line()
  md += line('## What the tester said ("Would you apply?")')
  md += line()
  if (!rated.length) {
    md += line('_No roles were rated yet — the agreement section needs 👍/👎 answers on scored roles._')
  } else {
    md += line(`- ${data.ratings.n} roles rated: **${data.ratings.wouldApply} would-apply**, ${data.ratings.wouldNot} not-for-me`)
    md += line(`- Evaluator agreement (Apply/Don't verdicts only — Research answers are recorded but not scored): **${data.ratings.agreementUp}/${data.ratings.agreementScored} (${data.ratings.agreementPct}%)**`)
    for (const b of ['apply', 'research', 'dont']) {
      const x = perBand[b]
      if (x.rated) md += line(`  - ${b}: ${x.rated} rated, ${x.wouldApply} would-apply${b === 'research' ? ' (unscored band)' : `, ${x.up} agree / ${x.down} disagree`}`)
    }
    md += line()
    md += line('| Would apply? | Verdict | Score | Role |')
    md += line('|---|---|---|---|')
    for (const r of data.ratedRoles) {
      md += line(`| ${r.wouldApply === 'yes' ? '👍 yes' : r.wouldApply === 'no' ? '👎 no' : r.thumb === 'up' ? '✓ (verdict rated right)' : '✗ (verdict rated wrong)'} | ${r.band || '—'} | ${r.score != null ? r.score.toFixed(1) : '—'} | [${(r.company + ' — ' + r.role).replace(/[|[\]]/g, ' ').trim() || r.url}](${r.url}) |`)
    }
    if (disagreements.length) {
      md += line()
      md += line('### Where the evaluator was wrong (per the tester)')
      md += line()
      for (const f of disagreements) md += line(`- ${f.band || '?'} (${f.score || '?'}/5), tester said ${f.would_apply === 'yes' ? 'APPLY' : f.would_apply === 'no' ? "DON'T" : 'disagree'}: ${f.company} — ${f.role}`)
    }
  }
  md += line()
  md += line('## Honest limits')
  md += line()
  md += line('- Scores judge listing text against the résumé — the employer itself is not verified.')
  md += line('- Agreement below ~10 ratings is anecdote, not signal; band thresholds move on N≥50–100 labels.')
  md += line('- This report contains no résumé content and no personal data beyond region/level settings.')
  return { data, md }
}
