// Jobdar tests — the board ledger (the baseline scan's memory of every employer board).
// Run with `npm test`; `npm test -- board-ledger` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import greenhouse from '../providers/greenhouse.mjs'
import { advanceLedger, observationStatus, postedDay, parseTsv, serializeTsv, mergeRuns, LEDGER_COLS, TRUNCATION_CAP } from '../lib/board_ledger_pure.mjs'

// ——— Board ledger (the baseline scan's memory of every employer board) ———
const ledgerObs = (jobs, extra = {}) => ({ board: 'https://b.example/acme', employer: 'Acme', provider: 'greenhouse', ok: true, jobs, ...extra })
const ledgerJobs = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ url: `https://b.example/acme/${from + i}`, title: `Role ${from + i}`, location: 'Dayton, OH' }))

test('board ledger: a posting closes only on a complete look, dated between the two looks', () => {
  let s = advanceLedger({ rows: [], boards: [] }, [ledgerObs(ledgerJobs(3))], '2026-10-01')
  assert.equal(s.totals.added, 3)
  assert.equal(s.rows.every((r) => r.first_seen === '2026-10-01' && !r.gone_on && !r.last_seen), true)
  // a failed look closes nothing
  s = advanceLedger(s, [ledgerObs([], { ok: false, error: 'HTTP 503 ' })], '2026-10-02')
  assert.equal(s.totals.closed, 0)
  assert.equal(s.runs[0].status, 'failed')
  // role 0 is absent from the next complete look → closed, last seen at the previous complete look
  s = advanceLedger(s, [ledgerObs(ledgerJobs(2, 1))], '2026-10-03')
  const gone = s.rows.find((r) => r.url.endsWith('/0'))
  assert.equal(gone.gone_on, '2026-10-03')
  assert.equal(gone.last_seen, '2026-10-01')
  assert.equal(s.boards[0].last_ok, '2026-10-03')
})

test('board ledger: a returning posting is reopened and counted, never re-added', () => {
  let s = advanceLedger({ rows: [], boards: [] }, [ledgerObs(ledgerJobs(2))], '2026-10-01')
  s = advanceLedger(s, [ledgerObs(ledgerJobs(1))], '2026-10-02')
  s = advanceLedger(s, [ledgerObs(ledgerJobs(1))], '2026-10-03') // still absent on a second look → a real closure
  s = advanceLedger(s, [ledgerObs(ledgerJobs(2))], '2026-10-09')
  assert.equal(s.rows.length, 2)
  const back = s.rows.find((r) => r.url.endsWith('/1'))
  assert.equal(back.gone_on, '')
  assert.equal(back.reopens, '1')
  assert.equal(back.first_seen, '2026-10-01')
})

test('board ledger: missing from ONE look is a paging blip — restored, not counted as a repost', () => {
  let s = advanceLedger({ rows: [], boards: [] }, [ledgerObs(ledgerJobs(2))], '2026-10-01')
  s = advanceLedger(s, [ledgerObs(ledgerJobs(1))], '2026-10-02')
  assert.equal(s.rows.find((r) => r.url.endsWith('/1')).gone_on, '2026-10-02') // provisional
  s = advanceLedger(s, [ledgerObs(ledgerJobs(2))], '2026-10-03')
  const back = s.rows.find((r) => r.url.endsWith('/1'))
  assert.equal(back.gone_on, '')
  assert.equal(back.reopens, '')
  assert.equal(s.totals.reopened, 0)
})

