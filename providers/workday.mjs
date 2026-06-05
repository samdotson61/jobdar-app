// Jobdar — Workday provider (Phase 2). The marquee enterprise ATS.
//
// Workday powers most large US employers (manufacturers, retailers, health systems, banks,
// ag). Its public "CXS" API is clean and unauthenticated for public job boards:
//
//   POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
//   body: { "appliedFacets": {}, "limit": 20, "offset": N, "searchText": "" }
//   -> { total, jobPostings: [ { title, externalPath, locationsText, postedOn } ] }
//
// Mirrors the greenhouse.mjs { id, detect, fetch } shape. detect() is network-free; fetch()
// reuses lib/http.mjs (HTTPS-only, host allowlist, redirect:'error').

import { postJson } from '../lib/http.mjs'

// SSRF guard: only Workday job hosts, any shard (wd1 / wd3 / wd5 / wd101 …), HTTPS only.
export const HOST_ALLOWLIST = [/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/]

// The "site" (external career site name) varies per tenant. If a portal doesn't specify one,
// we probe these common names in order (External is by far the most common).
const COMMON_SITES = ['External', 'External_Career_Site', 'careers', 'Careers', 'External_Careers']

const PAGE_LIMIT = 20
const MAX_PAGES = 100 // safety bound (~2000 postings); explicit `site:` recommended for big tenants
const PAGE_DELAY_MS = 150 // polite pacing between paginated requests (Phase 2.5)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Parse tenant + shard (+ optional site) from a Workday careers URL:
//   https://acme.wd5.myworkdayjobs.com/en-US/External -> { tenant:'acme', shard:'wd5', site:'External' }
//   https://acme.wd1.myworkdayjobs.com                -> { tenant:'acme', shard:'wd1', site:null }
export function parseWorkdayUrl(careersUrl) {
  if (!careersUrl) return null
  let u
  try {
    u = new URL(careersUrl)
  } catch {
    return null
  }
  const m = u.hostname.toLowerCase().match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/)
  if (!m) return null
  const [, tenant, shard] = m
  // Site is the last meaningful path segment, ignoring locale segments like "en-US".
  const segs = u.pathname.split('/').filter(Boolean).filter((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s))
  const site = segs.length ? segs[segs.length - 1] : null
  return { tenant, shard, site }
}

export function normalize(posting, base, company) {
  const externalPath = posting.externalPath || ''
  return {
    title: posting.title || '',
    url: externalPath ? new URL(externalPath, base).toString() : base,
    company,
    location: posting.locationsText || '',
    postedOn: posting.postedOn || null,
  }
}

async function fetchSite(match, site) {
  const base = `https://${match.tenant}.${match.shard}.myworkdayjobs.com`
  const endpoint = `${base}/wday/cxs/${match.tenant}/${site}/jobs`
  const out = []
  let offset = 0
  let total = Infinity
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await postJson(
      endpoint,
      { appliedFacets: {}, limit: PAGE_LIMIT, offset, searchText: '' },
      { hostAllowlist: HOST_ALLOWLIST }
    )
    const postings = Array.isArray(data && data.jobPostings) ? data.jobPostings : []
    if (typeof data?.total === 'number') total = data.total
    for (const p of postings) out.push(normalize(p, base, match.company))
    offset += PAGE_LIMIT
    if (postings.length === 0 || offset >= total) break
    await sleep(PAGE_DELAY_MS)
  }
  return out
}

const workday = {
  id: 'workday',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'workday') return null
    const parsed = parseWorkdayUrl(portal.careers_url)
    if (!parsed) return null
    return {
      tenant: parsed.tenant,
      shard: parsed.shard,
      site: portal.site || parsed.site || null, // explicit portal.site wins
      company: portal.company || parsed.tenant,
    }
  },

  // If the portal names a `site`, trust it. Otherwise probe common site names and use the
  // first that returns postings (a wrong name 404s or returns empty, costing one request).
  async fetch(match) {
    const sites = match.site ? [match.site] : COMMON_SITES
    let firstOk = null
    let lastErr
    for (const site of sites) {
      try {
        const jobs = await fetchSite(match, site)
        if (match.site || jobs.length > 0) return jobs
        if (!firstOk) firstOk = jobs
      } catch (err) {
        lastErr = err
        if (!/HTTP 40\d/.test(err.message)) throw err // only keep probing past "not found"
      }
    }
    if (firstOk) return firstOk
    throw lastErr || new Error(`No reachable Workday site for ${match.tenant}`)
  },
}

export default workday
