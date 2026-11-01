// Jobdar tests — the referral lever.
// Run with `npm test`; `npm test -- outreach` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import lever from '../providers/lever.mjs'
import { baseRoleTitle, peopleFinderLinks, businessDaysBetween, canContact, canFollowup, dueFollowups, lintDraft } from '../lib/outreach.mjs'

// --- Outreach (the referral lever) ---

test('outreach: people-finder builds LinkedIn search links; manager search strips level tokens', () => {
  assert.equal(baseRoleTitle('Senior Data Analyst II'), 'Data Analyst')
  assert.equal(baseRoleTitle('Jr. Software Engineer'), 'Software Engineer')
  const links = peopleFinderLinks({ company: 'Acme Corp', role: 'Data Analyst I' })
  assert.equal(links.length, 3)
  assert.ok(links.every((l) => l.url.startsWith('https://www.linkedin.com/search/results/people/?keywords=')))
  assert.ok(decodeURIComponent(links[0].url).includes('"Acme Corp" recruiter'))
  assert.ok(decodeURIComponent(links[1].url).includes('"Data Analyst" manager'))
})

test('outreach: business days skip weekends', () => {
  assert.equal(businessDaysBetween('2026-06-05', '2026-06-08'), 1) // Fri → Mon
  assert.equal(businessDaysBetween('2026-06-08', '2026-06-12'), 4) // Mon → Fri same week
  assert.equal(businessDaysBetween('2026-06-12', '2026-06-12'), 0)
})

test('outreach: cadence — role cap of 2, one thread per person, follow-up ripe at 5 business days, then hard stop', () => {
  const ledger = [
    { url: 'u1', person: 'Ana Ruiz', kind: 'contact', date: '2026-06-01' },
    { url: 'u1', person: 'Bob Lee', kind: 'contact', date: '2026-06-02' },
  ]
  assert.equal(canContact(ledger, { url: 'u1', person: 'ana ruiz' }).reason, 'duplicate_person') // case-insensitive
  assert.equal(canContact(ledger, { url: 'u1', person: 'Cara Day' }).reason, 'role_cap')
  assert.ok(canContact(ledger, { url: 'u2', person: 'Cara Day' }).ok) // a different role is fine
  assert.equal(canFollowup(ledger, { url: 'u1', person: 'Nobody', today: '2026-06-12' }).reason, 'no_contact')
  assert.equal(canFollowup(ledger, { url: 'u1', person: 'Ana Ruiz', today: '2026-06-03' }).reason, 'too_soon')
  assert.ok(canFollowup(ledger, { url: 'u1', person: 'Ana Ruiz', today: '2026-06-12' }).ok) // ≥5 business days
  const after = [...ledger, { url: 'u1', person: 'Ana Ruiz', kind: 'followup', date: '2026-06-12' }]
  assert.equal(canFollowup(after, { url: 'u1', person: 'Ana Ruiz', today: '2026-07-01' }).reason, 'followed_up') // hard stop
  const { due, closed } = dueFollowups(after, '2026-06-12')
  assert.deepEqual(due.map((d) => d.person), ['Bob Lee'])
  assert.deepEqual(closed.map((c) => c.person), ['Ana Ruiz'])
})

test('outreach: draft lint catches empty, over-length, placeholders, and a missing recipient name', () => {
  assert.ok(lintDraft('Hi Ana — saw the Analyst I role at Acme. My SQL dashboards cut reporting time 40%. Open to a quick chat?', { channel: 'linkedin', person: 'Ana Ruiz' }).ok)
  assert.ok(lintDraft('', {}).problems.some((p) => p.kind === 'empty'))
  assert.ok(lintDraft('x'.repeat(301), { channel: 'linkedin' }).problems.some((p) => p.kind === 'too_long'))
  assert.ok(lintDraft('x'.repeat(301), { channel: 'email' }).ok) // email has no 300-char cap
  assert.ok(lintDraft('Hi {name}, about the role…', {}).problems.some((p) => p.kind === 'placeholder'))
  assert.ok(lintDraft('Hello! Great role at Acme.', { person: 'Ana Ruiz' }).problems.some((p) => p.kind === 'missing_name'))
})
