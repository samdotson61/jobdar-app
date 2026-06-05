// Jobdar — Greenhouse provider (reference implementation).
// Greenhouse exposes a clean, unauthenticated public board API:
//   https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
// This is the { id, detect, fetch } shape that Workday (Phase 2) and the other
// providers mirror. detect() is network-free; fetch() touches only public data.

import { fetchJson } from '../lib/http.mjs'

const API_HOST_ALLOWLIST = [/^boards-api\.greenhouse\.io$/]

// Pull the board token from a Greenhouse careers URL:
//   boards.greenhouse.io/acme       -> acme
//   job-boards.greenhouse.io/acme   -> acme
//   acme.greenhouse.io              -> acme
function parseToken(careersUrl) {
  if (!careersUrl) return null
  let u
  try {
    u = new URL(careersUrl)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  if (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') {
    return u.pathname.split('/').filter(Boolean)[0] || null
  }
  const m = host.match(/^([a-z0-9-]+)\.greenhouse\.io$/)
  if (m && !['boards', 'job-boards', 'boards-api'].includes(m[1])) return m[1]
  return null
}

const greenhouse = {
  id: 'greenhouse',

  detect(portal) {
    if (!portal) return null
    const token = parseToken(portal.careers_url)
    if (!token) return null
    return { token, company: portal.company || token }
  },

  async fetch(match) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(match.token)}/jobs?content=true`
    const data = await fetchJson(url, { hostAllowlist: API_HOST_ALLOWLIST })
    const jobs = Array.isArray(data && data.jobs) ? data.jobs : []
    return jobs.map((j) => ({
      title: j.title,
      url: j.absolute_url,
      company: match.company,
      location: (j.location && j.location.name) || '',
      postedOn: j.updated_at || j.first_published || null,
    }))
  },
}

export default greenhouse
