// Jobdar tests — dashboard, TUI, the pipeline TSV, résumé rendering, modes parity, states.
// Run with `npm test`; `npm test -- pipeline-ui` runs only this file.

import { test, ROOT } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { getT } from '../lib/i18n.mjs'
import greenhouse from '../providers/greenhouse.mjs'
import { resolveState, stateLabel, allStates } from '../lib/states.mjs'
import { renderDashboard, analyze } from '../lib/commands/dashboard.mjs'
import { renderTui, pipelineView } from '../lib/commands/tui.mjs'
import { mergeScanned, recordEval, serializePipeline, band, isEvaluated, isTracked, setStatus, pruneScanned } from '../lib/evaluations.mjs'
import { trackerRowsFrom } from '../lib/tracker.mjs'
import { cvToHtml, matchedKeywords } from '../lib/cv_render.mjs'

test('dashboard: renders config, pipeline (TUI parity), analytics charts + tracker', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry'] }
  const portals = [{ company: 'Enova', careers_url: 'https://job-boards.greenhouse.io/enova' }]
  const pipeline = [
    { company: 'Enova', role: 'Data Analyst I', location: 'Chicago, IL', score: '4.6', band: 'apply', status: 'evaluated', url: 'https://job-boards.greenhouse.io/enova/jobs/1' },
    { company: 'Hudl', role: 'Product Manager', location: 'Lincoln, NE', score: '', band: '', status: 'scanned', url: 'https://job-boards.greenhouse.io/hudl/jobs/2' },
  ]
  const catalog = [{ company: 'Enova', sector: 'fintech' }, { company: 'Hudl', sector: 'sports-tech' }]
  const en = renderDashboard(getT('en'), { profile, portals, pipeline, tracker: [], catalog, lang: 'en' })
  assert.ok(en.includes('Jobdar dashboard') && en.includes('Midwest') && en.includes('Enova') && en.includes('greenhouse'))
  assert.ok(en.includes('Data Analyst I') && en.includes('4.6')) // pipeline row — TUI parity
  assert.ok(en.includes('href="https://job-boards.greenhouse.io/enova/jobs/1"')) // role links to the posting
  assert.ok(en.includes('Analytics') && en.includes('<svg') && en.includes('Top companies') && en.includes('Pipeline funnel'))
  assert.ok(en.includes('By sector') && en.includes('By location')) // sector/region breakdown charts
  assert.ok(en.includes('id="pipe"') && en.includes('sessionStorage')) // client-side sortable columns
  const es = renderDashboard(getT('es'), { profile, portals: [], pipeline, tracker: [], catalog, lang: 'es' })
  assert.ok(es.includes('Panel de Jobdar') && es.includes('Analíticas') && es.includes('<svg') && es.includes('Por sector'))
})

test('dashboard: analyze() computes counts, funnel, companies, sectors + locations', () => {
  const pipeline = [
    { company: 'A', location: 'Chicago, IL', score: '4.5', band: 'apply', status: 'evaluated' },
    { company: 'A', location: 'Chicago, IL', score: '3.6', band: 'research', status: 'evaluated' },
    { company: 'B', location: 'Remote, USA', score: '', band: '', status: 'scanned' },
  ]
  const catalog = [{ company: 'A', sector: 'fintech' }, { company: 'B', sector: 'healthcare' }]
  const a = analyze(pipeline, [{ company: 'A', role: 'x', state: 'applied' }], catalog)
  assert.equal(a.total, 3)
  assert.equal(a.evaluated, 2)
  assert.equal(a.counts.apply, 1)
  assert.equal(a.counts.pending, 1)
  assert.equal(a.topCompanies[0].name, 'A') // most roles
  assert.equal(a.funnel.find((s) => s.label === 'applied').value, 1)
  assert.equal(a.sectors.find((s) => s.name === 'fintech').total, 2) // company→sector join from catalog
  assert.ok(a.sectors.find((s) => s.name === 'healthcare'))
  assert.ok(a.locations.find((l) => l.name === 'IL')) // "Chicago, IL" → IL
  assert.ok(a.locations.find((l) => l.name === 'Remote')) // "Remote, USA" → Remote
})

