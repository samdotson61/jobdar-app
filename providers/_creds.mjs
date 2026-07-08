// Jobdar — provider-credential seam (Phase 10). Providers must stay PURE (fetch-only, no fs/config)
// so the native/web apps can bundle them; but USAJobs needs a BYO key. This module holds a settable
// credential source: the CLI wires it to lib/config.mjs's credentials.env reader at startup
// (bin/jobdar + scan.mjs); the apps wire their own settings store — or leave the default (no creds),
// which keeps key-gated providers dormant, exactly like a CLI user who never added a key.

let source = () => ({ key: '', email: '' })

// Wire where USAJobs creds come from. `fn` returns { key, email } (both '' when not configured).
export function setUsaJobsCredsSource(fn) {
  if (typeof fn === 'function') source = fn
}

export function getUsaJobsCreds() {
  try {
    const c = source() || {}
    return { key: String(c.key || ''), email: String(c.email || '') }
  } catch {
    return { key: '', email: '' }
  }
}
