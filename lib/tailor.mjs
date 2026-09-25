// Jobdar — CV summary + cover-letter tailoring (the Apply-stage "Customize" model step).
// Mirrors eval_engine: structured guaranteed-JSON on capable local backends (winc/ollama/llamafile,
// greedy) so even a 2B reliably fills {summary, cover_letter, keywords} GROUNDED in the résumé — the
// model never freeform-rewrites the CV (no fabrication), and deterministic code assembles the output.
import { callBackend } from './inference.mjs'
import { parseEvalJson, stripPII } from './eval_engine.mjs'

export const TAILOR_JSON_SCHEMA = {
  name: 'jobdar_tailor',
  schema: {
    type: 'object', additionalProperties: false,
    required: ['summary', 'cover_letter', 'keywords'],
    properties: {
      summary: { type: 'string' },
      cover_letter: { type: 'string' },
      keywords: { type: 'array', items: { type: 'string' } },
    },
  },
}

export const TAILOR_SYSTEM =
  'You tailor a candidate’s job-application materials to ONE specific role, using ONLY facts present in ' +
  'their résumé — NEVER invent employers, titles, dates, degrees, skills, or metrics. Produce: ' +
  '(1) summary — 2-3 sentences targeted to this role, grounded in the résumé; ' +
  '(2) cover_letter — a COMPLETE letter: an opening paragraph, one or two body paragraphs mapping the ' +
  'candidate’s REAL internships/projects/transferable skills to the role’s needs, and a closing ' +
  'paragraph, ending with "Sincerely," on its own line then the candidate’s name. ~180–260 words, ' +
  'entry-level aware; (3) keywords — role keywords the résumé genuinely supports. Reply ONLY with the JSON.'

export function buildTailorUser({ jd, cv, profile = {}, role = '', company = '' }) {
  const who = `${role || 'the role'}${company ? ' @ ' + company : ''}`
  return (
    `ROLE: ${who}\n\nJOB DESCRIPTION:\n${String(jd || '').slice(0, 6000)}\n\n` +
    `CANDIDATE RÉSUMÉ:\n${stripPII(String(cv || ''), profile).slice(0, 6000)}`
  )
}

// User directives steer the OUTPUT (tone, emphasis, length, structure) — never the FACTS. Appended AFTER
// the grounding rules so the "never invent" rule stays authoritative; a directive that asks for an
// unsupported fact is explicitly told to be ignored. Pure + exported so the grounding order is testable.
export function directiveBlock(directives = []) {
  const list = (directives || []).map((d) => String(d || '').trim()).filter(Boolean)
  if (!list.length) return ''
  return (
    '\n\nUSER DIRECTIVES — shape TONE, EMPHASIS, LENGTH, and STRUCTURE only. They MUST NOT add or change ' +
    'facts: no employers, titles, dates, degrees, skills, or metrics that are not already in the résumé. ' +
    'If a directive asks for a fact the résumé does not support, ignore that part. Apply in order:\n' +
    list.map((d, i) => `${i + 1}. ${d}`).join('\n')
  )
}

// A complete cover letter — not truncated, not a single short paragraph. The 4B was observed stopping
// early (96 words, no sign-off); this gates the completeness retry below.
export function coverIsComplete(text) {
  const t = String(text || '').trim()
  const words = t.split(/\s+/).filter(Boolean).length
  const hasClose = /\b(sincerely|regards|best regards|warm regards|thank you for)\b/i.test(t.slice(-160))
  return words >= 130 && hasClose
}

// stripPII (eval fairness) replaces the candidate's name with the literal token "[name]" in the résumé the
// model reads, so a small model copies that token into the sign-off ("Sincerely,\n[name]") — a send-blocking
// placeholder, NOT a fabrication (the model correctly refused to invent a name). For TAILORING the
// candidate's OWN name is not a fairness concern, so we deterministically restore it here. Replaces every
// [name]-style placeholder (the sentinel + the variants small models emit); no-op without a name or token.
// Pure + exported so the fill is testable offline.
const SIGNATURE_PLACEHOLDER = /\[\s*(?:your |full |candidate(?:'s)? |applicant(?:'s)? )?name\s*\]/gi
export function fillSignature(text, name) {
  const nm = String(name || '').trim()
  return nm ? String(text || '').replace(SIGNATURE_PLACEHOLDER, nm) : String(text || '')
}

