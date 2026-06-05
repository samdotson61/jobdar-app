// Jobdar — safe HTTP helpers for scanner providers.
// Enforces HTTPS, a per-provider host allowlist, no embedded credentials, and
// refuses to follow redirects (SSRF hardening). Providers fetch only PUBLIC job
// data — never a résumé or any personal data. Workday (Phase 2) reuses postJson.

const DEFAULT_TIMEOUT_MS = 15000
const USER_AGENT = 'jobdar/0.1 (+https://github.com/getjobdar/jobdar)'

export function assertAllowedUrl(rawUrl, { hostAllowlist = [] } = {}) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (u.protocol !== 'https:') throw new Error(`Refusing non-HTTPS URL: ${rawUrl}`)
  if (u.username || u.password) throw new Error(`Refusing URL with embedded credentials: ${rawUrl}`)
  const allowed = hostAllowlist.some((re) => re.test(u.hostname))
  if (!allowed) throw new Error(`Host not allowed: ${u.hostname}`)
  return u
}

async function request(rawUrl, opts = {}) {
  const { method = 'GET', body, headers = {}, hostAllowlist, timeoutMs = DEFAULT_TIMEOUT_MS } = opts
  assertAllowedUrl(rawUrl, { hostAllowlist })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(rawUrl, {
      method,
      body,
      redirect: 'error',
      signal: ctrl.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'application/json', ...headers },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${rawUrl}`)
    return res
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchJson(rawUrl, opts = {}) {
  const res = await request(rawUrl, opts)
  return res.json()
}

export async function postJson(rawUrl, payload, opts = {}) {
  return fetchJson(rawUrl, {
    ...opts,
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  })
}

export async function fetchText(rawUrl, opts = {}) {
  const res = await request(rawUrl, { ...opts, headers: { accept: 'text/html,*/*', ...(opts.headers || {}) } })
  return res.text()
}