test('tui: evaluated roles show score + band; scanned roles read "pending eval"', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry', 'mid'] }
  const rows = [
    { company: 'Enova', role: 'Data Analyst I', location: 'Chicago, IL', score: '4.7', band: 'apply', status: 'evaluated', url: 'u1' },
    { company: 'Acme', role: 'Marketing Analyst', location: 'Austin, TX', score: '3.6', band: 'research', status: 'evaluated', url: 'u2' },
    { company: 'Globex', role: 'Software Engineer', location: 'Remote, USA', score: '', band: '', status: 'scanned', url: 'u3' },
  ]
  const out = renderTui(getT('en'), { profile, rows, lang: 'en', sort: 'score', filter: 'all', height: 24 })
  assert.ok(out.includes('Data Analyst I') && out.includes('4.7')) // evaluated shows its model score
  assert.ok(out.includes('Apply 1') && out.includes('Research 1') && out.includes('1 pending')) // counts incl pending
  assert.ok(out.includes('Software Engineer') && out.includes('pending')) // scanned role reads pending, not a score
  const pendingOnly = renderTui(getT('en'), { profile, rows, lang: 'en', filter: 'pending', height: 24 })
  assert.ok(pendingOnly.includes('Software Engineer') && !pendingOnly.includes('Data Analyst I')) // pending filter
  const applied = renderTui(getT('en'), { profile, rows, lang: 'en', filter: 'apply', height: 24 })
  assert.ok(applied.includes('Data Analyst I') && !applied.includes('Marketing Analyst')) // band filter
})

test('tui: position indicator, cursor highlight, and tracked-state rows', () => {
  const profile = { target_regions: ['midwest'], target_levels: ['entry'] }
  const rows = [
    { company: 'A', role: 'PM', location: 'Chicago, IL', score: '4.4', band: 'apply', status: 'applied', url: 'u1' },
    { company: 'B', role: 'Analyst', location: 'Columbus, OH', score: '', band: '', status: 'scanned', url: 'u2' },
  ]
  const out = renderTui(getT('en'), { profile, rows, lang: 'en', cursor: 0, height: 24 })
  assert.ok(out.includes('1–2 of 2')) // position indicator
  assert.ok(out.includes('\x1b[7m')) // cursor row is inverse-video highlighted
  assert.ok(out.includes('Applied')) // tracked status shows its state label, not a band
  const v = pipelineView(rows, { filter: 'pending' })
  assert.equal(v.length, 1) // shared view helper agrees with the filter
  assert.equal(v[0].url, 'u2')
})

test('pipeline: band maps a 0–5 model score to Apply / Research / Dont (empty → no band)', () => {
  assert.equal(band(4.2), 'apply')
  assert.equal(band(3.7), 'research')
  assert.equal(band(3.0), 'dont')
  assert.equal(band(''), '') // no score yet → no band (not "dont")
})

