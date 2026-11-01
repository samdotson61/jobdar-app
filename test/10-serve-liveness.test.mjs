// Jobdar tests — the serve façade, regression fixes, 1.52 honesty, 1.53/1.60 liveness.
// Run with `npm test`; `npm test -- serve-liveness` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { getT } from '../lib/i18n.mjs'
import { ROOT as PKG_ROOT } from '../lib/config.mjs'
import greenhouse from '../providers/greenhouse.mjs'
import { assertAllowedUrl } from '../lib/http.mjs'
import { locationMatches } from '../lib/regions.mjs'
import { mergeScanned, recordEval, serializePipeline, parsePipeline, band, bandConflict, resolveAlias, recordListingChecks, markListingsFromScan } from '../lib/evaluations.mjs'
import { classifyFetchError, staleActionable, verifyBeforePresent } from '../lib/liveness.mjs'
import { extractCredential, extractField } from '../lib/prescreen.mjs'
import { businessDaysBetween, lintDraft } from '../lib/outreach.mjs'
import http from 'node:http'
import { markGoneIfDead } from '../lib/commands/eval.mjs'

test('serve: HTTP façade — auth gate, pipeline/profile/cv reads, tracker write, 404 (subprocess, env-isolated, no external net)', async () => {
  const { spawn } = await import('node:child_process')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-serve-'))
  const dataDir = path.join(home, 'data')
  const cfgDir = path.join(home, 'config')
  mkdirSync(dataDir, { recursive: true })
  mkdirSync(cfgDir, { recursive: true })
  writeFileSync(path.join(cfgDir, 'profile.yml'), 'name: Test User\ntarget_levels:\n  - entry\n  - mid\ntarget_regions:\n  - midwest\ninference: local\ninference_url: http://127.0.0.1:8080\n')
  const row = { company: 'Acme', role: 'Junior Analyst', url: 'https://acme.test/j/1', location: 'Chicago, IL', score: '', band: '', recommendation: '', status: 'scanned', posted: '2026-06-10', first_seen: '2026-06-12', updated: '2026-06-12', prescreen: '', screen_reason: '', pay: '', aliases: '' }
  writeFileSync(path.join(dataDir, 'pipeline.tsv'), serializePipeline([row]))
  writeFileSync(path.join(dataDir, 'cv.md'), '# Test User\n\nIT support specialist. Help desk, ticketing.\n')
  const PORT = 40000 + (process.pid % 20000)
  const TOKEN = 'test-tok-123'
  const base = `http://127.0.0.1:${PORT}`
  // 1.63.1: auth is Bearer-only — every call sends the header; a query-string token must be refused.
  const H = { authorization: `Bearer ${TOKEN}` }
  const f = (p, init = {}) => fetch(`${base}${p}`, { ...init, headers: { ...H, ...(init.headers || {}) } })
  const child = spawn(process.execPath, [path.join(PKG_ROOT, 'bin', 'jobdar'), 'serve', '--port', String(PORT), '--token', TOKEN], { env: { ...process.env, JOBDAR_HOME: home }, stdio: 'ignore' })
  try {
    let up = false
    for (let i = 0; i < 60 && !up; i++) {
      try {
        if ((await f(`/profile`)).status === 200) up = true
      } catch {
        /* not listening yet */
      }
      if (!up) await new Promise((r) => setTimeout(r, 150))
    }
    assert.ok(up, 'serve did not come up')
    assert.equal((await fetch(`${base}/pipeline`)).status, 401) // token required, none sent
    assert.equal((await fetch(`${base}/pipeline?token=${TOKEN}`)).status, 401) // 1.63.1: ?token= no longer accepted (it leaks into logs/history)
    // 1.63.1 DNS-rebinding guard: a loopback bind answers loopback Host values only (CORS can't stop a
    // same-origin-after-rebind page, but its requests carry the attacker's hostname).
    const { request } = await import('node:http')
    const rawStatus = (hostHeader) => new Promise((resolve, reject) => {
      const rq = request({ host: '127.0.0.1', port: PORT, path: '/pipeline', headers: { host: hostHeader, ...H } }, (rs) => { rs.resume(); resolve(rs.statusCode) })
      rq.on('error', reject)
      rq.end()
    })
    assert.equal(await rawStatus('evil.example'), 421)
    assert.equal(await rawStatus('evil.example:' + PORT), 421)
    assert.equal(await rawStatus('localhost:' + PORT), 200)
    assert.equal(await rawStatus('[::1]:' + PORT), 200)
    const pj = await (await f(`/pipeline`)).json()
    assert.equal(pj.count, 1)
    assert.equal(pj.rows[0].url, 'https://acme.test/j/1')
    assert.equal(pj.rows[0].status, 'scanned')
    const prof = await (await f(`/profile`)).json()
    assert.deepEqual(prof.target_levels, ['entry', 'mid'])
    assert.equal(prof.inference_url, undefined) // secrets/impl details never leave
    // POST /profile persists whitelisted identity fields; secrets in the body are ignored, not written
    const profPost = await (await f(`/profile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Alex Rivera', target_regions: ['west'], target_levels: ['mid'], target_salary: 90000, needs_sponsorship: true, inference_url: 'http://evil', api_key: 'sekret' }) })).json()
    assert.equal(profPost.ok, true)
    const prof2 = await (await f(`/profile`)).json()
    assert.equal(prof2.name, 'Alex Rivera')
    assert.deepEqual(prof2.target_levels, ['mid'])
    assert.equal(prof2.target_salary, 90000)
    assert.equal(prof2.needs_sponsorship, true) // the sponsorship toggle persists like the other identity fields
    assert.equal(prof2.inference_url, undefined) // the inference_url in the POST body was NOT accepted/returned
    const cvj = await (await f(`/cv`)).json()
    assert.ok(cvj.loaded && cvj.content.includes('IT support'))
    const ts = await (await f(`/tracker/set`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', status: 'applied' }) })).json()
    assert.equal(ts.ok, true)
    const after = await (await f(`/pipeline`)).json()
    assert.equal(after.rows[0].status, 'applied') // real pipeline.tsv mutation persisted
    // security: /import refuses a path outside the jobdar home (arbitrary-file-read fix)
    assert.equal((await f(`/import`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: '/etc/passwd' }) })).status, 403)
    // security: CORS is NOT reflected for a public origin, but IS for a localhost origin (reflective-CORS fix)
    assert.equal((await f(`/pipeline`, { headers: { origin: 'https://evil.example.com' } })).headers.get('access-control-allow-origin'), null)
    assert.equal((await f(`/pipeline`, { headers: { origin: 'http://localhost:8799' } })).headers.get('access-control-allow-origin'), 'http://localhost:8799')
    // /tracker/set rejects an unknown status (taxonomy validation → no demote-to-scanned data loss)
    assert.equal((await f(`/tracker/set`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', status: 'not-a-real-status' }) })).status, 400)
    // POST /cv persists the GUI's résumé so scan/prescreen/eval judge against the same text
    assert.equal((await (await f(`/cv`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: '# New CV\n\nMarketing coordinator, campaigns and analytics.' }) })).json()).ok, true)
    assert.ok((await (await f(`/cv`)).json()).content.includes('Marketing coordinator'))
    // /search/parse works without a backend (deterministic keyword fallback) — search must never 503
    const sp = await (await f(`/search/parse`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ intent: 'junior data analyst, midwest' }) })).json()
    assert.equal(sp.ok, true)
    assert.ok(Array.isArray(sp.keywords) && sp.keywords.includes('analyst'))
    // /import/upload parses uploaded bytes, sanitizes the name (no path traversal), and persists the text
    const upRes = await (await f(`/import/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: '../../evil name.txt', base64: Buffer.from('# Uploaded Person\n\nMarketing analyst with SQL and dashboards.').toString('base64') }) })).json()
    assert.equal(upRes.ok, true)
    assert.ok(upRes.name && !upRes.name.includes('/') && !upRes.name.includes('..')) // file name sanitized
    assert.ok(upRes.text.includes('Marketing analyst'))
    assert.ok(upRes.fields && typeof upRes.fields === 'object') // identity fields returned so the app can seed the profile
    assert.ok((await (await f(`/cv`)).json()).content.includes('Marketing analyst')) // persisted as the active résumé
    // POST /eval/feedback records a thumbs verdict-rating; GET reports the agreement the calibrator reads
    assert.equal((await f(`/eval/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', thumb: 'bogus' }) })).status, 400) // thumb must be up|down
    assert.equal((await (await f(`/eval/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', thumb: 'up', band: 'apply', score: 4.4, role: 'Junior Analyst' }) })).json()).ok, true)
    await f(`/eval/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/2', thumb: 'down', band: 'dont', score: 2.1 }) })
    const fb = await (await f(`/eval/feedback`)).json()
    assert.equal(fb.n, 2); assert.equal(fb.up, 1); assert.equal(fb.down, 1); assert.equal(fb.agreement, 50)
    await f(`/eval/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://acme.test/j/1', thumb: 'down' }) }) // change of mind → de-dup by url, not a new row
    const fb2 = await (await f(`/eval/feedback`)).json()
    assert.equal(fb2.n, 2); assert.equal(fb2.down, 2) // still 2 rows, the flipped one replaced
    assert.equal((await f(`/nope`)).status, 404)
  } finally {
    child.kill('SIGKILL')
    rmSync(home, { recursive: true, force: true })
  }
})

test('fix: prescreen — "controller" alone is not accounting; a soft-then-required credential still gates', () => {
  assert.equal(extractField('Quality Controller'), null) // not a hard-identity accounting role
  assert.equal(extractField('Air Traffic Controller'), null)
  assert.equal(extractField('Financial Controller').field, 'accounting') // genuine accounting still gated
  assert.equal(extractField('Comptroller').field, 'accounting')
  // first-mention "preferred" must NOT mask a later "required" credential ask
  assert.equal(extractCredential('CPA preferred but not necessary. An active CPA license is required for this role.').gate, 'required')
  assert.equal(extractCredential('CPA is a plus.').gate, 'none') // soft-only never gates
})

test('fix: regions — Washington DC is Northeast not West; ambiguous OR/IN aren\'t misread as states', () => {
  assert.equal(locationMatches('Washington, DC', ['northeast']), true)
  assert.equal(locationMatches('Washington, DC', ['west']), false) // not Washington state
  assert.equal(locationMatches('ONSITE OR HYBRID, Dallas', ['southwest']), true) // OR≠Oregon; Dallas→TX
  assert.equal(locationMatches('IN-PERSON role, Phoenix', ['southwest']), true) // IN≠Indiana; Phoenix→AZ
  assert.equal(locationMatches('IN-PERSON role, Phoenix', ['midwest']), false) // proves IN wasn't read as Indiana
})

test('fix: outreach — businessDaysBetween is DST-immune (UTC); lintDraft catches [email] sentinel', () => {
  assert.equal(businessDaysBetween('2026-03-05', '2026-03-11'), 4) // spring-forward week: Fri,Mon,Tue,Wed = 4 (was 5)
  assert.equal(businessDaysBetween('2026-06-01', '2026-06-08'), 5) // a normal Mon→Mon week
  assert.equal(lintDraft('Hi Ana, reach me at [email] to chat.', { person: 'Ana' }).ok, false)
})

test('fix: http — assertAllowedUrl refuses private/loopback/metadata hosts even if the allowlist matches', () => {
  assert.throws(() => assertAllowedUrl('https://169.254.169.254/latest/meta-data/', { hostAllowlist: [/^169\.254\.169\.254$/] }))
  assert.throws(() => assertAllowedUrl('https://127.0.0.1/x', { hostAllowlist: [/^127\.0\.0\.1$/] }))
  assert.throws(() => assertAllowedUrl('https://10.0.0.5/x', { hostAllowlist: [/.*/] }))
  assert.ok(assertAllowedUrl('https://boards.greenhouse.io/acme', { hostAllowlist: [/greenhouse\.io$/] })) // public host still allowed
})

test('fix: pipeline — comma-containing alias URLs resolve; recordEval guards a non-numeric score', () => {
  const rows = mergeScanned([], [
    { company: 'Acme', title: 'Analyst', url: 'https://x.test/clean', location: 'Chicago, IL' },
    { company: 'Acme', title: 'Analyst', url: 'https://x.test/j?loc=us,ca,tx', location: 'Chicago, IL' }, // alias w/ commas
  ], '2026-06-16')
  const survivor = rows.find((r) => r.url === 'https://x.test/clean')
  assert.equal(survivor.aliases, 'https://x.test/j?loc=us,ca,tx') // stored intact (space delimiter, not split on comma)
  assert.equal(resolveAlias(rows, 'https://x.test/j?loc=us,ca,tx'), 'https://x.test/clean') // resolves despite commas
  const base = [{ url: 'u1', company: 'A', role: 'R', location: '', status: 'scanned', score: '', band: '', recommendation: '', first_seen: '2026-06-16' }]
  const bad = recordEval(base, { url: 'u1', score: undefined }, '2026-06-16').find((r) => r.url === 'u1')
  assert.equal(bad.score, '') // never the literal "NaN"
  assert.notEqual(bad.status, 'evaluated') // an invalid score leaves the row un-evaluated
  const good = recordEval(base, { url: 'u1', score: 4.2 }, '2026-06-16').find((r) => r.url === 'u1')
  assert.equal(good.score, 4.2)
  assert.equal(good.status, 'evaluated')
})

test('1.52.0 honesty: bandConflict — an explicit band may only agree with its score', () => {
  assert.deepEqual(bandConflict(4.2, 'apply'), { derived: 'apply', conflict: false })
  assert.deepEqual(bandConflict(1.0, 'apply'), { derived: 'dont', conflict: true }) // the false-confidence combo
  assert.deepEqual(bandConflict(3.7, 'dont'), { derived: 'research', conflict: true })
  assert.deepEqual(bandConflict(3.7, ''), { derived: 'research', conflict: false }) // no explicit band → derive
  assert.deepEqual(bandConflict(3.7, 'bogus'), { derived: 'research', conflict: false }) // non-band strings never block
})

test('1.52.0 provenance: recordEval persists eval_source; blank keeps the prior value', () => {
  const base = [{ url: 'u1', company: 'A', role: 'R', location: '', status: 'scanned', score: '', band: '', recommendation: '', first_seen: '2026-08-28', eval_source: '' }]
  const manual = recordEval(base, { url: 'u1', score: 4.2, source: 'manual' }, '2026-08-28').find((r) => r.url === 'u1')
  assert.equal(manual.eval_source, 'manual')
  const engine = recordEval([manual], { url: 'u1', score: 4.4, source: 'engine' }, '2026-08-28').find((r) => r.url === 'u1')
  assert.equal(engine.eval_source, 'engine') // a re-eval refreshes provenance
  const keep = recordEval([engine], { url: 'u1', score: 4.5 }, '2026-08-28').find((r) => r.url === 'u1')
  assert.equal(keep.eval_source, 'engine') // no source stated → keep what the row had
  // Older pipeline files (no eval_source column) read as '' and round-trip without corruption.
  const parsed = parsePipeline('company\trole\turl\tscore\nA\tR\tu1\t4.2\n')
  assert.equal(parsed[0].eval_source, '')
})

test('1.53.0 liveness: classifyFetchError — only a positive 403/404/410 board answer means gone', () => {
  assert.equal(classifyFetchError('HTTP 404 for https://x.test/j'), 'gone')
  assert.equal(classifyFetchError('HTTP 403 for https://x.wd5.myworkdayjobs.com/x'), 'gone') // Workday CXS unposted
  assert.equal(classifyFetchError('HTTP 410 for https://x.test/j'), 'gone')
  assert.equal(classifyFetchError('HTTP 500 for https://x.test/j'), 'unknown') // a broken board proves nothing
  assert.equal(classifyFetchError('fetch failed: ECONNREFUSED'), 'unknown')
  assert.equal(classifyFetchError(''), 'unknown')
})

test('1.60.0 verify-before-present: staleActionable picks only actionable rows without a same-day check', () => {
  const today = '2026-08-31'
  const base = { url: 'u', score: '4.4', band: 'apply', status: 'evaluated' }
  const rows = [
    { ...base, url: 'a' }, // never checked → stale
    { ...base, url: 'b', checked: '2026-08-30' }, // yesterday → stale (fresh = same-day)
    { ...base, url: 'c', checked: '2026-08-31' }, // today → fresh
    { ...base, url: 'd', checked: 'garbage' }, // unparsable → stale
    { ...base, url: 'e', band: 'research' }, // research is actionable too → stale
    { ...base, url: 'f', band: 'dont' }, // not actionable
    { ...base, url: 'g', listing_state: 'gone' }, // already gone → nothing to verify
    { ...base, url: 'h', status: 'applied' }, // tracked → user already acted
    { ...base, url: 'i', score: '', status: 'scanned' }, // not evaluated
  ]
  assert.deepEqual(staleActionable(rows, today).map((r) => r.url), ['a', 'b', 'd', 'e'])
  // Widening the window keeps yesterday's check fresh.
  assert.deepEqual(staleActionable(rows, today, 2).map((r) => r.url), ['a', 'd', 'e'])
})

test('1.60.0 verify-before-present: probes stale rows, persists only positive verdicts, unknown proves nothing', async () => {
  const rows = [
    { url: 'live1', score: '4.4', band: 'apply', status: 'evaluated' },
    { url: 'dead1', score: '4.8', band: 'apply', status: 'evaluated' },
    { url: 'down1', score: '4.1', band: 'research', status: 'evaluated' },
    { url: 'fresh1', score: '4.4', band: 'apply', status: 'evaluated', checked: '2026-08-31' },
  ]
  const states = { live1: { state: 'live' }, dead1: { state: 'gone' }, down1: { state: 'unknown', error: 'ECONNREFUSED' } }
  const persisted = []
  const s = await verifyBeforePresent({
    rows,
    todayStr: '2026-08-31',
    delayMs: 0,
    probe: async (url) => states[url],
    persist: (checks, date) => persisted.push({ checks, date }),
  })
  assert.equal(s.probed, 3) // fresh1 untouched
  assert.equal(s.gone, 1)
  assert.equal(s.live, 1)
  assert.equal(s.unknown, 1)
  assert.deepEqual(s.goneRoles.map((r) => r.url), ['dead1'])
  assert.deepEqual(persisted, [{ checks: [{ url: 'live1', state: 'live' }, { url: 'dead1', state: 'gone' }], date: '2026-08-31' }])
  // Nothing stale → zero probes, zero writes.
  const s2 = await verifyBeforePresent({ rows: [rows[3]], todayStr: '2026-08-31', probe: async () => ({ state: 'gone' }), persist: () => assert.fail('no write expected') })
  assert.equal(s2.probed, 0)
})

test('1.59.1 fix: auto-eval marks dead-board fetch failures gone (queue stops re-serving corpses)', () => {
  const t = getT('en')
  const writes = []
  const lines = []
  const persist = (checks, date) => writes.push({ checks, date })
  const say = (l) => lines.push(l)
  const row = { url: 'https://x.wd5.myworkdayjobs.com/S/job/City/Role_R-1', company: 'Acme', role: 'Analyst' }
  // A positive board 403/404/410 → marked gone, honest line printed.
  assert.equal(markGoneIfDead(new Error('HTTP 403 for https://x.wd5.myworkdayjobs.com/...'), row, '2026-08-31', t, say, persist), true)
  assert.deepEqual(writes, [{ checks: [{ url: row.url, state: 'gone' }], date: '2026-08-31' }])
  assert.ok(lines[0].includes('no longer posted') && lines[0].includes('Acme'))
  // A broken board/network proves nothing → no write, ordinary skip path.
  assert.equal(markGoneIfDead(new Error('fetch failed: ECONNREFUSED'), row, '2026-08-31', t, say, persist), false)
  assert.equal(markGoneIfDead(new Error('HTTP 500 for https://x.test/j'), row, '2026-08-31', t, say, persist), false)
  assert.equal(writes.length, 1)
})

test('1.53.0 liveness: recordListingChecks stamps live/gone + date; unknown is never recorded; aliases resolve', () => {
  const rows = [
    { url: 'u1', status: 'evaluated', score: 4.5, band: 'apply', aliases: '', listing_state: '', checked: '' },
    { url: 'u2', status: 'evaluated', score: 4.1, band: 'apply', aliases: 'u2b', listing_state: '', checked: '' },
    { url: 'u3', status: 'evaluated', score: 3.7, band: 'research', aliases: '', listing_state: 'live', checked: '2026-08-01' },
  ]
  const { rows: out, applied } = recordListingChecks(rows, [
    { url: 'u1', state: 'gone' },
    { url: 'u2b', state: 'live' }, // check on an absorbed alias lands on the survivor
    { url: 'u3', state: 'unknown' }, // must be ignored even if a caller passes it
  ], '2026-08-28')
  assert.equal(applied, 2)
  assert.deepEqual(out.map((r) => [r.listing_state, r.checked]), [['gone', '2026-08-28'], ['live', '2026-08-28'], ['live', '2026-08-01']])
})

test('1.53.0 liveness: markListingsFromScan is host-scoped — full board in, filtered-out roles stay live', () => {
  const rows = [
    { url: 'https://boards.a.test/j/1', status: 'evaluated', band: 'apply', aliases: '', listing_state: '', checked: '' }, // still on board
    { url: 'https://boards.a.test/j/2', status: 'evaluated', band: 'apply', aliases: '', listing_state: '', checked: '' }, // vanished from board
    { url: 'https://boards.b.test/j/9', status: 'applied', aliases: '', listing_state: '', checked: '' }, // host NOT scanned → untouched
    { url: 'https://boards.a.test/j/3', status: 'scanned', aliases: '', listing_state: '', checked: '' }, // scanned rows are prune's job
  ]
  // The active set is the PRE-FILTER board list: j/1 is on it even if level/region toggles filtered it
  // from this scan's kept list — that's why scan.mjs passes allSeen, not allKept (a filtered-but-posted
  // role must never be marked gone).
  const active = new Set(['https://boards.a.test/j/1', 'https://boards.a.test/j/77'])
  const { rows: out, live, gone } = markListingsFromScan(rows, active, '2026-08-28')
  assert.equal(live, 1)
  assert.equal(gone, 1)
  assert.deepEqual(out.map((r) => r.listing_state), ['live', 'gone', '', ''])
  assert.equal(out[1].checked, '2026-08-28')
})
