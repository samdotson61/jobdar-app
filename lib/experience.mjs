// Jobdar — years IN THE FIELD (1.73.0). Pure (the one model call lives in eval_engine.mjs).
//
// A JD's "3+ years of experience" means three years doing THAT kind of work, not three years of any
// work. Before 1.73.0 the eval model was handed the years ask and the whole résumé and left to count,
// so it read a summary line like "more than five years in enterprise environments", or summed every
// date on the page, and an IT administrator with ~1.5 years of project work looked like a fit for a
// 3+-year project-manager role. The split now follows Jobdar's rule (the model routes, code
// calculates): CODE measures every job on the résumé from its own dates; the MODEL only names which
// of those jobs did the kind of work the years ask names (FIELD_SYSTEM, a separate short call — the
// main eval prompt is untouched); CODE sums the chosen jobs
// (overlaps merged, so a promotion isn't counted twice) and compares the total with the ask.
//
// Only jobs under a work-history heading count when the résumé has one. Projects, education, and
// coursework stay in the résumé text the model reads (they still earn skills credit), but they are
// not years of experience an employer counts.

import { normalizeResumeDates } from './dates.mjs'

// English + Spanish month names, keyed by their first three letters ("sept"/"set" → Sep).
const MONTH = { jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6, aug: 7, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dec: 11, dic: 11 }
const MON = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|ene(?:ro)?|febrero|marzo|abr(?:il)?|mayo|junio|julio|ago(?:sto)?|sep(?:tiembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\\.?'
const DATE = `(?:${MON}\\s+(?:de\\s+)?\\d{4}|\\d{1,2}/\\d{4}|\\d{4})`
const OPEN = '(?:present|current|now|today|ongoing|actualidad|actual|presente|hoy)'
const RANGE = new RegExp(`(${DATE})\\s*(?:[-–—]|\\bto\\b|\\bthrough\\b|\\bthru\\b|\\ba\\b|\\bhasta\\b)\\s*(${DATE}|${OPEN})(?![\\w])`, 'i')

// Section headings → what the dated lines under them are. Checked in order; first match wins.
const SECTIONS = [
  ['education', /\b(education|certific|coursework|training|academic|educaci[oó]n|formaci[oó]n|cursos)\b/i],
  ['projects', /\b(projects?|portfolio|proyectos?)\b/i],
  ['work', /\b(experience|employment|work history|career history|professional background|experiencia|empleos?|historial laboral|trayectoria)\b/i],
]

// A heading line: markdown "#…", or a short line with letters and no lowercase ("PROFESSIONAL
// EXPERIENCE", "EDUCATION & CERTIFICATIONS"). A dated line is never a heading.
function headingKind(line) {
  const s = line.trim()
  const md = /^#{1,6}\s+/.test(s)
  const text = s.replace(/^#{1,6}\s+/, '')
  const caps = text.length <= 60 && /[A-Z]{3}/.test(text) && !/[a-z]/.test(text)
  if (!(md || caps) || RANGE.test(text)) return null
  for (const [kind, re] of SECTIONS) if (re.test(text)) return kind
  return 'other'
}

// One end of a range → a month index (year*12 + month). Year-only dates take mid-year (Jul start /
// Jun end), so "2019 – 2021" is 24 months, not 12 or 36. `end` picks the end-side convention.
function monthIndex(token, todayIdx, end) {
  const t = String(token).trim().toLowerCase()
  if (new RegExp(`^${OPEN}$`, 'i').test(t)) return todayIdx
  let m = t.match(/^(\d{1,2})\/(\d{4})$/)
  if (m) return Number(m[2]) * 12 + Math.min(11, Math.max(0, Number(m[1]) - 1))
  m = t.match(/^([a-zé]+)\.?\s+(?:de\s+)?(\d{4})$/)
  if (m && MONTH[m[1].slice(0, 3)] != null) return Number(m[2]) * 12 + MONTH[m[1].slice(0, 3)]
  m = t.match(/^(\d{4})$/)
  if (m) return Number(m[1]) * 12 + (end ? 5 : 6)
  return null
}

function todayIndex(today) {
  const m = String(today || '').match(/^(\d{4})-(\d{2})/)
  if (m) return Number(m[1]) * 12 + Number(m[2]) - 1
  const d = new Date()
  return d.getFullYear() * 12 + d.getMonth()
}

// "1 yr 7 mo" / "8 mo" / "3 yrs". Pure.
export function formatMonths(months) {
  const n = Math.max(0, Math.round(Number(months) || 0))
  const y = Math.floor(n / 12)
  const mo = n % 12
  const ys = y ? `${y} yr${y === 1 ? '' : 's'}` : ''
  const ms = mo ? `${mo} mo` : ''
  return [ys, ms].filter(Boolean).join(' ') || '0 mo'
}

// The résumé's jobs, each measured from its own dates. Returns [{ n, title, start, end, months }]
// (n is 1-based — the number the model cites). Only lines under a work-history heading count when the
// résumé has one; otherwise every dated line that isn't under a projects/education heading. At most
// 15 jobs (older ones past that rarely change a years count, and they keep the prompt short). Pure.
export function resumeJobs(cv, today = '') {
  const lines = normalizeResumeDates(String(cv || ''), today).split(/\r?\n/)
  const now = todayIndex(today)
  const found = []
  let section = 'other'
  let sawWork = false
  let prev = ''
  let cur = null // the job whose lines we are reading (its bullets = what the candidate did there)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const h = headingKind(line)
    if (h) {
      section = h
      if (h === 'work') sawWork = true
      prev = ''
      cur = null
      continue
    }
    const m = line.match(RANGE)
    if (m) {
      const s = monthIndex(m[1], now, false)
      const e = monthIndex(m[2], now, true)
      if (s != null && e != null && e >= s - 1 && s <= now + 1) {
        let title = line.replace(m[0], ' ').replace(/[|•·,–—-]+\s*$/g, '').replace(/^\s*[|•·,–—-]+/, '').replace(/\s*\|\s*\|\s*/g, ' | ').replace(/\s+/g, ' ').trim()
        title = title.replace(/[\s|•·,–—-]+$/, '').trim()
        if (title.length < 3 && prev) title = prev // dates on their own line: the job is the line above
        const end = Math.min(e, now)
        cur = { section, title: title.slice(0, 120), s, e: end, months: Math.max(1, end - s + 1), details: [] }
        found.push(cur)
        prev = line
        continue
      }
    }
    if (cur) cur.details.push(line)
    prev = line
  }
  const keep = found.filter((j) => (sawWork ? j.section === 'work' : j.section !== 'projects' && j.section !== 'education'))
  return keep.slice(0, 15).map((j, i) => ({ n: i + 1, title: j.title, start: j.s, end: j.e, months: j.months, details: j.details.join(' ').replace(/\s+/g, ' ').slice(0, 1500) }))
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const label = (idx) => `${MONTHS_EN[((idx % 12) + 12) % 12]} ${Math.floor(idx / 12)}`

// The prompt block: one numbered line per job. '' when the résumé has no dated jobs. Pure.
export function jobsBlock(jobs = []) {
  if (!jobs.length) return ''
  return jobs.map((j) => `${j.n}. ${j.title} — ${label(j.start)} to ${label(j.end)} (${formatMonths(j.months)})`).join('\n')
}

// A list of job numbers from the model → valid ones (integers in range, de-duplicated, sorted). Accepts
// numbers or numeric strings. null when there is no list at all, so the caller leaves the verdict as it
// was rather than reading "no list" as "no field jobs". Pure.
export function fieldJobNumbers(raw, jobs = []) {
  if (!Array.isArray(raw)) return null
  const ok = new Set()
  for (const v of raw) {
    const n = Number(String(v).replace(/[^\d]/g, ''))
    if (Number.isInteger(n) && n >= 1 && n <= jobs.length) ok.add(n)
  }
  return [...ok].sort((a, b) => a - b)
}

// ── The field question: its own short call, so the main eval prompt stays exactly as benched ──
// Measured 2026-11-24 (26 live Cincinnati roles, qwen3.5-4b): asking for field_jobs INSIDE the main eval
// reply, with a line telling the model Jobdar checks the years itself, made the model stop checking
// requirements altogether — unmet lists emptied, degree and domain gates vanished, 9 of 26 roles jumped
// to Apply (several at 5.0) — and it counted every job as field work. A separate, narrow question
// leaves the main prompt byte-identical and asks only one thing. Wording measured on the 13 of those
// roles that state a years ask (hand-checked answers): a "be strict, adjacent work does not count"
// version returned [] for 11 of 13 ("2+ years in IT or Information Security" → none of three IT jobs);
// this balanced version got 9 of the 11 clear cases right — misses: it counted three non-manager jobs
// as "management positions", and missed product-owner work as "a software development environment";
// a third version adding a positions rule did worse (dropped "IT Infrastructure" to []).
export const FIELD_SYSTEM =
  'You are Jobdar, checking a candidate’s work history against ONE years-of-experience requirement in a ' +
  'job posting. First say in a few words what kind of work the requirement names (when it names none, it ' +
  'means this role’s own core work, from the posting). Then list the numbers of the candidate’s jobs where ' +
  'they did that kind of work, judged from each job’s own lines. A job counts when its lines show the ' +
  'candidate doing that work there — it need not be the job title or the whole job, and a broad ' +
  'requirement ("experience in IT") counts every job of that kind. A job does not count when its lines ' +
  'show nothing of that work. Projects and school are not jobs and never count. Reply with ONLY this JSON ' +
  'object — no prose, no code fence:\n{"work":"","field_jobs":[]}'

export const FIELD_JSON_SCHEMA = {
  name: 'jobdar_field_jobs',
  schema: {
    type: 'object', additionalProperties: false, required: ['work', 'field_jobs'],
    properties: { work: { type: 'string' }, field_jobs: { type: 'array', items: { type: 'integer' } } },
  },
}

// The JD line that carries the years ask, widened from prescreen's short quote ("3+ years of
// experience") to its whole line or sentence, so the field it names ("…managing IT or software
// development projects") reaches the model. Falls back to the quote. Pure.
export function yearsAskLine(jd, quote) {
  const text = String(jd || '')
  const q = String(quote || '')
  const at = q ? text.indexOf(q) : -1
  if (at < 0) return q
  // From the ask itself to the end of its line or sentence — or to the NEXT years ask, which on boards
  // that flatten their bullets ("5+ years in IT 3+ years in Azure…") is the only boundary left.
  const rest = text.slice(at)
  const lineEnd = rest.search(/\n|[.;•](?:\s|$)/)
  const nextAsk = rest.slice(q.length).search(/\b\d{1,2}\s*\+?\s*(?:[-–]\s*\d{1,2}\s*)?(?:years?|yrs?)\b/i)
  const stop = Math.min(lineEnd < 0 ? Infinity : lineEnd, nextAsk < 0 ? Infinity : nextAsk + q.length, 220)
  return rest.slice(0, stop).replace(/\s+/g, ' ').trim() || q
}

// The field question's user message. null when the check doesn't apply (no years ask, or a résumé
// with no dated jobs) — then no call is made. Pure.
export function buildFieldUser({ jd, gates, jobs = [] } = {}) {
  const asked = gates && gates.years ? Number(gates.years.years) : 0
  if (!(asked > 0) || !jobs.length) return null
  const list = jobs.map((j) => `${j.n}. ${j.title} — ${label(j.start)} to ${label(j.end)} (${formatMonths(j.months)})${j.details ? `\n   What they did: ${j.details}` : ''}`).join('\n')
  return (
    `REQUIREMENT: ${yearsAskLine(jd, gates.years.quote)}\n\n` +
    `THE ROLE (start of the posting):\n${String(jd || '').replace(/\s+/g, ' ').slice(0, 1200)}\n\n` +
    `CANDIDATE’S JOBS:\n${list}`
  )
}

// The field reply → job numbers, or null when it isn't the expected JSON. Pure.
export function parseFieldReply(text, jobs = []) {
  const s = String(text || '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    const j = JSON.parse(s.slice(a, b + 1))
    return fieldJobNumbers(j && j.field_jobs, jobs)
  } catch {
    return null
  }
}

// Months across the chosen jobs, overlaps merged (a promotion or two concurrent jobs count once). Pure.
export function fieldMonths(jobs = [], numbers = []) {
  const spans = jobs.filter((j) => numbers.includes(j.n)).map((j) => [j.start, j.end]).sort((a, b) => a[0] - b[0])
  let total = 0
  let cur = null
  for (const [s, e] of spans) {
    if (!cur || s > cur[1] + 1) {
      if (cur) total += cur[1] - cur[0] + 1
      cur = [s, e]
    } else cur[1] = Math.max(cur[1], e)
  }
  if (cur) total += cur[1] - cur[0] + 1
  return total
}

// Years as one decimal, rounded DOWN (1.97 → 1.9), so a candidate is never credited past what the
// dates show: 2 yrs 11 mo vs a "3+" ask reads 2.9, short. Pure.
export const toYears = (months) => Math.floor(((Number(months) || 0) * 10) / 12 + 1e-9) / 10

// An "unmet" line that is only a years ask ("3+ years managing IT projects"), not a credential that
// happens to mention years ("2 years as a licensed RN"). Code owns the years count, so these lines
// follow the measured total, not the model's own count.
const CREDENTIAL = /licen|certif|clearance|\bRN\b|\bCPA\b|\bPE\b|\bCDL\b|series \d|\bDEA\b|bar admission|registered nurse|degree|bachelor|master/i
export const isYearsOnly = (s) => /\b\d+\s*\+?\s*(?:-|–|to)?\s*\d*\s*\+?\s*(?:years?|yrs?|años?)\b/i.test(String(s || '')) && !CREDENTIAL.test(String(s || ''))

// Experience can't rate above what the measured years support: short of the ask → at most "partial".
// One tier, not a slide to "weak" for a bigger gap: a years shortfall shapes the score but never cliffs
// it (the 1.41.x rule), and the field question is a small model's call — measured 9 of 11 right — so a
// wrong "no job counts" must not sink a role on its own. Measured 2026-11-24: a "weak" tier for under
// half the ask took Systems Engineer (2+ yrs Windows Server, which the résumé has) from Research to
// Don't over its secondary "1+ years of web hosting". A lower model rating is never raised. Pure.
const RANK = { none: 0, weak: 1, partial: 2, good: 3, strong: 4 }
export function experienceCeiling(years, asked) {
  if (!(asked > 0) || years >= asked) return null
  return 'partial'
}

// The years figure a requirement line carries ("3+ years…" → 3, "4 -6 years" → 4); null if none. Pure.
const yearsIn = (s) => {
  const m = String(s || '').match(/\b(\d+)\s*\+?\s*(?:(?:-|–|to)\s*\d+\s*)?\+?\s*(?:years?|yrs?|años?)\b/i)
  return m ? Number(m[1]) : null
}

// The whole field-years check for one verdict. Applies only when the JD states a years ask, the
// résumé has measured jobs, and the field question answered (`numbers` is a list); otherwise
// { applied: false } and the verdict is untouched. When it applies, returns the adjusted judgments
// (experience capped to what the dates support; the "unmet" list made to agree with the measured
// total for THIS ask — other years asks the model listed, e.g. a separate "7+ years of support", are
// left alone) plus the note the verdict leads with. Pure.
export function fieldYearsCheck({ judgments, jobs = [], gates, numbers } = {}) {
  const asked = gates && gates.years ? Number(gates.years.years) : 0
  const picked = asked > 0 && jobs.length ? fieldJobNumbers(numbers, jobs) : null
  if (!picked) return { applied: false, judgments }
  const months = fieldMonths(jobs, picked)
  const years = toYears(months)
  const short = years < asked
  const out = { ...judgments, required: { ...(judgments.required || {}) } }
  const unmet = (Array.isArray(out.required.unmet) ? out.required.unmet : []).map((u) => String(u == null ? '' : u))
  const thisAsk = (u) => isYearsOnly(u) && yearsIn(u) === asked
  const shown = months ? formatMonths(months) : 'none'
  if (short) {
    if (!unmet.some(thisAsk)) unmet.push(`${asked}+ years of this kind of work (the résumé shows ${shown})`)
    out.required.unmet = unmet
    const ceiling = experienceCeiling(years, asked)
    const cur = out.experience && out.experience.rating
    if (ceiling && (RANK[cur] == null || RANK[cur] > RANK[ceiling])) out.experience = { ...(out.experience || {}), rating: ceiling }
  } else {
    out.required.unmet = unmet.filter((u) => !thisAsk(u))
  }
  const note = `${shown} of this kind of work on the résumé vs ${asked}+ years asked`
  return { applied: true, judgments: out, numbers: picked, months, years, asked, short, note }
}
