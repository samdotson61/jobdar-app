// Jobdar — iCIMS provider (Phase 3). The second big US enterprise ATS (health systems,
// insurers, manufacturers). Harder than Workday: there is NO public unauthenticated JSON API,
// so the default path parses public career pages.
//
//   Default (zero-auth): fetch `https://careers-{co}.icims.com/jobs/search?pr=N` HTML and parse
//     JobPosting JSON-LD first (reliable), falling back to DOM job-row anchors (best-effort).
//   Opt-in: a Playwright render path for JS-heavy iCIMS widgets (sequential, gated behind a flag).
//   Optional: the official Job Portal API / XML feed (OAuth2) — documented, off by default.
//
// Expect more breakage than Workday; coverage is documented per employer.

import { fetchText } from '../lib/http.mjs'
import { extractJsonLd, stripTags, decodeEntities } from '../lib/html.mjs'

export const HOST_ALLOWLIST = [/^[a-z0-9.-]+\.icims\.com$/]

const MAX_PAGES = 50
const PAGE_DELAY_MS = 200 // polite pacing between pages (best-effort scraping)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const searchUrl = (host, pr) => `https://${host}/jobs/search?pr=${pr}&in_iframe=1`

function parseHost(careersUrl) {
  if (!careersUrl) return null
  let u
  try {
    u = new URL(careersUrl)
  } catch {
    return null
  }
  return /\.icims\.com$/i.test(u.hostname) ? u.hostname.toLowerCase() : null
}

function jobFromJsonLd(node, company) {
  const locNode = Array.isArray(node.jobLocation) ? node.jobLocation[0] : node.jobLocation
  const addr = (locNode && locNode.address) || {}
  const location = [addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ')
  return {
    title: decodeEntities(node.title || ''),
    url: node.url || '',
    company,
    location,
    postedOn: node.datePosted || null,
  }
}

// Best-effort DOM fallback: iCIMS job rows are anchors to /jobs/{id}/{slug}/job.
function parseDomRows(html, company) {
  const out = []
  const re = /<a[^>]+href=["']([^"']*\/jobs\/\d+\/[^"']+\/job)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html))) {
    const title = stripTags(m[2])
    if (title) out.push({ title, url: m[1], company, location: '', postedOn: null })
  }
  return out
}

function dedupe(jobs, base) {
  const seen = new Set()
  const out = []
  for (const j of jobs) {
    let url = j.url
    try {
      if (url) url = new URL(url, base).toString()
    } catch {
      /* keep raw */
    }
    const key = url || j.title
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push({ ...j, url })
  }
  return out
}

// Parse postings from one HTML page: JSON-LD JobPosting/ItemList first, DOM rows as fallback.
export function parseJobPostingsFromHtml(html, base, company) {
  const ld = extractJsonLd(html)
  const postings = []
  for (const node of ld) {
    if (!node || typeof node !== 'object') continue
    if (node['@type'] === 'JobPosting') {
      postings.push(jobFromJsonLd(node, company))
    } else if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement) {
        const item = (el && el.item) || el
        if (item && (item['@type'] === 'JobPosting' || item.title)) postings.push(jobFromJsonLd(item, company))
      }
    }
  }
  if (postings.length) return dedupe(postings, base)
  return dedupe(parseDomRows(html, company), base)
}

async function fetchViaHtml(match) {
  const base = `https://${match.host}`
  const all = []
  const seen = new Set()
  for (let pr = 0; pr < MAX_PAGES; pr++) {
    let html
    try {
      html = await fetchText(searchUrl(match.host, pr), { hostAllowlist: HOST_ALLOWLIST })
    } catch (err) {
      if (pr === 0) throw err
      break
    }
    const fresh = parseJobPostingsFromHtml(html, base, match.company).filter((j) => {
      const k = j.url || j.title
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    if (fresh.length === 0) break
    all.push(...fresh)
    await sleep(PAGE_DELAY_MS)
  }
  return all
}

// Opt-in render path for JS-rendered iCIMS widgets. Sequential, single browser; lazy-imports
// Playwright so the default install stays light. Enable with `jobdar scan --playwright`.
async function fetchViaPlaywright(match) {
  let chromium
  try {
    ({ chromium } = await import('playwright'))
  } catch {
    throw new Error('Playwright not installed — run `npm i playwright` to scan JS-rendered iCIMS sites')
  }
  const base = `https://${match.host}`
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const all = []
    const seen = new Set()
    for (let pr = 0; pr < MAX_PAGES; pr++) {
      await page.goto(searchUrl(match.host, pr), { waitUntil: 'networkidle' })
      const fresh = parseJobPostingsFromHtml(await page.content(), base, match.company).filter((j) => {
        const k = j.url || j.title
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      if (fresh.length === 0) break
      all.push(...fresh)
    }
    return all
  } finally {
    await browser.close()
  }
}

// Optional, OFF by default. The official iCIMS Job Portal API / Standard XML feed require OAuth2
// client credentials (employer/vendor access). Documented, not wired (ROADMAP Phase 3.4).
export async function fetchViaJobPortalApi() {
  throw new Error('iCIMS Job Portal API requires OAuth2 credentials (Phase 3.4 — off by default)')
}

const icims = {
  id: 'icims',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'icims') return null
    const host = parseHost(portal.careers_url)
    if (!host) return null
    const company = portal.company || host.replace(/^careers-/, '').replace(/\.icims\.com$/, '')
    return { host, company }
  },

  // Default zero-token HTML/JSON-LD path. If it finds nothing (likely a JS-rendered widget) and
  // rendering is enabled (`--playwright`), fall back to Playwright. Otherwise return what we have.
  async fetch(match, ctx = {}) {
    const jobs = await fetchViaHtml(match)
    if (jobs.length > 0) return jobs
    if (ctx.render) return fetchViaPlaywright(match)
    return jobs
  },
}

export default icims