const shape = (j) => ({
  summary: String(j.summary || '').trim(),
  coverLetter: String(j.cover_letter || '').trim(),
  keywords: Array.isArray(j.keywords) ? j.keywords.map(String).filter(Boolean).slice(0, 16) : [],
})

// Tailor one role end-to-end against the active backend. Returns
// { ok, summary, coverLetter, keywords, coverComplete, model, usage } | { ok:false, ... }.
export async function tailorRole({ active, jd, cv = '', profile = {}, role = '', company = '', directives = [], maxTokens = 900, timeoutMs = 120000 }) {
  const useJson = active && active.jsonEval && profile.eval_grammar !== false
  const rf = useJson ? { type: 'json_schema', json_schema: TAILOR_JSON_SCHEMA } : null
  const user = buildTailorUser({ jd, cv, profile, role, company })
  const dir = directiveBlock(directives)
  // temperature 0 (greedy): with the grounded JSON schema, the same résumé+JD+directives yield the same
  // letter — re-running is idempotent, and a CHANGED directive is the only thing that changes the output.
  const call = (extraSystem = '') => callBackend(active, { system: TAILOR_SYSTEM + dir + extraSystem, user, maxTokens, timeoutMs, responseFormat: rf, temperature: 0 })

  let res
  try {
    res = await call()
  } catch (e) {
    if (!rf) return { ok: false, error: e.message }
    try { res = await callBackend(active, { system: TAILOR_SYSTEM + dir, user, maxTokens, timeoutMs, responseFormat: null, temperature: 0 }) } // degrade to /v1/messages
    catch (e2) { return { ok: false, error: e2.message } }
  }
  let j = parseEvalJson(res.text)
  if (!j || !j.cover_letter) return { ok: false, raw: res.text, model: res.model }
  let out = shape(j)

  // Completeness guard: one retry with a firmer instruction if the cover letter came back truncated.
  if (!coverIsComplete(out.coverLetter)) {
    try {
      const res2 = await call('\n\nYOUR LAST cover_letter WAS TOO SHORT/TRUNCATED. Write the FULL letter this time — opening, body, AND a closing paragraph that ends with "Sincerely," on its own line and the candidate’s name. At least 180 words.')
      const j2 = parseEvalJson(res2.text)
      if (j2 && j2.cover_letter) {
        const o2 = shape(j2)
        if (coverIsComplete(o2.coverLetter) || o2.coverLetter.length > out.coverLetter.length) { out = o2; res = res2 }
      }
    } catch { /* keep the first attempt */ }
  }
  // Restore the candidate's name into any leftover "[name]" sign-off (stripPII removed it for the model).
  out.coverLetter = fillSignature(out.coverLetter, profile.name)
  return { ok: true, ...out, coverComplete: coverIsComplete(out.coverLetter), model: res.model, usage: res.usage || null, backend: active.kind }
}

// Insert a tailored "## Summary" right after the name/contact header (before the first section heading)
// so the rendered CV LEADS with a role-targeted summary. Deterministic — never edits the user’s real text.
export function assembleTailoredCv(cv, summary) {
  const s = String(summary || '').trim()
  if (!s) return String(cv || '')
  const lines = String(cv || '').split(/\r?\n/)
  let at = lines.findIndex((l, i) => i > 0 && /^##\s/.test(l)) // first section heading after the name
  if (at < 0) { // no markdown headings: insert after the contact block (first blank line), else near top
    const blank = lines.findIndex((l) => l.trim() === '')
    at = blank >= 0 ? blank + 1 : Math.min(lines.length, 1)
  }
  return [...lines.slice(0, at), '## Summary', s, '', ...lines.slice(at)].join('\n')
}
