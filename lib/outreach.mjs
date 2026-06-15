// Jobdar — outreach engine (the referral lever). Deterministic core for polite, professional
// recruiter/hiring-manager contact around a tracked role:
//   • people-finder: LinkedIn people-search LINKS the user clicks themselves — Jobdar NEVER scrapes
//     LinkedIn or automates a browser there (ToS + the politeness bar), and it never sends anything.
//   • cadence ledger: every sent message is logged here, and the rules are enforced by code, not
//     vibes — max 2 people per role, one follow-up per person after ≥5 business days, hard stop after.
//   • draft lint: deterministic checks (length, leftover {placeholders}, recipient name) before a
//     model-drafted note ever reaches a human recipient.
// Privacy: the ledger stores name/title/channel/date ONLY. Pasted profile text is for the draft in
// front of you and is never written to disk (modes/outreach.md carries the same rule for the model).

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths, atomicWrite } from './config.mjs'
import { callBackend } from './inference.mjs'
import { stripPII, parseEvalJson } from './eval_engine.mjs'
import { directiveBlock } from './tailor.mjs'

export const CADENCE = {
  maxContactsPerRole: 2, // people contacted per role — beyond this reads as pestering the company
  followupAfterBusinessDays: 5,
  maxFollowupsPerPerson: 1, // one polite nudge, then stop. Hard rule — no override flag exists.
}

// --- People-finder links (deterministic; the human does the browsing and choosing) ---

