// Jobfaro — intelligent company/portal discovery (Phase 9.4). The scanner runs over a seed of known ATS
// portals; this grows that seed for what the user is actually searching for, WITHOUT a crawler, an API
// key, or a third party. The local model (winc) SUGGESTS employers likely to hire for the role+region;
// Jobfaro then deterministically probes their Greenhouse/Lever/Ashby slugs and keeps ONLY boards that
// actually return jobs (live-verified — a hallucinated company simply never resolves, so it's dropped).

import { callBackend } from './inference.mjs'
import { parseEvalJson } from './eval_engine.mjs'
import { resolveProvider } from '../providers/_contract.mjs'

export const SUGGEST_SYSTEM =
  'You name REAL US employers likely to be hiring for the given role(s) and region(s) and that plausibly ' +
  'post on a public applicant tracking system (Greenhouse, Lever, or Ashby). Prefer mid-size / tech-forward ' +
  'employers. NEVER invent fictional companies. Reply ONLY with the JSON.'

export const SUGGEST_SCHEMA = {
  name: 'jobfaro_companies',
  schema: {
    type: 'object', additionalProperties: false, required: ['companies'],
    properties: {
      companies: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' }, slug: { type: 'string' } } },
      },
    },
  },
}

export function buildSuggestUser({ intent = '', titles = [], regions = [], n = 6 }) {
  const roles = titles.length ? titles.join(', ') : intent
  const where = regions.length ? regions.join(', ') : 'the US'
  return (
    `Role(s): ${roles}\nRegion(s): ${where}\n\n` +
    `List ${n} real employers that hire for these role(s) in these region(s) and likely post on ` +
    'Greenhouse/Lever/Ashby. For each: {name, slug?} where slug is the company\'s ATS handle if you know it ' +
    '(e.g. "stripe" for boards.greenhouse.io/stripe).'
  )
}

// Company name → plausible ATS slugs (Greenhouse/Lever/Ashby use a lowercase handle in the URL).
export function slugVariants(name) {
  const base = String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
  if (!base) return []
  return [...new Set([base.replace(/\s+/g, ''), base.replace(/\s+/g, '-')])]
}

// Candidate board URLs to probe for a company (slug × the three slug-based ATSs).
export function atsCandidates(name, slug) {
  const slugs = [...new Set([...(slug ? slugVariants(slug) : []), ...slugVariants(name)])].slice(0, 2)
  const out = []
  for (const s of slugs) {
    if (!s) continue
    out.push({ provider: 'greenhouse', careers_url: `https://boards.greenhouse.io/${s}` })
    out.push({ provider: 'lever', careers_url: `https://jobs.lever.co/${s}` })
    out.push({ provider: 'ashby', careers_url: `https://jobs.ashbyhq.com/${s}` })
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// winc suggests companies → probe ATS slugs → keep boards that actually return jobs. Never throws; returns
// { suggested, portals:[{company,careers_url}], jobs:[...] }. jobs are already fetched (no re-scan needed).
export async function discoverCompanies({ active, intent = '', titles = [], regions = [], existingUrls = new Set(), maxCompanies = 6, ctx = {} }) {
  if (!active || !active.up || !String(intent || '').trim()) return { suggested: 0, portals: [], jobs: [] }
  let companies = []
  try {
    const rf = active.jsonEval ? { type: 'json_schema', json_schema: SUGGEST_SCHEMA } : null
    const res = await callBackend(active, { system: SUGGEST_SYSTEM, user: buildSuggestUser({ intent, titles, regions, n: maxCompanies }), maxTokens: 400, timeoutMs: 60000, responseFormat: rf, temperature: 0 })
    const j = parseEvalJson(res.text)
    if (j && Array.isArray(j.companies)) companies = j.companies.filter((c) => c && c.name).slice(0, maxCompanies)
  } catch {
    return { suggested: 0, portals: [], jobs: [] }
  }

  const portals = [], jobs = []
  for (const c of companies) {
    for (const cand of atsCandidates(c.name, c.slug)) {
      if (existingUrls.has(cand.careers_url.toLowerCase())) continue
      let hit = null
      try { hit = resolveProvider({ company: c.name, careers_url: cand.careers_url }) } catch { hit = null }
      if (!hit) continue
      try {
        const found = await hit.provider.fetch(hit.match, ctx)
        if (Array.isArray(found) && found.length) {
          portals.push({ company: c.name, careers_url: cand.careers_url })
          for (const job of found) jobs.push({ ...job, company: job.company || c.name })
          existingUrls.add(cand.careers_url.toLowerCase())
          break // one verified board per company is enough
        }
      } catch {
        /* 404 / not this ATS / unreachable → try the next candidate */
      }
      await sleep(120) // polite pacing between live probes
    }
  }
  return { suggested: companies.length, portals, jobs }
}
