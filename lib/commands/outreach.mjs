// Jobfaro — `jobfaro outreach`. The human-in-the-loop referral lever around lib/outreach.mjs:
//   jobfaro outreach <url|company>                                people-finder links + cadence state
//   jobfaro outreach --log --url <u> --person "Name" [...]        record a sent first contact
//   jobfaro outreach --followup --url <u> --person "Name"         record the ONE polite follow-up
//   jobfaro outreach --due                                        which follow-ups are ripe today
//   jobfaro outreach --lint <file|-> [--channel ..] [--person ..] check a draft before sending
//   jobfaro outreach --list                                       the full ledger
// Jobfaro never scrapes LinkedIn and never sends a message — it generates search links, enforces the
// politeness cadence in code, and lints drafts. Sending is always the human, from their own account.

import { readFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, loadCv, paths, atomicWrite } from '../config.mjs'
import { createRadar } from '../progress.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline } from '../evaluations.mjs'
import { selectActive } from '../inference.mjs'
import { draftOutreach as engineDraftOutreach } from '../engine.mjs'
import { isExtractable } from '../docparse.mjs'
import { resolveJdSafe } from './_jd.mjs'
import {
  peopleFinderLinks, readOutreach, appendOutreach, canContact, canFollowup, dueFollowups, lintDraft, CADENCE,
} from '../outreach.mjs'
import { customizeKey, loadCustomize, getArtifact, effectiveDirectives, contentHash, recordVariant, writeCustomize } from '../customize_store.mjs'
import { color, symbol, heading } from '../ui.mjs'

const today = () => new Date().toISOString().slice(0, 10)
const slug = (s) => String(s || 'role').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'role'

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

  // --draft: model-drafted, GROUNDED outreach note (Phase 8f.2). Steerable with --instruct, low-temp,
  // gated through lintDraft. Drafting ≠ sending — this NEVER logs to the cadence ledger (use --log after).
  if (flags.draft) {
    const cv = loadCv()
    if (!cv.trim()) { console.log(color.yellow(t('outreach.no_cv'))); return { ok: false } }
    const person = typeof flags.person === 'string' ? flags.person : ''
    const channel = typeof flags.channel === 'string' ? flags.channel : 'linkedin'
    const jdFlag = typeof flags.jd === 'string' ? flags.jd : ''
    // `--draft <target>` parses as flags.draft='<target>' (a value-less flag eats the next token),
    // so honor a string-valued --draft as the target too — same pattern as eval's `--auto <url>`.
    const target = (typeof flags.draft === 'string' && flags.draft) || flags.url || flags.company || jdFlag || positionals[0] || ''
    if (!target) { console.log(color.yellow(t('outreach.draft_no_target'))); return { ok: false } }

    let role = typeof flags.role === 'string' ? flags.role : ''
    let company = typeof flags.company === 'string' ? flags.company : ''
    let url = typeof flags.url === 'string' ? flags.url : ''
    let jd = ''
    let jdFetchFailed = false
    if (jdFlag) { const d = await resolveJdSafe(jdFlag, t); jd = d.description; role = role || d.title || ''; jdFetchFailed = !d.ok }
    else {
      const row = findRole(readPipeline(), target)
      if (row) { role = role || row.role || ''; company = company || row.company || ''; url = url || row.url || ''; const d = await resolveJdSafe(row.url, t); jd = d.description; jdFetchFailed = !d.ok }
      else if (isExtractable(target) && existsSync(target)) { const d = await resolveJdSafe(target, t); jd = d.description; role = role || d.title || ''; jdFetchFailed = !d.ok }
    }

    const key = customizeKey({ url, company, role })
    const store = loadCustomize()
    const prevArt = getArtifact(store, key, 'outreach')
    const directives = effectiveDirectives(prevArt, { directive: typeof flags.instruct === 'string' ? flags.instruct : '', reset: !!flags.reset })
    const hash = contentHash(cv, jd, directives, `${channel}|${person}`)
    const unchanged = !!(prevArt && prevArt.hash === hash && !flags.reset)
    const base = slug(`${profile.name || 'outreach'}-${role || company || 'role'}`)
    const fileFor = (n) => path.join(paths.outputDir, `${base}-outreach-v${n}.md`)

    // Idempotency: same résumé + JD + directives + recipient/channel → nothing to regenerate.
    if (unchanged && !flags.revise && prevArt) {
      const f = fileFor(prevArt.variant)
      console.log(color.dim(t('outreach.draft_no_change', { variant: `v${prevArt.variant}` })))
      if (existsSync(f)) console.log(color.green(t('outreach.draft_written', { variant: `v${prevArt.variant}`, file: path.relative(process.cwd(), f) })))
      return { ok: true, variant: prevArt.variant, unchanged: true, file: f }
    }
    if (!jd) {
      if (!jdFetchFailed) console.log(color.yellow(t('outreach.draft_no_jd'))) // fetch failures already explained themselves
      process.exitCode = 1
      return { ok: false }
    }

    const active = await selectActive(profile)
    if (!active.up) { console.log(color.yellow(t('outreach.draft_backend_down', { reason: active.reason }))); return { ok: false } }

    // Cadence governs SENDING, not drafting — warn (never block) if the role's contact cap is already used.
    const cc = canContact(ledger, { url, person })
    if (!cc.ok) console.log(color.yellow('  ' + symbol.warn() + ' ' + t(cc.reason === 'duplicate_person' ? 'outreach.contact_duplicate' : 'outreach.contact_cap', { person, max: CADENCE.maxContactsPerRole })))

    if (directives.length) console.log(color.dim(t('tailor.directives_applied', { count: directives.length })))
    console.log(color.dim(t('outreach.draft_running', { role: role || target, backend: active.runtime || active.kind })))
    // One open-ended model call → the bouncing sweep + true elapsed time (no invented percent).
    const sweep = createRadar({ total: null })
    sweep.start(person ? `${person} · ${role || target}` : role || target)
    let r
    try {
      r = await engineDraftOutreach({ active, jd, cv, profile, role, company, person, channel, directives })
    } finally {
      sweep.stop()
    }
    if (!r.ok) { console.log(color.red(t('outreach.draft_failed'))); return { ok: false } }

    let variant, nextStore = null
    if (unchanged && flags.revise && prevArt) variant = prevArt.variant
    else { const rec = recordVariant(store, { key, url, role, company, artifact: 'outreach', directives, hash, dateStr: today() }); variant = rec.variant; nextStore = rec.store }

    mkdirSync(paths.outputDir, { recursive: true })
    const f = fileFor(variant)
    atomicWrite(f, `# Outreach — ${role}${company ? ' @ ' + company : ''}${person ? ' · ' + person : ''} (${channel})\n\n${r.message}\n`)
    if (nextStore) writeCustomize(nextStore)

    console.log('\n' + r.message)
    if (!r.lint.ok) for (const p of r.lint.problems) console.log(color.yellow(`  ${symbol.warn()} ${t(`outreach.lint_${p.kind}`, p)}`))
    if (directives.length) { console.log('\n' + color.dim(t('tailor.directives_list_header'))); directives.forEach((d, i) => console.log(color.dim(`  ${i + 1}. ${d}`))) }
    console.log('\n' + color.green(t('outreach.draft_written', { variant: `v${variant}`, file: path.relative(process.cwd(), f) })))
    console.log(color.dim('  ' + t('outreach.draft_send_hint')))
    return { ok: true, variant, file: f, lint: r.lint }
  }

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
