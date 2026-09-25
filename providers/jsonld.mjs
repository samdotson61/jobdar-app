// Jobdar — generic JSON-LD provider (Phase 5.5). For career sites on ATSes we don't (yet) speak
// natively — Phenom, SmashFly/Symphony, custom portals — that embed schema.org JobPosting / ItemList
// JSON-LD server-side. OPT-IN ONLY: a portal must say `provider: jsonld` explicitly (there is no URL
// pattern to auto-detect), e.g.:
//   - company: TriHealth
//     careers_url: https://careers.example.org/search
//     provider: jsonld
// SSRF posture: requests are pinned to the portal's OWN host (same-origin only), HTTPS, no redirects.
// Coverage is best-effort by nature — JS-only sites render nothing server-side and won't work here.

import { fetchText } from '../lib/http.mjs'
import { extractJsonLd, stripTags, decodeEntities } from '../lib/html.mjs'

const hostAllowlistFor = (host) => [new RegExp(`^${String(host).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)]

function jobFromNode(node, company) {
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

export function parseJsonLdJobs(html, company) {
  const out = []
  for (const node of extractJsonLd(html)) {
    if (!node || typeof node !== 'object') continue
    if (node['@type'] === 'JobPosting') out.push(jobFromNode(node, company))
    else if (node['@type'] === 'ItemList' && Array.isArray(node.itemListElement)) {
      for (const el of node.itemListElement) {
        const item = (el && el.item) || el
        if (item && (item['@type'] === 'JobPosting' || item.title)) out.push(jobFromNode(item, company))
      }
    }
  }
  // dedupe by url-or-title
  const seen = new Set()
  return out.filter((j) => {
    const k = j.url || j.title
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const jsonld = {
  id: 'jsonld',

  // Explicit opt-in only: no URL shape identifies these sites, so we never auto-claim a portal.
  detect(portal) {
    if (!portal || portal.provider !== 'jsonld') return null
    let u
    try {
      u = new URL(portal.careers_url)
    } catch {
      return null
    }
    return { host: u.hostname.toLowerCase(), url: portal.careers_url, company: portal.company || u.hostname }
  },

  async fetch(match) {
    const html = await fetchText(match.url, { hostAllowlist: hostAllowlistFor(match.host) })
    return parseJsonLdJobs(html, match.company).map((j) => {
      let url = j.url
      try {
        if (url) url = new URL(url, match.url).toString()
      } catch {
        /* keep raw */
      }
      return { ...j, url }
    })
  },

  // Eval-time: the role's own page usually embeds its full JobPosting (with description).
  async fetchJob(jobUrl) {
    let u
    try {
      u = new URL(jobUrl)
    } catch {
      return null
    }
    const html = await fetchText(jobUrl, { hostAllowlist: hostAllowlistFor(u.hostname.toLowerCase()) })
    const post = extractJsonLd(html).find((n) => n && n['@type'] === 'JobPosting')
    if (!post) return { title: '', location: '', description: '' }
    const base = jobFromNode(post, '')
    return {
      title: base.title,
      location: base.location,
      description: post.description ? stripTags(decodeEntities(post.description)) : '',
    }
  },
}

export default jsonld
