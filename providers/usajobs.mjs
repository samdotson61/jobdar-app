// Jobdar — USAJobs provider (opt-in, BYO free key). USAJobs is the U.S. federal government's official
// jobs aggregator — a huge, public, entry-friendly source (many roles open to the public with clear
// grade/pay bands). Unlike the per-company ATS providers, it's ONE endpoint covering thousands of
// agencies, so it broadens coverage in a single portal.
//
// It needs a FREE API key + the registered email (sent as User-Agent, per USAJobs terms). Both live in
// the gitignored data/credentials.env (USAJOBS_API_KEY / USAJOBS_EMAIL) — never tracked, never sent
// anywhere but data.usajobs.gov. Without a key the provider is DORMANT: fetch()/fetchJob() return
// empty/null so a scan never breaks for users who haven't opted in.
//
// Same { id, detect, fetch, fetchJob } contract as the ATS providers. A "portal" is a saved search:
//   { company: 'USAJobs', provider: 'usajobs',
//     careers_url: 'https://data.usajobs.gov/api/search?Keyword=data+analyst&LocationName=Ohio' }
// detect() reads the query string as the search params; fetch() runs the Search API and maps the results.
//
// API: https://developer.usajobs.gov/api-reference/get-api-search — a single GET /api/search.
// NOTE: not live-verified in this repo (requires a real key). The pure parse/map/assemble helpers below
// are unit-tested against a captured response fixture; the network path is exercised only with a live key.

import { fetchJson } from '../lib/http.mjs'
import { loadUsaJobsCreds } from '../lib/config.mjs'

const API_HOST_ALLOWLIST = [/^data\.usajobs\.gov$/]
// Only these Search API params are ever forwarded (allowlist — no arbitrary query passthrough).
const ALLOWED_PARAMS = new Set([
  'Keyword', 'LocationName', 'ResultsPerPage', 'Page', 'HiringPath',
  'PositionScheduleTypeCode', 'PayGradeLow', 'PayGradeHigh', 'JobCategoryCode', 'Radius',
])
const MAX_RESULTS = 25

