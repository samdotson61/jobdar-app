// Jobdar — Jibe provider (1.67.0). Jibe (an iCIMS product) is a branded careers site placed in FRONT
// of an employer's ATS; the ATS's own search page then refuses outside readers (Medpace's iCIMS
// search answers with a script that bounces to the Jibe site). The Jibe site answers its own
// unauthenticated JSON:
//   list: GET https://{careers-host}/api/jobs?page={n}&limit={size}&country=United States
//         -> { totalCount, jobs: [ { data: { slug, req_id, title, location_name, posted_date, apply_url, … } } ] }
// OPT-IN ONLY, like jsonld: the site lives on the employer's own domain, so no URL pattern identifies
// it — a portal must say `provider: jibe`:
//   - company: Medpace
//     careers_url: https://careers.medpace.com/jobs
//     provider: jibe
// SSRF posture: requests are pinned to the portal's OWN host (same-origin only), HTTPS, no redirects.
// The feed carries each role's whole description (~17 KB a role), so pages are kept small and
// `ctx.maxPostings` matters more here than on any other provider.
// Roles are returned under the ATS's job URL when the feed names one this scanner already reads
// (`apply_url` on *.icims.com → https://{host}/jobs/{req_id}/job), so the JD comes through that
// provider at eval time; otherwise under the Jibe site's own page. Verified live 2026-10-05 (Medpace).

import { fetchJson } from '../lib/http.mjs'

const PAGE_SIZE = 50
const MAX_PAGES = 40 // safety bound (~2000 postings)
const PAGE_DELAY_MS = 200

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const hostAllowlistFor = (host) => [new RegExp(`^${String(host).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)]

// One feed entry → the discovery Job shape. Pure (exported for offline tests).
export function jobFromJibe(entry, host, company) {
  const j = (entry && entry.data) || entry || {}
  if (!j.title) return null
  let url = j.slug ? `https://${host}/jobs/${encodeURIComponent(j.slug)}` : ''
  try {
    const apply = new URL(j.apply_url)
    if (apply.protocol === 'https:' && /\.icims\.com$/i.test(apply.hostname) && /^\d+$/.test(String(j.req_id || ''))) {
      url = `https://${apply.hostname.toLowerCase()}/jobs/${j.req_id}/job`
    }
  } catch {
    /* no usable apply_url — keep the Jibe page */
  }
  if (!url) return null
  return {
    title: j.title,
    url,
    company,
    location: j.location_name || j.short_location || [j.city, j.state].filter(Boolean).join(', '),
    postedOn: j.posted_date || null,
  }
}

const jibe = {
  id: 'jibe',

  // Explicit opt-in only: no URL shape identifies these sites, so we never auto-claim a portal.
  detect(portal) {
    if (!portal || portal.provider !== 'jibe') return null
    let u
    try {
      u = new URL(portal.careers_url)
    } catch {
      return null
    }
    return { host: u.hostname.toLowerCase(), company: portal.company || u.hostname }
  },

  // Newest first (the feed's own order). `ctx.maxPostings` stops paging once that many are in hand;
  // a board not read to its end is returned with `incomplete = true`.
  async fetch(match, ctx = {}) {
    const limit = Number(ctx.maxPostings) > 0 ? Number(ctx.maxPostings) : Infinity
    const hostAllowlist = hostAllowlistFor(match.host)
    const out = []
    const seen = new Set()
    let total = Infinity
    let done = false
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `https://${match.host}/api/jobs?page=${page}&limit=${PAGE_SIZE}&country=${encodeURIComponent('United States')}`
      const data = await fetchJson(url, { hostAllowlist, timeoutMs: 30000 })
      const list = Array.isArray(data && data.jobs) ? data.jobs : []
      if (typeof data?.totalCount === 'number') total = data.totalCount
      for (const entry of list) {
        const job = jobFromJibe(entry, match.host, match.company)
        if (!job || seen.has(job.url)) continue
        seen.add(job.url)
        out.push(job)
      }
      if (list.length === 0 || page * PAGE_SIZE >= total) {
        done = true
        break
      }
      if (out.length >= limit) break
      await sleep(PAGE_DELAY_MS)
    }
    if (!done) out.incomplete = true
    return out
  },

  // Roles are listed under their ATS URL whenever possible, so the JD normally comes from that
  // provider. A role left on the Jibe site's own page has no JD route here (the site is an Angular
  // app with no per-role JSON) — said honestly rather than guessed.
  async fetchJob() {
    return null
  },
}

export default jibe
