// Jobdar — `jobdar outreach`. The human-in-the-loop referral lever around lib/outreach.mjs:
//   jobdar outreach <url|company>                                people-finder links + cadence state
//   jobdar outreach --log --url <u> --person "Name" [...]        record a sent first contact
//   jobdar outreach --followup --url <u> --person "Name"         record the ONE polite follow-up
//   jobdar outreach --due                                        which follow-ups are ripe today
//   jobdar outreach --lint <file|-> [--channel ..] [--person ..] check a draft before sending
//   jobdar outreach --list                                       the full ledger
// Jobdar never scrapes LinkedIn and never sends a message — it generates search links, enforces the
// politeness cadence in code, and lints drafts. Sending is always the human, from their own account.

import { readFileSync } from 'node:fs'
import { loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline } from '../evaluations.mjs'
import {
  peopleFinderLinks, readOutreach, appendOutreach, canContact, canFollowup, dueFollowups, lintDraft, CADENCE,
} from '../outreach.mjs'
import { color, symbol, heading } from '../ui.mjs'

const today = () => new Date().toISOString().slice(0, 10)

function findRole(rows, needle) {
  if (!needle) return null
  const byUrl = rows.find((r) => r.url === needle)
  if (byUrl) return byUrl
  const n = needle.toLowerCase()
  return rows.find((r) => (r.company || '').toLowerCase().includes(n)) || null
}

export async function runOutreach(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  heading(t('outreach.title'))

  const ledger = readOutreach()

  // --lint: deterministic draft checks. Reads a file or stdin ('-'); exits 1 on problems.
  if (flags.lint) {
    const src = typeof flags.lint === 'string' && flags.lint !== '-' ? flags.lint : positionals[0] || '-'
    const text = src === '-' ? readFileSync(0, 'utf8') : readFileSync(src, 'utf8')
    const channel = typeof flags.channel === 'string' ? flags.channel : 'linkedin'
    const person = typeof flags.person === 'string' ? flags.person : ''
    const { ok, problems } = lintDraft(text, { channel, person })
    if (ok) {
      console.log(`  ${symbol.ok()} ${t('outreach.lint_ok', { channel })}`)
      return { ok: true }
    }
    for (const p of problems) console.log(`  ${symbol.fail()} ${t(`outreach.lint_${p.kind}`, p)}`)
    process.exitCode = 1
    return { ok: false, problems }
  }

  // --due: follow-ups ripe today + threads already closed (one follow-up sent → stop).
  if (flags.due) {
    const { due, closed } = dueFollowups(ledger, today())
    if (!due.length && !closed.length) {
      console.log(color.dim(t('outreach.due_none')))
      return { due: 0 }
    }
    for (const d of due) {
      console.log(`  ${symbol.ok()} ${t('outreach.due_line', { person: d.person, company: d.company, days: d.elapsed })}`)
    }
    for (const c of closed) {
      console.log(`  ${symbol.info()} ${color.dim(t('outreach.closed_line', { person: c.person, company: c.company }))}`)
    }
    return { due: due.length, closed: closed.length }
  }

  // --list: the ledger, oldest first.
  if (flags.list) {
    if (!ledger.length) {
      console.log(color.dim(t('outreach.list_empty')))
      return { count: 0 }
    }
    for (const e of ledger) {
      console.log(`  ${e.date}  ${e.kind === 'followup' ? '↻' : '→'} ${e.person} (${e.title || e.channel})  ${e.company}`)
    }
    return { count: ledger.length }
  }

  // --log / --followup: record a SENT message (the user already sent it themselves).
  if (flags.log || flags.followup) {
    const url = typeof flags.url === 'string' ? flags.url : positionals[0]
    const person = typeof flags.person === 'string' ? flags.person : ''
    if (!url || !person) {
      console.error(t('outreach.log_usage'))
      process.exitCode = 1
      return { logged: false }
    }
    const row = findRole(readPipeline(), url)
    const company = (row && row.company) || (typeof flags.company === 'string' ? flags.company : '')
    const entry = {
      company,
      url,
      person,
      title: typeof flags.title === 'string' ? flags.title : '',
      channel: typeof flags.channel === 'string' ? flags.channel : 'linkedin',
      kind: flags.followup ? 'followup' : 'contact',
      date: today(),
      note: typeof flags.note === 'string' ? flags.note : '',
    }
    if (flags.followup) {
      const verdict = canFollowup(ledger, { url, person, today: today() })
      if (!verdict.ok && verdict.reason === 'followed_up') {
        // The one-nudge rule is a hard stop — there is intentionally no --force for it.
        console.error(`  ${symbol.fail()} ${t('outreach.followup_stop', { person })}`)
        process.exitCode = 1
        return { logged: false, reason: verdict.reason }
      }
      if (!verdict.ok && verdict.reason === 'no_contact') {
        console.error(`  ${symbol.fail()} ${t('outreach.followup_no_contact', { person })}`)
        process.exitCode = 1
        return { logged: false, reason: verdict.reason }
      }
      if (!verdict.ok && verdict.reason === 'too_soon' && !flags.force) {
        console.error(`  ${symbol.warn()} ${t('outreach.followup_too_soon', { person, elapsed: verdict.elapsed, needed: verdict.needed })}`)
        process.exitCode = 1
        return { logged: false, reason: verdict.reason }
      }
    } else {
      const verdict = canContact(ledger, { url, person })
      if (!verdict.ok && !flags.force) {
        const msg = verdict.reason === 'duplicate_person'
          ? t('outreach.contact_duplicate', { person })
          : t('outreach.contact_cap', { max: CADENCE.maxContactsPerRole })
        console.error(`  ${symbol.warn()} ${msg}`)
        process.exitCode = 1
        return { logged: false, reason: verdict.reason }
      }
    }
    appendOutreach(entry)
    console.log(`  ${symbol.ok()} ${t(flags.followup ? 'outreach.followup_logged' : 'outreach.contact_logged', { person, company: company || url })}`)
    if (!flags.followup) console.log(color.dim('  ' + t('outreach.followup_reminder', { days: CADENCE.followupAfterBusinessDays })))
    return { logged: true, entry }
  }

  // Default: people-finder for a role. Links only — the user browses, picks a person, and pastes
  // the public headline into the outreach mode themselves. Nothing is fetched, nothing is stored.
  const needle = positionals[0] || (typeof flags.url === 'string' ? flags.url : '')
  const row = findRole(readPipeline(), needle)
  if (!row) {
    console.error(t('outreach.usage'))
    process.exitCode = 1
    return { found: false }
  }
  console.log(t('outreach.for_role', { role: row.role, company: row.company }))
  for (const link of peopleFinderLinks({ company: row.company, role: row.role })) {
    console.log(`\n  ${color.bold(t(`outreach.link_${link.kind}`))}\n  ${color.cyan(link.url)}`)
  }
  const contacts = ledger.filter((e) => e.url === row.url && e.kind === 'contact')
  console.log('\n' + t('outreach.cadence_state', { used: contacts.length, max: CADENCE.maxContactsPerRole }))
  for (const c of contacts) console.log(color.dim(`    → ${c.person} (${c.date})`))
  console.log(color.dim('\n  ' + t('outreach.privacy_note')))
  console.log(color.dim('  ' + t('outreach.next_steps')))
  return { found: true, links: 3, contacts: contacts.length }
}