export function linkedinPeopleSearchUrl(keywords) {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}`
}

// "Senior Data Analyst II" → "Data Analyst" — strip level tokens so the hiring-manager search targets
// the function, not the rung.
export function baseRoleTitle(title) {
  return String(title || '')
    .replace(/\b(senior|junior|staff|lead|principal|entry[- ]level|associate|trainee|apprentice|intern|graduate|new grad)\b/gi, ' ')
    .replace(/\b(sr|jr)\.?(?=\s|$)/gi, ' ') // lookahead consumes the abbreviation's dot too
    .replace(/\b(i{1,3}|iv|v)\b\.?$/i, ' ')
    .replace(/[,–-]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function peopleFinderLinks({ company, role }) {
  const base = baseRoleTitle(role)
  const links = [
    { kind: 'recruiters', url: linkedinPeopleSearchUrl(`"${company}" recruiter OR "talent acquisition"`) },
    { kind: 'hiring_manager', url: linkedinPeopleSearchUrl(`"${company}" ${base ? `"${base}" ` : ''}manager`) },
    { kind: 'company_people', url: linkedinPeopleSearchUrl(`"${company}"`) },
  ]
  return links
}

// --- Business-day math (Mon–Fri; no holiday table — a day late is politer than a day early) ---

export function businessDaysBetween(fromIso, toIso) {
  const from = new Date(fromIso)
  const to = new Date(toIso)
  if (!(from < to)) return 0
  let count = 0
  const d = new Date(from)
  while (d < to) {
    d.setDate(d.getDate() + 1)
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
  }
  return count
}

// --- The ledger (data/outreach.tsv) ---

const FILE = path.join(paths.dataDir, 'outreach.tsv')
export const OUTREACH_COLS = ['company', 'url', 'person', 'title', 'channel', 'kind', 'date', 'note']

export function readOutreach() {
  if (!existsSync(FILE)) return []
  const lines = readFileSync(FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return []
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row = {}
    header.forEach((h, i) => (row[h] = cells[i] ?? ''))
    for (const c of OUTREACH_COLS) if (!(c in row)) row[c] = ''
    return row
  })
}

export function appendOutreach(entry) {
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\n]/g, ' ')
  mkdirSync(paths.dataDir, { recursive: true })
  const rows = [...readOutreach(), entry]
  const out = [OUTREACH_COLS.join('\t'), ...rows.map((r) => OUTREACH_COLS.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n'
  atomicWrite(FILE, out)
  return entry
}

// --- Cadence rules (pure: ledger rows in, verdicts out) ---

const samePerson = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// May the user contact ONE MORE person about this role? (cap + duplicate check)
export function canContact(entries, { url, person }) {
  const forRole = (entries || []).filter((e) => e.url === url && e.kind === 'contact')
  if (forRole.some((e) => samePerson(e.person, person))) {
    return { ok: false, reason: 'duplicate_person' }
  }
  if (forRole.length >= CADENCE.maxContactsPerRole) {
    return { ok: false, reason: 'role_cap', count: forRole.length }
  }
  return { ok: true }
}

// May the user follow up with this person about this role today?
export function canFollowup(entries, { url, person, today }) {
  const mine = (entries || []).filter((e) => e.url === url && samePerson(e.person, person))
  const contact = mine.find((e) => e.kind === 'contact')
  if (!contact) return { ok: false, reason: 'no_contact' }
  const followups = mine.filter((e) => e.kind === 'followup')
  if (followups.length >= CADENCE.maxFollowupsPerPerson) return { ok: false, reason: 'followed_up' } // hard stop
  const elapsed = businessDaysBetween(contact.date, today)
  if (elapsed < CADENCE.followupAfterBusinessDays) {
    return { ok: false, reason: 'too_soon', elapsed, needed: CADENCE.followupAfterBusinessDays }
  }
  return { ok: true, elapsed }
}

// Contacts whose ONE polite follow-up is ripe today (≥5 business days, none sent yet), plus the
// closed list (follow-up already sent → the thread is done; stop).
export function dueFollowups(entries, today) {
  const due = []
  const closed = []
  const contacts = (entries || []).filter((e) => e.kind === 'contact')
  for (const c of contacts) {
    const verdict = canFollowup(entries, { url: c.url, person: c.person, today })
    if (verdict.ok) due.push({ ...c, elapsed: verdict.elapsed })
    else if (verdict.reason === 'followed_up') closed.push(c)
  }
  return { due, closed }
}

// --- Draft lint (deterministic checks before any draft reaches a recipient) ---

export const LINKEDIN_NOTE_MAX = 300

export function lintDraft(text, { channel = 'linkedin', person = '' } = {}) {
  const problems = []
  const body = String(text || '').trim()
  if (!body) problems.push({ kind: 'empty' })
  if (channel === 'linkedin' && body.length > LINKEDIN_NOTE_MAX) {
    problems.push({ kind: 'too_long', length: body.length, max: LINKEDIN_NOTE_MAX })
  }
  const placeholder = body.match(/\{[a-z0-9_ ]+\}|\[(?:name|company|role)[^\]]*\]/i)
  if (placeholder) problems.push({ kind: 'placeholder', quote: placeholder[0] })
  if (person) {
    const first = String(person).trim().split(/\s+/)[0]
    if (first && !body.toLowerCase().includes(first.toLowerCase())) {
      problems.push({ kind: 'missing_name', person: first })
    }
  }
  return { ok: problems.length === 0, problems }
}

// --- Model-drafted outreach (Phase 8f.2) — grounded, steerable, low-temp, gated through lintDraft ---
// Mirrors lib/tailor.mjs tailorRole: guaranteed-JSON on capable local backends so even a 2B stays
// GROUNDED (one real fit reason from the résumé + one ask), `directives` steer tone/length (never facts),
// temperature 0 so the same inputs reproduce the same note, and a deterministic lint pass guards what a
// human would send. Drafting is NOT sending — the cadence ledger is only touched by `--log`.

export const OUTREACH_SYSTEM =
  'You draft ONE short, professional outreach note from a job-seeker to a specific person at a company ' +
  'about a specific role, using ONLY facts in the candidate’s résumé — NEVER invent employers, titles, ' +
  'dates, skills, or metrics. The note MUST: address the recipient by their FIRST name; name the role and ' +
  'company; give exactly ONE concrete, real reason the candidate fits (from the résumé); make ONE clear, ' +
  'low-pressure ask (a brief chat, or to be pointed to the right person); stay warm, specific, and concise. ' +
  'No [placeholders]. Reply ONLY with the JSON {"message": "..."}.'

function outreachSystem(channel) {
  return OUTREACH_SYSTEM + (channel === 'linkedin' ? ` Keep the message under ${LINKEDIN_NOTE_MAX} characters (a LinkedIn connection note).` : '')
}

export function buildOutreachUser({ jd = '', cv = '', profile = {}, role = '', company = '', person = '', channel = 'linkedin' }) {
  return (
    `CHANNEL: ${channel}\nRECIPIENT: ${person || 'the recipient'}\n` +
    `ROLE: ${role || 'the role'}${company ? ' @ ' + company : ''}\n\n` +
    `JOB DESCRIPTION:\n${String(jd || '').slice(0, 3000)}\n\n` +
    `CANDIDATE RÉSUMÉ:\n${stripPII(String(cv || ''), profile).slice(0, 4000)}`
  )
}

export const OUTREACH_JSON_SCHEMA = {
  name: 'jobdar_outreach',
  schema: { type: 'object', additionalProperties: false, required: ['message'], properties: { message: { type: 'string' } } },
}

// Draft one grounded note. Returns { ok, message, lint, channel, person, model, usage } | { ok:false, ... }.
export async function draftOutreach({ active, jd = '', cv = '', profile = {}, role = '', company = '', person = '', channel = 'linkedin', directives = [], maxTokens = 400, timeoutMs = 120000 }) {
  const useJson = active && active.jsonEval && profile.eval_grammar !== false
  const rf = useJson ? { type: 'json_schema', json_schema: OUTREACH_JSON_SCHEMA } : null
  const user = buildOutreachUser({ jd, cv, profile, role, company, person, channel })
  const sys = outreachSystem(channel) + directiveBlock(directives)
  const call = (extra = '') => callBackend(active, { system: sys + extra, user, maxTokens, timeoutMs, responseFormat: rf, temperature: 0 })

  let res
  try { res = await call() }
  catch (e) {
    if (!rf) return { ok: false, error: e.message }
    try { res = await callBackend(active, { system: sys, user, maxTokens, timeoutMs, responseFormat: null, temperature: 0 }) } // degrade to /v1/messages
    catch (e2) { return { ok: false, error: e2.message } }
  }
  const pick = (txt) => { const j = parseEvalJson(txt); return (j && typeof j.message === 'string' ? j.message : String(txt || '')).trim() }
  let message = pick(res.text)
  if (!message) return { ok: false, raw: res.text, model: res.model }

  // Lint gate: one firmer retry if a deterministic check fails (too long / placeholder / missing name).
  let lint = lintDraft(message, { channel, person })
  if (!lint.ok) {
    const first = person ? String(person).trim().split(/\s+/)[0] : 'the recipient'
    const fix = `\n\nYOUR LAST note failed checks (${lint.problems.map((p) => p.kind).join(', ')}). Rewrite it: ` +
      `address ${first} by first name; NO [placeholders]; ${channel === 'linkedin' ? `UNDER ${LINKEDIN_NOTE_MAX} characters; ` : ''}` +
      'exactly one real fit reason; exactly one ask.'
    try {
      const res2 = await call(fix)
      const m2 = pick(res2.text)
      const lint2 = lintDraft(m2, { channel, person })
      if (m2 && (lint2.ok || lint2.problems.length < lint.problems.length)) { message = m2; lint = lint2; res = res2 }
    } catch { /* keep the first attempt */ }
  }
  return { ok: true, message, lint, channel, person, model: res.model, usage: res.usage || null, backend: active.kind }
}
