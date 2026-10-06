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

import { fetchJson, postJson } from '../lib/http.mjs'
import { stripTags, decodeEntities } from '../lib/html.mjs'

// SSRF guard: only Workday job hosts, any shard (wd1 / wd3 / wd5 / wd101 …), HTTPS only.
export const HOST_ALLOWLIST = [/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/]

// The "site" (external career site name) varies per tenant. If a portal doesn't specify one,
// we probe these common names in order (External is by far the most common).
const COMMON_SITES = ['External', 'External_Career_Site', 'careers', 'Careers', 'External_Careers']

const PAGE_LIMIT = 20
const MAX_PAGES = 250 // the ceiling for one scan: 5,000 postings (1.68.0; was 100 → 2,000). ctx.maxPages raises it — the
                      // baseline scan reads whole boards. Workday pages to any depth (offset 4,000 answered live 2026-10-06).
const PAGE_DELAY_MS = 150 // polite pacing between paginated requests (Phase 2.5)
const PAGE_RETRY_MS = 1000 // pause before the one retry of a failed page


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

// Parse a Workday public job URL into the CXS detail-endpoint parts:
//   https://nvidia.wd5.myworkdayjobs.com/External/job/US-CA/Engineer_JR123
//     -> { tenant:'nvidia', shard:'wd5', site:'External', externalPath:'/job/US-CA/Engineer_JR123' }
// Our list normalize emits {base}/{site}{externalPath}; a browser-pasted /{locale}/{site}/… also parses.
export function parseWorkdayJobUrl(jobUrl) {
  if (!jobUrl) return null
  let u
  try {
    u = new URL(jobUrl)
  } catch {
    return null
  }
  const m = u.hostname.toLowerCase().match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/)
  if (!m) return null
  const [, tenant, shard] = m
  const segs = u.pathname.split('/').filter(Boolean).filter((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s))
  if (segs.length < 2) return null // need at least {site}/{…path}
  return { tenant, shard, site: segs[0], externalPath: '/' + segs.slice(1).join('/') }
}

export function normalize(posting, base, site, company) {
  const externalPath = posting.externalPath || ''
  const sep = externalPath.startsWith('/') ? '' : '/'
  // The public Workday URL is {base}/{site}{externalPath} — the site segment is required, or the
  // link 404s. (Verified live: omitting /{site} 404s; including it returns 200.)
  const url = externalPath ? `${base}/${site}${sep}${externalPath}` : `${base}/${site}`
  return {
    title: posting.title || '',
    url,
    company,
    location: posting.locationsText || '',
    postedOn: posting.postedOn || null,
  }
}

// Many tenants report `total` on the FIRST page only and 0 on every later one (verified live
// 2026-10-05: Salesforce 1513 → 0 → 0). Trusting that later zero ended paging at 40 postings on 34 of
// the catalog's 45 Workday boards — so a zero after the first page is ignored and the first total stands.
// `deadline` (ms epoch, from ctx.budgetMs) is for interactive scans: when it passes, paging stops and
// the postings gathered so far are returned (the list is newest-first) instead of the caller timing
// out and losing the whole board.
// Reading every page means ~75 requests on a big board, and one of them failing (a 502, a stalled
// socket — 3 of 45 boards on the first full run) must not throw away the pages already read: a page
// past the first is retried once, then paging stops with what it has. The first page still throws —
// the site probe in fetch() depends on that.
// Whenever the board was NOT read to its end (budget, failed page, MAX_PAGES), the returned array
// carries `incomplete = true`, so callers that reason from ABSENCE (liveness, the board ledger) know
// a missing posting proves nothing.
// `limit` (ctx.maxPostings) stops paging once that many postings are in hand — the phone's size limit.
// The window Workday's result list really has on tenants that report `total` as exactly 2000: offsets
// past it answer with page one again (Trinity, live 2026-10-06), so such a board cannot be read whole by
// paging — only by partitioning it (fetchPartitioned). Lowe's, which reports its true total (12,661),
// pages to any depth.
const CAPPED_TOTAL = 2000