test('pipeline: scan writes DISCOVERED roles (status scanned, no score) — the tool does not score', () => {
  const discovered = [
    { company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL', postedOn: '2026-06-01T08:00:00Z' },
    { company: 'Hudl', title: 'Data Analyst', url: 'u2', location: 'Lincoln, NE' },
  ]
  const rows = mergeScanned([], discovered, '2026-06-05')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].status, 'scanned')
  assert.equal(rows[0].role, 'Product Manager')
  assert.equal(rows[0].score, '') // no score comes from scanning
  assert.equal(rows[0].band, '')
  assert.equal(rows[0].posted, '2026-06-01') // board posting date persisted (day precision)
  assert.equal(rows[0].first_seen, '2026-06-05') // when scan first found it
  assert.ok(!isEvaluated(rows[0]))
  // a later re-scan keeps the original first_seen
  const again = mergeScanned(rows, [{ company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' }], '2026-06-09')
  assert.equal(again.find((r) => r.url === 'u1').first_seen, '2026-06-05')
  assert.ok(serializePipeline(rows).startsWith('company\trole\turl'))
})

test('pipeline: status advances (applied), tracker derives from it, prune keeps your work', () => {
  let rows = mergeScanned([], [
    { company: 'A', title: 'PM', url: 'u1' },
    { company: 'B', title: 'Analyst', url: 'u2' },
    { company: 'C', title: 'Dev', url: 'u3' },
  ], '2026-06-05')
  rows = recordEval(rows, { url: 'u1', score: 4.4 }, '2026-06-06')
  rows = setStatus(rows, 'u1', 'applied', '2026-06-07')
  const u1 = rows.find((r) => r.url === 'u1')
  assert.equal(u1.status, 'applied')
  assert.ok(isTracked(u1))
  assert.equal(u1.score, 4.4) // score survives the status change
  // a later eval refresh must NOT demote the applied status
  rows = recordEval(rows, { url: 'u1', score: 4.6 }, '2026-06-08')
  assert.equal(rows.find((r) => r.url === 'u1').status, 'applied')
  // tracker = view over the pipeline
  const tracked = trackerRowsFrom(rows)
  assert.equal(tracked.length, 1)
  assert.equal(tracked[0].state, 'applied')
  // prune: u2 vanished from boards (scanned → dropped); u1 applied + u3 still listed → kept
  const { rows: kept, pruned } = pruneScanned(rows, new Set(['u3']))
  assert.equal(pruned, 1)
  assert.ok(kept.find((r) => r.url === 'u1') && kept.find((r) => r.url === 'u3'))
  assert.ok(!kept.find((r) => r.url === 'u2'))
  assert.equal(setStatus(rows, 'nope', 'applied', '2026-06-07'), null) // unknown URL → null
})

test('pipeline: eval records the model verdict (score + band), re-scan never clobbers it', () => {
  let rows = mergeScanned([], [{ company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' }], '2026-06-05')
  rows = recordEval(rows, { url: 'u1', score: 4.3, recommendation: 'strong PM fit' }, '2026-06-06')
  const u1 = rows.find((r) => r.url === 'u1')
  assert.equal(u1.status, 'evaluated')
  assert.equal(u1.score, 4.3)
  assert.equal(u1.band, 'apply') // derived from the score
  assert.equal(u1.recommendation, 'strong PM fit')
  assert.equal(u1.company, 'Enova') // discovery fields preserved
  assert.ok(isEvaluated(u1))
  // a later scan that re-discovers u1 must NOT wipe the model's verdict
  const after = mergeScanned(rows, [{ company: 'Enova', title: 'Product Manager', url: 'u1', location: 'Chicago, IL' }], '2026-06-07')
  const again = after.find((r) => r.url === 'u1')
  assert.equal(again.status, 'evaluated')
  assert.equal(again.score, 4.3)
})

test('pipeline: eval can score a URL that was never scanned (creates the row)', () => {
  const rows = recordEval([], { url: 'u9', company: 'X', role: 'PM', score: 3.6 }, '2026-06-06')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].band, 'research')
  assert.equal(rows[0].status, 'evaluated')
})

test('résumé: cvToHtml renders ATS HTML (name, sections, bullets) + role tailoring flag', () => {
  const md = '# Jane Doe\nDeveloper · jane@x.com\n## Experience\n### Data Analyst\n- Built **SQL** dashboards\n## Skills\n- Python, SQL'
  const html = cvToHtml(md, { role: 'Data Analyst', company: 'Enova', matched: ['sql', 'python'] })
  assert.ok(html.includes('<h1>Jane Doe</h1>') && html.includes('<h2>Experience</h2>'))
  assert.ok(html.includes('<li>Built <strong>SQL</strong> dashboards</li>'))
  assert.ok(html.includes('Tailored for') && html.includes('Enova') && html.includes('Relevant: sql, python'))
  assert.ok(html.includes('@page') && !html.includes('<table')) // ATS-safe: print CSS, no tables
})

test('résumé: matchedKeywords finds role terms present in the cv', () => {
  assert.deepEqual(matchedKeywords('Data Analyst SQL', 'experienced data analyst with sql and python').sort(), ['analyst', 'data', 'sql'])
})

test('modes: every base mode has a Spanish parity file', () => {
  const modesDir = path.join(ROOT, 'modes')
  const base = readdirSync(modesDir).filter((f) => f.endsWith('.md'))
  assert.ok(base.length >= 6, `expected the base modes, found ${base.length}`)
  const missing = base.filter((f) => !existsSync(path.join(modesDir, 'es', f)))
  assert.deepEqual(missing, [], `Spanish modes missing: ${missing.join(', ')}`)
})

test('states: Spanish + variant aliases resolve to canonical English IDs', () => {
  assert.equal(resolveState('postulado'), 'applied')
  assert.equal(resolveState('Applied'), 'applied')
  assert.equal(resolveState('aplicar'), 'applied')
  assert.equal(resolveState('entrevistando'), 'interviewing')
  assert.equal(resolveState('rechazado'), 'rejected')
  assert.equal(resolveState('evaluated'), 'evaluated')
  assert.equal(resolveState('garbage-not-a-state'), null)
})

test('states: labels are localized; IDs are stable lowercase English', () => {
  assert.equal(stateLabel('applied', 'en'), 'Applied')
  assert.equal(stateLabel('applied', 'es'), 'Postulado')
  assert.equal(stateLabel('unknown', 'es'), 'unknown')
  assert.ok(allStates().every((s) => s.id === s.id.toLowerCase()))
})