// Parse a USAJobs saved-search careers_url → the search params it carries. Returns null for non-usajobs
// hosts so detect() stays cheap and side-effect-free. Host may be data. or www. (both route here).
export function parseUsaJobsSearchUrl(careersUrl) {
  if (!careersUrl) return null
  let u
  try {
    u = new URL(careersUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'data.usajobs.gov' && host !== 'www.usajobs.gov' && host !== 'usajobs.gov') return null
  const params = {}
  for (const [k, v] of u.searchParams) if (ALLOWED_PARAMS.has(k) && v) params[k] = v
  return { params }
}

// Control number from a posting URL: https://www.usajobs.gov/job/838012000 (search returns :443 sometimes).
export function parseUsaJobsJobUrl(jobUrl) {
  if (!jobUrl) return null
  let u
  try {
    u = new URL(jobUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'www.usajobs.gov' && host !== 'usajobs.gov' && host !== 'data.usajobs.gov') return null
  const m = u.pathname.match(/\/job\/(\d+)/)
  return m ? { id: m[1] } : null
}

// Build the Search API URL from allowlisted params (+ sane defaults: public hiring path, capped page).
export function buildSearchUrl(params = {}) {
  const q = new URLSearchParams()
  q.set('HiringPath', 'public') // roles open to the general public (not current-federal-only) by default
  for (const [k, v] of Object.entries(params)) if (ALLOWED_PARAMS.has(k) && v != null && v !== '') q.set(k, String(v))
  const rpp = Math.max(1, Math.min(MAX_RESULTS, Number(params.ResultsPerPage) || MAX_RESULTS))
  q.set('ResultsPerPage', String(rpp))
  return `https://data.usajobs.gov/api/search?${q.toString()}`
}

const firstLocation = (d) =>
  d.PositionLocationDisplay ||
  (Array.isArray(d.PositionLocation) && d.PositionLocation[0] && d.PositionLocation[0].LocationName) ||
  ''

// The human posting URL, normalized (drop the :443 the API sometimes emits).
const cleanUri = (uri) => {
  if (!uri) return ''
  try {
    const u = new URL(uri)
    u.port = ''
    return u.toString()
  } catch {
    return uri
  }
}

// Map a Search response → discovery Job[] (no JD — matches the contract's light-scan shape).
export function mapSearchItems(json, fallbackCompany = 'USAJobs') {
  const items = (json && json.SearchResult && json.SearchResult.SearchResultItems) || []
  const out = []
  for (const it of items) {
    const d = it && it.MatchedObjectDescriptor
    if (!d) continue
    out.push({
      title: d.PositionTitle || '',
      url: cleanUri(d.PositionURI) || (it.MatchedObjectId ? `https://www.usajobs.gov/job/${it.MatchedObjectId}` : ''),
      company: d.OrganizationName || d.DepartmentName || fallbackCompany,
      location: firstLocation(d),
      postedOn: d.PublicationStartDate ? new Date(d.PublicationStartDate).toISOString() : null,
    })
  }
  return out.filter((j) => j.title && j.url)
}

// Assemble one role's full JD from the descriptor (USAJobs returns the whole posting inline — no second
// call needed). Joins summary + duties + qualifications + requirements + education into eval-ready text.
export function assembleJd(descriptor) {
  const d = descriptor || {}
  const det = d.UserArea && d.UserArea.Details ? d.UserArea.Details : {}
  const parts = []
  if (d.QualificationSummary) parts.push(d.QualificationSummary)
  if (det.JobSummary) parts.push(det.JobSummary)
  if (Array.isArray(det.MajorDutiesList) && det.MajorDutiesList.length) parts.push('Duties:\n' + det.MajorDutiesList.map((x) => `- ${x}`).join('\n'))
  if (det.Requirements) parts.push('Requirements:\n' + det.Requirements)
  if (det.Education) parts.push('Education:\n' + det.Education)
  if (det.Evaluations) parts.push(det.Evaluations)
  return {
    title: d.PositionTitle || '',
    location: firstLocation(d),
    description: parts.join('\n\n').trim(),
  }
}

const usajobs = {
  id: 'usajobs',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'usajobs') return null
    const parsed = parseUsaJobsSearchUrl(portal.careers_url)
    if (!parsed) return null
    return { params: parsed.params, company: portal.company || 'USAJobs' }
  },

  async fetch(match, ctx = {}) {
    const { key, email } = loadUsaJobsCreds()
    if (!key || !email) return [] // dormant without a BYO key — never breaks a scan
    // ctx may override/augment the saved search (intent-driven scans pass keyword/location).
    const params = { ...(match.params || {}) }
    if (ctx.keyword && !params.Keyword) params.Keyword = ctx.keyword
    if (ctx.locationName && !params.LocationName) params.LocationName = ctx.locationName
    const url = buildSearchUrl(params)
    const data = await fetchJson(url, {
      hostAllowlist: API_HOST_ALLOWLIST,
      headers: { 'user-agent': email, 'authorization-key': key, host: 'data.usajobs.gov' },
    })
    return mapSearchItems(data, match.company)
  },

  async fetchJob(jobUrl) {
    const parsed = parseUsaJobsJobUrl(jobUrl)
    if (!parsed) return null
    const { key, email } = loadUsaJobsCreds()
    if (!key || !email) return null // dormant without a key
    // No public get-by-id endpoint — re-query Search by the control number and match the item back.
    const url = buildSearchUrl({ Keyword: parsed.id, ResultsPerPage: MAX_RESULTS })
    const data = await fetchJson(url, {
      hostAllowlist: API_HOST_ALLOWLIST,
      headers: { 'user-agent': email, 'authorization-key': key, host: 'data.usajobs.gov' },
    })
    const items = (data && data.SearchResult && data.SearchResult.SearchResultItems) || []
    const hit = items.find((it) => String(it.MatchedObjectId) === parsed.id) || items[0]
    if (!hit || !hit.MatchedObjectDescriptor) return null
    return assembleJd(hit.MatchedObjectDescriptor)
  },
}

export default usajobs