// `facets` (appliedFacets) narrows the listing to one partition of the board.
async function fetchSite(match, site, maxPages = MAX_PAGES, deadline = Infinity, limit = Infinity, facets = {}) {
  const base = `https://${match.tenant}.${match.shard}.myworkdayjobs.com`
  const endpoint = `${base}/wday/cxs/${match.tenant}/${site}/jobs`
  const out = []
  const seen = new Set()
  // Under a budget no single request may outlive it: with a dozen boards loading at once a page can
  // take seconds, and one slow page after the budget pushed a board past the desktop's 12 s cut-off,
  // losing all of it (Cleveland Clinic, intermittently). A request is given only the time that is left.
  const getPage = (offset) => {
    const opts = { hostAllowlist: HOST_ALLOWLIST }
    if (deadline !== Infinity) opts.timeoutMs = Math.max(1000, deadline - Date.now())
    return postJson(endpoint, { appliedFacets: facets, limit: PAGE_LIMIT, offset, searchText: '' }, opts)
  }
  let offset = 0
  let total = Infinity
  let done = false
  for (let page = 0; page < maxPages; page++) {
    let data
    try {
      data = await getPage(offset)
    } catch (err) {
      if (page === 0) throw err
      if (Date.now() + PAGE_RETRY_MS >= deadline) break // no time left to retry — keep what was read
      await sleep(PAGE_RETRY_MS)
      try {
        data = await getPage(offset)
      } catch {
        break
      }
    }
    const postings = Array.isArray(data && data.jobPostings) ? data.jobPostings : []
    if (typeof data?.total === 'number' && !(page > 0 && data.total === 0)) total = data.total
    if (page === 0) out.facets = Array.isArray(data && data.facets) ? data.facets : []
    // Big boards carry the odd placeholder entry with no title and no path (5 across the Midwest
    // catalog once boards were read whole) — it would save as a blank role linking to the board itself.
    let fresh = 0
    for (const p of postings) {
      if (!(p && p.title && p.externalPath)) continue
      const job = normalize(p, base, site, match.company)
      if (seen.has(job.url)) continue // a repeated page = the window wrapped (see CAPPED_TOTAL)
      seen.add(job.url)
      out.push(job)
      fresh++
    }
    offset += PAGE_LIMIT
    // A short page proves the end. A `total` of exactly 2000 is a reporting cap on some tenants, not the
    // size, so it does not end paging by itself — but a page that adds nothing new means the window
    // wrapped, and the board is cut off there.
    if (postings.length === 0 || postings.length < PAGE_LIMIT || (offset >= total && total !== CAPPED_TOTAL)) {
      done = true
      break
    }
    if (fresh === 0) break
    if (Date.now() >= deadline || out.length >= limit) break
    await sleep(PAGE_DELAY_MS)
  }
  out.total = total
  if (!done || out.length >= PAGE_LIMIT * maxPages) out.incomplete = true
  return out
}

// Facet values as a flat list of { param, id, count, descriptor }. A value with children but no id of
// its own (Advocate's "State" group, Kohl's "Locations") contributes its children — applied under the
// group's OWN facetParameter when it names one (Kohl's stores are `locations`, not `locationMainGroup`;
// the parent key answers HTTP 400). A value with an id AND children (a state with its cities) is one
// partition by itself — Workday applies the parent id to all of them.
export function partitionCandidates(facets) {
  const out = []
  for (const f of facets || []) {
    const walk = (vals, param) => {
      for (const v of vals || []) {
        if (!v) continue
        if (v.id && typeof v.count === 'number') out.push({ param, id: v.id, count: v.count, descriptor: v.descriptor || '' })
        else if (Array.isArray(v.values)) walk(v.values, v.facetParameter || param)
      }
    }
    walk(f.values, f.facetParameter)
  }
  return out
}

// Pick the facet to split a board on. Pure. Preferred: a facet whose every value fits the window, with
// the fewest values. Otherwise (Sanford: every facet has one value over 2,000) the facet with the fewest
// oversized values, then the fewest values — its oversized values are split again on another facet.
// Returns { param, values: [{ id, count, descriptor }], fits } or null when there is no facet at all.
export function choosePartition(facets, window = CAPPED_TOTAL) {
  const byParam = new Map()
  for (const v of partitionCandidates(facets)) {
    if (!byParam.has(v.param)) byParam.set(v.param, [])
    byParam.get(v.param).push(v)
  }
  let best = null
  for (const [param, values] of byParam) {
    if (!values.length) continue
    const over = values.filter((v) => v.count >= window).length
    const cand = { param, values, fits: over === 0, over }
    if (!best || cand.over < best.over || (cand.over === best.over && values.length < best.values.length)) best = cand
  }
  return best
}

