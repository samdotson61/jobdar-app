// Jobdar — Lever provider (Phase 5.5). Lever is common at small/midsize companies — exactly the
// lower-competition employers Jobdar favors. Clean unauthenticated JSON:
//   list:   https://api.lever.co/v0/postings/{site}?mode=json
//   detail: https://api.lever.co/v0/postings/{site}/{id}   (descriptionPlain)
// Same { id, detect, fetch, fetchJob } contract as greenhouse/workday/icims: fetch() discovers
// (title/url/location, no JD); fetchJob() pulls one role's JD for the model's `eval`.

import { fetchJson } from '../lib/http.mjs'

const API_HOST_ALLOWLIST = [/^api\.lever\.co$/]

// Board site from a Lever careers URL: jobs.lever.co/{site} (also eu.lever.co boards).
function parseSite(careersUrl) {
  if (!careersUrl) return null
  let u
  try {
    u = new URL(careersUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'jobs.lever.co' && host !== 'jobs.eu.lever.co') return null
  return u.pathname.split('/').filter(Boolean)[0] || null
}

// { site, id } from a posting URL: https://jobs.lever.co/{site}/{uuid}
export function parseLeverJobUrl(jobUrl) {
  if (!jobUrl) return null
  let u
  try {
    u = new URL(jobUrl)
  } catch {
    return null
  }
  if (!/^jobs\.(eu\.)?lever\.co$/.test(u.hostname.toLowerCase())) return null
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length < 2) return null
  return { site: segs[0], id: segs[1] }
}

const locationOf = (p) => (p.categories && p.categories.location) || (Array.isArray(p.workplaceType) ? '' : p.workplaceType === 'remote' ? 'Remote' : '') || ''

const lever = {
  id: 'lever',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'lever') return null
    const site = parseSite(portal.careers_url)
    if (!site) return null
    return { site, company: portal.company || site }
  },

  async fetch(match) {
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(match.site)}?mode=json`
    const data = await fetchJson(url, { hostAllowlist: API_HOST_ALLOWLIST })
    const jobs = Array.isArray(data) ? data : []
    return jobs.map((p) => ({
      title: p.text || '',
      url: p.hostedUrl || '',
      company: match.company,
      location: locationOf(p),
      postedOn: p.createdAt ? new Date(p.createdAt).toISOString() : null,
    }))
  },

  async fetchJob(jobUrl) {
    const parsed = parseLeverJobUrl(jobUrl)
    if (!parsed) return null
    const url = `https://api.lever.co/v0/postings/${encodeURIComponent(parsed.site)}/${encodeURIComponent(parsed.id)}`
    const p = await fetchJson(url, { hostAllowlist: API_HOST_ALLOWLIST })
    return {
      title: (p && p.text) || '',
      location: p ? locationOf(p) : '',
      description: (p && (p.descriptionPlain || '')) || '',
    }
  },
}

export default lever
