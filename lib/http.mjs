// Jobdar — safe HTTP helpers for scanner providers.
// Enforces HTTPS, a per-provider host allowlist, no embedded credentials, and
// refuses to follow redirects (SSRF hardening). Providers fetch only PUBLIC job
// data — never a résumé or any personal data. Workday (Phase 2) reuses postJson.

const DEFAULT_TIMEOUT_MS = 15000
const USER_AGENT = 'jobdar/0.1 (+https://github.com/getjobdar/jobdar)'

// Block IP literals in loopback/private/link-local ranges + the cloud metadata IP, independent of the
// allowlist. A provider (e.g. jsonld) whose allowlist is derived from the portal's OWN host would
// otherwise let `careers_url: https://169.254.169.254/…` or `https://127.0.0.1/…` through (SSRF).
export function isBlockedHost(host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '::1' || h === '::' || h === '0.0.0.0') return true
  if (/^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true // IPv6 link-local / unique-local
  const m = h.match(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/) // IPv4 (incl. IPv4-mapped ::ffff:a.b.c.d)
  if (m) {
    const a = Number(m[1]), b = Number(m[2])
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true
    if (a === 169 && b === 254) return true        // link-local + cloud metadata (169.254.169.254)
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
  }
  return false
}

export function assertAllowedUrl(rawUrl, { hostAllowlist = [] } = {}) {
  let u
  try {
    u = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (u.protocol !== 'https:') throw new Error(`Refusing non-HTTPS URL: ${rawUrl}`)
  if (u.username || u.password) throw new Error(`Refusing URL with embedded credentials: ${rawUrl}`)
  if (isBlockedHost(u.hostname)) throw new Error(`Refusing private/loopback host: ${u.hostname}`)
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
