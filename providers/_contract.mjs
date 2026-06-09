// Jobdar — scanner provider contract & registry.
//
// A provider is a plugin that lists public job postings from one ATS. Each
// provider module default-exports an object:
//
//   {
//     id: string,                       // unique, e.g. 'greenhouse'
//     detect(portal): match | null,     // can this provider handle the portal? (no I/O)
//     async fetch(match, ctx): Job[],   // DISCOVERY: list roles (no JD — keeps bulk scans light)
//     async fetchJob(url, ctx): Desc,   // EVAL-TIME: fetch ONE role's full JD | null
//   }
//
// portal — an entry from config/portals.yml: { company, careers_url, provider?, site? }
// match  — provider-specific handle returned by detect() and passed to fetch()
// Job    — { title, url, company, location, postedOn? }   discovery shape — UNIFORM across providers, no JD
// Desc   — { title, location, description }                one role's full JD, fetched for the model's eval
//
// All three providers (greenhouse, workday, icims) implement the same contract: fetch() discovers,
// fetchJob() supplies the JD at eval time. detect() must be cheap and side-effect-free (no network);
// fetch()/fetchJob() touch only public job data via lib/http.mjs (HTTPS + host allowlist).

import workday from './workday.mjs'
import greenhouse from './greenhouse.mjs'
import icims from './icims.mjs'
import lever from './lever.mjs'
import ashby from './ashby.mjs'
import jsonld from './jsonld.mjs'

// Register providers here as they land. `jsonld` is opt-in (detect requires `provider: jsonld`).
const REGISTRY = [workday, greenhouse, icims, lever, ashby, jsonld]

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

// Fetch one role's full JD for the model's `eval`, via whichever provider owns the URL. Returns a Desc
// ({ title, location, description }) or null if no provider matches or it can't be fetched.
export async function fetchJobDescription(url, ctx = {}) {
  const hit = resolveProvider({ careers_url: url })
  if (!hit || typeof hit.provider.fetchJob !== 'function') return null
  return hit.provider.fetchJob(url, ctx)
}
