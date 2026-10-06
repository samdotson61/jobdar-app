// Jobdar — DirectEmployers microsite provider (1.69.0). Federal contractors list every opening with the
// National Labor Exchange, and DirectEmployers publishes each member's openings on a public microsite —
// `https://{employer}.dejobs.org/` — with a standard job sitemap:
//   https://{employer}.dejobs.org/sitemaps/index.xml     → the job sitemap file(s)
//   https://{employer}.dejobs.org/sitemaps/jobs_1.xml    → <url><loc>…/{city-st}/{title-slug}/{id}/job/</loc><lastmod>…</lastmod></url>
// That is the one public, machine-readable, daily-refreshed list of HCA Healthcare's ~17,000 openings
// (careers.hcahealthcare.com itself sits behind an interactive bot check that an automated reader cannot
// and should not pass). robots.txt allows it; only the /feed/ paths are disallowed.
//
// What the sitemap gives: the posting's URL and a title and "City, ST" read back from the URL slug (its
// <lastmod> is the sitemap's own regeneration date, not a posting date, so none is claimed). What it does not give: the description — the job page is drawn by
// scripts from an API that serves only the site itself, so fetchJob() answers honestly with nothing,
// and such a role shows "JD unavailable" instead of a score. Discovery and tracking work in full.
//
// Terms: the Exchange licenses job seekers to use its sites for their own, personal job search. That is
// what a person's `jobdar scan` is. The public daily baseline scan (which republishes what it reads on
// a GitHub branch) therefore skips these boards — see `baseline: false` in data/seed/employers.yml.

import { fetchText } from '../lib/http.mjs'

export const HOST_ALLOWLIST = [/^[a-z0-9-]+\.dejobs\.org$/]

// The microsite host from a careers URL.
export function parseDejobsUrl(rawUrl) {
  if (!rawUrl) return null
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (!HOST_ALLOWLIST.some((re) => re.test(host))) return null
  return { host }
}

const titleCase = (slug) =>
  String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => (/^(rn|lpn|lvn|cna|icu|er|or|prn|ii|iii|iv|ct|mri|ob|nicu|picu|pcu|ed|it|hr|crna|np|pa|pt|ot|rt)$/.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ')

// One sitemap <url> → the discovery Job shape. The path is /{city-st}/{title-slug}/{id}/job/. Pure.
export function jobFromSitemapUrl(loc, lastmod, company) {
  let u
  try {
    u = new URL(loc)
  } catch {
    return null
  }
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length < 4 || segs[segs.length - 1] !== 'job') return null
  const [place, slug] = segs
  const m = place.match(/^(.*)-([a-z]{2})$/)
  const location = m ? `${titleCase(m[1])}, ${m[2].toUpperCase()}` : titleCase(place)
  const title = titleCase(slug)
  if (!title) return null
  // <lastmod> is the day the sitemap was regenerated (every one of HCA's 17,073 entries carried the same
  // date), not when the role was posted — so no date is claimed; the ledger's own first-seen stands in.
  return { title, url: loc, company, location, postedOn: null }
}

// Every <url> of a sitemap as { loc, lastmod }. Pure (regex over the XML — the files are flat).
export function parseSitemapEntries(xml) {
  const out = []
  const re = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g
  let m
  while ((m = re.exec(String(xml || '')))) out.push({ loc: m[1].trim(), lastmod: m[2] ? m[2].trim() : '' })
  return out
}

const dejobs = {
  id: 'dejobs',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'dejobs') return null
    const p = parseDejobsUrl(portal.careers_url)
    if (!p) return null
    return { ...p, company: portal.company || p.host.split('.')[0] }
  },

  // Two or three requests for the whole board: the sitemap index, then each job sitemap, in the
  // sitemap's own order; `ctx.maxPostings` (the phone's size limit) trims the list and marks it incomplete.
  async fetch(match, ctx = {}) {
    const base = `https://${match.host}`
    const opts = { hostAllowlist: HOST_ALLOWLIST, timeoutMs: 60000 }
    const index = await fetchText(`${base}/sitemaps/index.xml`, opts) // /sitemap.xml 301s here; redirects are never followed
    const files = (index.match(/<loc>([^<]+)<\/loc>/g) || []).map((l) => l.replace(/<\/?loc>/g, '').trim()).filter((f) => /\/sitemaps\/jobs_\d+\.xml$/.test(f) && f.startsWith(base))
    const seen = new Set()
    const out = []
    for (const file of files) {
      const xml = await fetchText(file, opts)
      for (const e of parseSitemapEntries(xml)) {
        const job = jobFromSitemapUrl(e.loc, e.lastmod, match.company)
        if (!job || seen.has(job.url)) continue
        seen.add(job.url)
        out.push(job)
      }
    }
    const limit = Number(ctx.maxPostings) > 0 ? Number(ctx.maxPostings) : Infinity
    if (out.length > limit) {
      const cut = out.slice(0, limit)
      cut.incomplete = true
      return cut
    }
    return out
  },

  // The job page is drawn by scripts from an API that serves only the site itself: no description can
  // be read here, said honestly rather than guessed.
  async fetchJob() {
    return null
  },
}

export default dejobs
