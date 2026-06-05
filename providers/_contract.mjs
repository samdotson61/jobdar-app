// Jobdar — scanner provider contract & registry.
//
// A provider is a plugin that lists public job postings from one ATS. Each
// provider module default-exports an object:
//
//   {
//     id: string,                      // unique, e.g. 'greenhouse'
//     detect(portal): match | null,    // can this provider handle the portal? (no I/O)
//     async fetch(match, ctx): Job[],  // return normalized postings
//   }
//
// portal — an entry from config/portals.yml: { company, careers_url, provider?, site? }
// match  — provider-specific handle returned by detect() and passed to fetch()
// Job    — { title, url, company, location, postedOn? }
//
// detect() must be cheap and side-effect-free (no network). fetch() does the I/O
// and must touch only public job data via lib/http.mjs (HTTPS + host allowlist).

import greenhouse from './greenhouse.mjs'

// Register providers here as they land: Workday (Phase 2), iCIMS (Phase 3), …
const REGISTRY = [greenhouse]

export function allProviders() {
  return REGISTRY.slice()
}

export function providerIds() {
  return REGISTRY.map((p) => p.id)
}

// Resolve the provider for a portal. Honors an explicit `provider:` override,
// otherwise asks each provider's detect(). Returns { provider, match } or null.
export function resolveProvider(portal) {
  if (portal && portal.provider) {
    const forced = REGISTRY.find((p) => p.id === portal.provider)
    if (forced) {
      const match = forced.detect(portal) || { company: portal.company, portal }
      return { provider: forced, match }
    }
  }
  for (const provider of REGISTRY) {
    const match = provider.detect(portal)
    if (match) return { provider, match }
  }
  return null
}
