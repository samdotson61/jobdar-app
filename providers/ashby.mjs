// Jobdar — Ashby provider (Phase 5.5). Ashby is the third common startup/midsize ATS (after
// Greenhouse/Lever). Unauthenticated posting API:
//   board: https://api.ashbyhq.com/posting-api/job-board/{org}   (includes descriptionHtml per job)
// Same { id, detect, fetch, fetchJob } contract: fetch() discovers (no JD carried — uniform with the
// other providers); fetchJob() re-reads the board and returns the one role's JD.

import { fetchJson } from '../lib/http.mjs'
import { stripTags, decodeEntities } from '../lib/html.mjs'

const API_HOST_ALLOWLIST = [/^api\.ashbyhq\.com$/]

// Org from a careers URL: jobs.ashbyhq.com/{org}
function parseOrg(careersUrl) {
  if (!careersUrl) return null
  let u
  try {
    u = new URL(careersUrl)
  } catch {
    return null
  }
  if (u.hostname.toLowerCase() !== 'jobs.ashbyhq.com') return null
  return u.pathname.split('/').filter(Boolean)[0] || null
}

export function parseAshbyJobUrl(jobUrl) {
  if (!jobUrl) return null
  let u
  try {
    u = new URL(jobUrl)
  } catch {
    return null
  }
  if (u.hostname.toLowerCase() !== 'jobs.ashbyhq.com') return null
  const segs = u.pathname.split('/').filter(Boolean)
  if (segs.length < 2) return null
  return { org: segs[0], id: segs[1] }
}

async function fetchBoard(org) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}`
  const data = await fetchJson(url, { hostAllowlist: API_HOST_ALLOWLIST })
  return Array.isArray(data && data.jobs) ? data.jobs : []
}

const locationOf = (j) => {
  const main = j.location || ''
  const secondary = Array.isArray(j.secondaryLocations) ? j.secondaryLocations.map((s) => s.location).filter(Boolean) : []
  return [main, ...secondary].filter(Boolean).join('; ')
}

const ashby = {
  id: 'ashby',

  detect(portal) {
    if (!portal) return null
    if (portal.provider && portal.provider !== 'ashby') return null
    const org = parseOrg(portal.careers_url)
    if (!org) return null
    return { org, company: portal.company || org }
  },

  async fetch(match) {
    const jobs = await fetchBoard(match.org)
    return jobs
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        title: j.title || '',
        url: j.jobUrl || (j.id ? `https://jobs.ashbyhq.com/${match.org}/${j.id}` : ''),
        company: match.company,
        location: locationOf(j),
        postedOn: j.publishedAt || null,
      }))
  },

  async fetchJob(jobUrl) {
    const parsed = parseAshbyJobUrl(jobUrl)
    if (!parsed) return null
    const jobs = await fetchBoard(parsed.org)
    const hit = jobs.find((j) => j.id === parsed.id || (j.jobUrl && j.jobUrl.includes(parsed.id)))
    if (!hit) return { title: '', location: '', description: '' }
    return {
      title: hit.title || '',
      location: locationOf(hit),
      description: hit.descriptionHtml ? stripTags(decodeEntities(hit.descriptionHtml)) : hit.descriptionPlain || '',
    }
  },
}

export default ashby