test('board ledger: a truncated or suspiciously short listing never closes anything', () => {
  assert.equal(observationStatus({ ok: true, count: 2000, cap: 2000 }), 'partial') // only with a caller-supplied ceiling
  assert.equal(observationStatus({ ok: true, count: 12661 }), 'ok') // a whole-board read is complete however big
  assert.equal(TRUNCATION_CAP, Infinity)
  assert.equal(observationStatus({ ok: true, count: 4, prevCount: 40 }), 'partial')
  assert.equal(observationStatus({ ok: true, count: 30, prevCount: 40 }), 'ok')
  assert.equal(observationStatus({ ok: false, count: 0 }), 'failed')
  assert.equal(observationStatus({ ok: true, count: 30, prevCount: 30, incomplete: true }), 'partial')
  let s = advanceLedger({ rows: [], boards: [] }, [ledgerObs(ledgerJobs(20))], '2026-10-01')
  s = advanceLedger(s, [ledgerObs([...ledgerJobs(3), ...ledgerJobs(1, 99)])], '2026-10-02')
  assert.equal(s.runs[0].status, 'partial') // 4 after 20 = a suspiciously short read
  assert.equal(s.totals.closed, 0)
  assert.equal(s.totals.added, 1) // what a partial look DID see still counts
  assert.equal(s.boards[0].last_ok, '2026-10-01')
  // …but a second look that is just as short is believed: the board really shrank
  s = advanceLedger(s, [ledgerObs([...ledgerJobs(3), ...ledgerJobs(1, 99)])], '2026-10-03')
  assert.equal(s.runs[0].status, 'ok')
  assert.equal(s.totals.closed, 17)
  assert.equal(s.rows.find((r) => r.url.endsWith('/5')).last_seen, '2026-10-01')
})

test('board ledger: posting dates — ISO passes through, Workday text resolves, "30+" stays a bound', () => {
  assert.equal(postedDay('2026-06-01T08:00:00Z', '2026-10-05'), '2026-06-01')
  assert.equal(postedDay('Posted Today', '2026-10-05'), '2026-10-05')
  assert.equal(postedDay('Posted Yesterday', '2026-10-05'), '2026-10-04')
  assert.equal(postedDay('Posted 6 Days Ago', '2026-10-05'), '2026-09-29')
  assert.equal(postedDay('Posted 30+ Days Ago', '2026-10-05'), '<2026-09-05')
  assert.equal(postedDay(null, '2026-10-05'), '')
  // a later exact date replaces a bound; a bound never replaces an exact date
  let s = advanceLedger({ rows: [], boards: [] }, [ledgerObs([{ url: 'u1', title: 'A', postedOn: 'Posted 30+ Days Ago' }, { url: 'u2', title: 'B', postedOn: '2026-08-01' }])], '2026-10-05')
  s = advanceLedger(s, [ledgerObs([{ url: 'u1', title: 'A', postedOn: '2026-07-04' }, { url: 'u2', title: 'B', postedOn: 'Posted 30+ Days Ago' }])], '2026-10-06')
  assert.equal(s.rows.find((r) => r.url === 'u1').posted, '2026-07-04')
  assert.equal(s.rows.find((r) => r.url === 'u2').posted, '2026-08-01')
  // between two exact dates the earlier stands (a refreshed posting is not a newer one)
  s = advanceLedger(s, [ledgerObs([{ url: 'u1', title: 'A', postedOn: '2026-09-30' }, { url: 'u2', title: 'B', postedOn: '2025-12-01' }])], '2026-10-07')
  assert.equal(s.rows.find((r) => r.url === 'u1').posted, '2026-07-04')
  assert.equal(s.rows.find((r) => r.url === 'u2').posted, '2025-12-01')
})

test('board ledger: TSV round-trips and a same-day re-run replaces its own log lines', () => {
  const s = advanceLedger({ rows: [], boards: [] }, [ledgerObs([{ url: 'u1', title: 'Tab\there', location: 'X' }])], '2026-10-01')
  const back = parseTsv(serializeTsv(s.rows, LEDGER_COLS), LEDGER_COLS)
  assert.equal(back.length, 1)
  assert.equal(back[0].title, 'Tab here')
  const merged = mergeRuns(mergeRuns([], s.runs), s.runs)
  assert.equal(merged.length, 1)
})
