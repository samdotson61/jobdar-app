// Jobdar — the engine contract (Phase 8e). ONE programmatic seam for the whole pipeline —
// import → scan → evaluate → track → build — with NO console I/O: structured returns + optional
// progress(event) callbacks. The CLI subcommands, the web app, and the mobile app are all thin callers.
// Phase 9 builds against docs/engine.md, never against internals. See the verb signatures there.

import { extractText } from './docparse.mjs'
import { callBackend, selectActive, resolveBackend, backendHealth } from './inference.mjs'
import { evalRole, preConfirm, isBorderline, buildVerdict, prepEval, parseEvalJson } from './eval_engine.mjs'
import { mergeScanned, recordEval, recordPrescreen, setStatus, pruneScanned, readPipeline, pendingQueue, band } from './evaluations.mjs'
import { prescreenRole } from './prescreen.mjs'
import { parseResumeText } from './resume.mjs'
import { cvToHtml } from './cv_render.mjs'
import { fetchJobDescription } from '../providers/_contract.mjs'

export const ENGINE_VERSION = '1.0' // bump on a breaking change to a verb signature or a returned shape

const STRUCT_SYSTEM =
  'Extract structured profile fields from the résumé text below. Use ONLY what the text states — never ' +
  'invent. Reply with ONLY this JSON object, no prose:\n' +
  '{"name":"","location":"City, ST","level":"entry|mid|senior","skills":[]}'

// import: a document file → { ok, ext, cv, fields, structuredBy } | { ok:false, error }. Extraction is
// deterministic (lib/docparse); the optional `active` backend structures the profile fields; with no
// backend it falls back to a heuristic. cv is the EXTRACTED text — never a model rewrite.
export async function importDocument(file, { active = null, onProgress = () => {} } = {}) {
  const doc = extractText(file)
  if (doc.error || !doc.text.trim()) return { ok: false, error: doc.error || 'empty', ext: doc.ext }
  onProgress({ stage: 'extracted', chars: doc.text.length })
  let fields = { name: '', location: '', level: '', skills: [] }
  if (active && active.up) {
    try {
      const { text } = await callBackend(active, { system: STRUCT_SYSTEM, user: doc.text.slice(0, 8000), maxTokens: 400, cache: false })
      const j = parseEvalJson(text)
      if (j) fields = { name: j.name || '', location: j.location || '', level: ['entry', 'mid', 'senior'].includes(j.level) ? j.level : '', skills: Array.isArray(j.skills) ? j.skills.slice(0, 8) : [] }
    } catch {
      /* fall through to heuristic */
    }
  }
  if (!fields.name && !fields.location) {
    const h = parseResumeText(doc.text)
    fields.name = fields.name || h.name
    fields.location = fields.location || h.location
  }
  onProgress({ stage: 'structured', fields })
  return { ok: true, ext: doc.ext, cv: doc.text, fields, structuredBy: active && active.up ? active.runtime || active.kind : 'heuristic' }
}

// scan: discover roles from portals → merged pipeline rows. `discover(portal)` is injected (the CLI
// passes the provider fetch), so the engine stays I/O-light and testable. Returns { rows, found }.
export async function scan({ portals = [], existing = [], discover, dateStr, onProgress = () => {} }) {
  let all = []
  for (const portal of portals) {
    try {
      const jobs = (await discover(portal)) || []
      all = all.concat(jobs)
      onProgress({ stage: 'portal', portal: portal.company || portal.careers_url, found: jobs.length })
    } catch (e) {
      onProgress({ stage: 'portal-error', portal: portal.company || portal.careers_url, error: e.message })
    }
  }
  return { rows: mergeScanned(existing, all, dateStr), found: all.length }
}

// evaluate: one role end-to-end (the §3 pipeline). Optional preConfirm gate + escalate ladder.
// Returns the verdict shape (see eval_engine.buildVerdict) plus { skipped } when pre-confirm drops it.
export async function evaluate({ active, jd, cv = '', profile = {}, today = '', confirm = false, escalate = null }) {
  if (confirm) {
    const pc = await preConfirm({ active, jd, cv, profile })
    if (pc.verdict === 'skip') return { ok: true, skipped: true, preConfirm: pc }
  }
  let v = await evalRole({ active, jd, cv, profile, today })
  if (escalate && v.ok && isBorderline(v) && escalate.up && escalate.kind !== active.kind) {
    const v2 = await evalRole({ active: escalate, jd, cv, profile, today })
    if (v2.ok) v = { ...v2, escalatedFrom: v.score }
  }
  return v
}

// Re-exported verbs (already pure) — the documented contract surface.
export { fetchJobDescription as fetchJd } from '../providers/_contract.mjs'
export { preConfirm, prepEval, buildVerdict } from './eval_engine.mjs'
export { selectActive, resolveBackend, backendHealth } from './inference.mjs'
export { readPipeline, pendingQueue, mergeScanned, band } from './evaluations.mjs'
export { prescreenRole } from './prescreen.mjs'
export { resolvePay, socForTitle, loadWages, loadSocMap } from './pay.mjs' // 8d: market pay context (de-skew engine)

// track: advance a row's status / record a verdict / record a prescreen — pure (rows in, rows out).
export const recordVerdict = recordEval
export const recordPrescreenVerdict = recordPrescreen
export const advanceStatus = setStatus
export const prune = pruneScanned

// build: a tailored ATS résumé as HTML (the PDF wrapper lives in the pdf command).
export function buildCv(cvMarkdown, opts = {}) {
  return cvToHtml(cvMarkdown, opts)
}
