// Jobdar — UKG / UltiPro Recruiting provider (1.67.0). UKG Pro's public job boards answer the same
// unauthenticated JSON their own page uses:
//   board:  https://recruiting.ultipro.com/{TENANT}/JobBoard/{board-uuid}
//   list:   POST {board}/JobBoardView/LoadSearchResults
//           body: { opportunitySearch: { Top, Skip, QueryString: '', OrderBy: [posted date, newest first], Filters: [] } }
//           -> { totalCount, opportunities: [ { Id, Title, PostedDate, Locations: [ { Address: { City, State: { Code } } } ] } ] }
//   detail: GET {board}/OpportunityDetail?opportunityId={Id}  — HTML that embeds the posting as JSON
//           (`CandidateOpportunityDetail({ … Description … })`)
// Same { id, detect, fetch, fetchJob } contract as the other providers: fetch() discovers, fetchJob()
// pulls one role's JD. Verified live 2026-10-05 against Genesco's board.

import { postJson, fetchText } from '../lib/http.mjs'
import { stripTags, decodeEntities } from '../lib/html.mjs'

// SSRF guard: only UKG's recruiting hosts (recruiting.ultipro.com, recruiting2.ultipro.com …), HTTPS only.
export const HOST_ALLOWLIST = [/^recruiting\d*\.ultipro\.com$/]

const PAGE_SIZE = 50
const MAX_PAGES = 40 // safety bound (~2000 postings)
const PAGE_DELAY_MS = 150

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// { host, tenant, board } from a board URL (anything after the board id is ignored).
export function parseUltiProUrl(rawUrl) {
  if (!rawUrl) return null
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (!HOST_ALLOWLIST.some((re) => re.test(host))) return null
  const m = u.pathname.match(/^\/([A-Za-z0-9]+)\/JobBoard\/([0-9a-fA-F-]{36})(?:\/|$)/)
  if (!m) return null
  return { host, tenant: m[1], board: m[2].toLowerCase() }
}

// { host, tenant, board, id } from a posting URL: {board}/OpportunityDetail?opportunityId={uuid}
export function parseUltiProJobUrl(jobUrl) {
  const p = parseUltiProUrl(jobUrl)
  if (!p) return null
  let id
  try {
    id = new URL(jobUrl).searchParams.get('opportunityId')
  } catch {
    return null
  }
  if (!id || !/^[0-9a-fA-F-]{36}$/.test(id)) return null
  return { ...p, id }
}

const boardBase = (p) => `https://${p.host}/${p.tenant}/JobBoard/${p.board}`

export function locationOf(opportunity) {
  const loc = Array.isArray(opportunity && opportunity.Locations) ? opportunity.Locations[0] : null
  const addr = (loc && loc.Address) || {}
  const state = (addr.State && (addr.State.Code || addr.State.Name)) || ''
  return [addr.City, state].filter(Boolean).join(', ') || (loc && loc.LocalizedDescription) || ''
}

// The posting object the detail page embeds. Pure (exported for offline tests).
export function parseOpportunityDetail(html) {
  const m = String(html || '').match(/CandidateOpportunityDetail\((\{[\s\S]*?\})\);\s*\n/)
  if (!m) return null
  try {
    return JSON.parse(m[1])
  } catch {
    return null
  }
}

const ultipro = {
  id: 'ultipro',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'ultipro') return null
    const p = parseUltiProUrl(portal.careers_url)
    if (!p) return null
    return { ...p, company: portal.company || p.tenant }
  },

  // Newest first. `ctx.maxPostings` (the phone's size limit) stops paging once that many are in hand;
  // a board not read to its end is returned with `incomplete = true`.
  async fetch(match, ctx = {}) {
    const base = boardBase(match)
    const limit = Number(ctx.maxPostings) > 0 ? Number(ctx.maxPostings) : Infinity
    const out = []
    let total = Infinity
    let done = false
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await postJson(
        `${base}/JobBoardView/LoadSearchResults`,
        { opportunitySearch: { Top: PAGE_SIZE, Skip: page * PAGE_SIZE, QueryString: '', OrderBy: [{ Value: 'postedDateDesc', PropertyName: 'PostedDate', Ascending: false }], Filters: [] } },
        { hostAllowlist: HOST_ALLOWLIST }
      )
      const list = Array.isArray(data && data.opportunities) ? data.opportunities : []
      if (typeof data?.totalCount === 'number') total = data.totalCount
      for (const o of list) {
        if (!o || !o.Id) continue
        out.push({
          title: o.Title || '',
          url: `${base}/OpportunityDetail?opportunityId=${o.Id}`,
          company: match.company,
          location: locationOf(o),
          postedOn: o.PostedDate || null,
        })
      }
      if (list.length === 0 || (page + 1) * PAGE_SIZE >= total) {
        done = true
        break
      }
      if (out.length >= limit) break
      await sleep(PAGE_DELAY_MS)
    }
    if (!done) out.incomplete = true
    return out
  },

  async fetchJob(jobUrl) {
    const p = parseUltiProJobUrl(jobUrl)
    if (!p) return null
    const html = await fetchText(`${boardBase(p)}/OpportunityDetail?opportunityId=${p.id}`, { hostAllowlist: HOST_ALLOWLIST })
    const o = parseOpportunityDetail(html)
    if (!o) return { title: '', location: '', description: '' }
    return {
      title: o.Title || '',
      location: locationOf(o),
      description: o.Description ? stripTags(decodeEntities(o.Description)) : '',
    }
  },
}

export default ultipro
