// Jobfaro — Greenhouse provider (reference implementation).
// Greenhouse exposes a clean, unauthenticated public board API:
//   list:   https://boards-api.greenhouse.io/v1/boards/{token}/jobs
//   detail: https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}   (full JD in `content`)
// This is the { id, detect, fetch, fetchJob } shape Workday and iCIMS mirror. detect() is
// network-free; fetch() lists roles (discovery — title/url/location, no JD); fetchJob() pulls one
// role's full JD for the model's `eval` (career-ops: scan discovers, the model scores).

import { fetchJson } from '../lib/http.mjs'
import { stripTags, decodeEntities } from '../lib/html.mjs'

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

// Pull { token, id } from a Greenhouse job URL (any of the host forms above, path …/jobs/{id}).
export function parseJobUrl(jobUrl) {
  if (!jobUrl) return null
  let u
  try {
    u = new URL(jobUrl)
  } catch {
    return null
  }
  const token = parseToken(jobUrl)
  const m = u.pathname.match(/\/jobs\/(\d+)/)
  if (!token || !m) return null
  return { token, id: m[1] }
}

const greenhouse = {
  id: 'greenhouse',

  detect(portal) {
    if (!portal) return null
    const token = parseToken(portal.careers_url)
    if (!token) return null
    return { token, company: portal.company || token }
  },

  // Discovery: list roles (title/url/company/location). No JD here — that's fetchJob's job, so a
  // bulk scan stays light and uniform with Workday/iCIMS (whose listings also omit the JD).
  async fetch(match) {
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(match.token)}/jobs`
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

  // Eval-time: fetch ONE role's full JD via the detail API. Greenhouse encodes `content` as
  // entity-escaped HTML, so decode entities first, then strip tags. Returns { title, location, description }.
  async fetchJob(jobUrl) {
    const parsed = parseJobUrl(jobUrl)
    if (!parsed) return null
    const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(parsed.token)}/jobs/${encodeURIComponent(parsed.id)}`
    const data = await fetchJson(url, { hostAllowlist: API_HOST_ALLOWLIST })
    return {
      title: (data && data.title) || '',
      location: (data && data.location && data.location.name) || '',
      description: data && data.content ? stripTags(decodeEntities(data.content)) : '',
    }
  },
}

export default greenhouse