// Read a board that paging cannot read whole (CAPPED_TOTAL) in partitions — one facet value at a time,
// each under the window — and union the result. Two levels deep: a partition that is itself too big is
// split again on another facet. Used by the baseline scan (ctx.partition); user scans keep the plain
// read. Returns the same array shape as fetchSite, with `partitions` = how many reads it took.
const MAX_PARTITION_DEPTH = 2
// Partitions of one board are read a few at a time: a store chain that caps its total (Kohl's) can only
// be split by store — about 1,100 partitions — which one at a time took over 25 minutes.
const PARTITION_CONCURRENCY = 4

async function fetchPartitioned(match, site, first, maxPages, deadline) {
  const union = new Map(first.map((j) => [j.url, j]))
  let incomplete = false
  let reads = 0
  const read = async (applied, facetsHere, depth) => {
    const pick = choosePartition(facetsHere)
    if (!pick) {
      incomplete = true
      return
    }
    const others = (f) => f.filter((x) => x.facetParameter !== pick.param)
    const one = async (v) => {
      if (v.count === 0) return
      const facets = { ...applied, [pick.param]: [v.id] }
      // A value that cannot fit the window is not read in full (that would wrap too): one page gives its
      // own facets, and it is split again on one of them.
      if (v.count >= CAPPED_TOTAL && depth < MAX_PARTITION_DEPTH) {
        let probe
        try {
          probe = await fetchSite(match, site, 1, deadline, Infinity, facets)
        } catch {
          incomplete = true
          return
        }
        reads++
        for (const j of probe) union.set(j.url, j)
        await read(facets, others(probe.facets || []), depth + 1)
        return
      }
      let part
      try {
        part = await fetchSite(match, site, maxPages, deadline, Infinity, facets)
      } catch {
        incomplete = true
        return
      }
      reads++
      for (const j of part) union.set(j.url, j)
      if (part.incomplete) {
        if (depth < MAX_PARTITION_DEPTH && part.facets) await read(facets, others(part.facets), depth + 1)
        else incomplete = true
      }
    }
    const queue = pick.values.slice()
    await Promise.all(Array.from({ length: Math.min(PARTITION_CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        await one(queue.shift())
        await sleep(PAGE_DELAY_MS)
      }
    }))
  }
  await read({}, first.facets || [], 0)
  const out = [...union.values()]
  out.partitions = reads
  if (incomplete) out.incomplete = true
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
  async fetch(match, ctx = {}) {
    const maxPages = ctx.maxPages || MAX_PAGES
    const deadline = Number(ctx.budgetMs) > 0 ? Date.now() + Number(ctx.budgetMs) : Infinity
    const limit = Number(ctx.maxPostings) > 0 ? Number(ctx.maxPostings) : Infinity
    const sites = match.site ? [match.site] : COMMON_SITES
    let firstOk = null
    let lastErr
    for (const site of sites) {
      try {
        let jobs = await fetchSite(match, site, maxPages, deadline, limit)
        // ctx.partition (the baseline scan): a board the window cut off is read in facet partitions.
        if (ctx.partition && jobs.incomplete && jobs.total === CAPPED_TOTAL && limit === Infinity) jobs = await fetchPartitioned(match, site, jobs, maxPages, deadline)
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

  // Eval-time: fetch ONE role's full JD via the CXS detail endpoint (the bulk /jobs list omits it).
  // Returns { title, location, description }. jobDescription is HTML → strip to plain text.
  async fetchJob(jobUrl) {
    const p = parseWorkdayJobUrl(jobUrl)
    if (!p) return null
    const url = `https://${p.tenant}.${p.shard}.myworkdayjobs.com/wday/cxs/${p.tenant}/${p.site}${p.externalPath}`
    const data = await fetchJson(url, { hostAllowlist: HOST_ALLOWLIST })
    const info = (data && data.jobPostingInfo) || {}
    return {
      title: info.title || '',
      location: info.location || '',
      description: info.jobDescription ? stripTags(decodeEntities(info.jobDescription)) : '',
    }
  },
}

export default workday
