// Jobdar — which boards a scan reads (PURE: arrays in → out, no fs). Shared by `jobdar serve` /scan and
// the phone's on-device scan (via @jobdar/engine).
//
// Before 1.67.4 both seeded the saved portal list from the catalog ONCE — on the first scan, for the
// region searched that day — and every later scan read that saved list. Searching the West first and the
// Midwest later therefore scanned the West's employers filtered to Midwest locations: almost nothing.
// Now every scan takes the catalog boards for the regions REQUESTED plus every board the person added
// themselves (`/discover`, or hand-edited) — a board that is not in the catalog at all. Catalog boards
// from other regions are left out of that scan but never deleted.

import { placeMetros, placesIn, distanceKm, METRO_RADIUS_KM } from './regions.mjs'

const key = (p) => String((p && p.careers_url) || '').trim().toLowerCase()

// Catalog entries whose metro lies within METRO_RADIUS_KM of ANY target metro, across every region
// (1.71.0 target_metros). An entry whose metro can't be placed falls back to a name-contains match
// ("Cincinnati" matches "Cincinnati, OH"). Pure.
export function employersNearMetros(employers, metros) {
  const targets = placeMetros(metros)
  const words = (metros || []).map((m) => String(m || '').toLowerCase().split(',')[0].trim()).filter(Boolean)
  return (employers || []).filter((e) => {
    const home = placesIn(e.metro)[0]
    if (home && targets.length) return targets.some((t) => distanceKm(t, home) <= METRO_RADIUS_KM)
    const m = String(e.metro || '').toLowerCase()
    return Boolean(m) && words.some((w) => m.includes(w))
  })
}

// Saved portals written before 1.71.0 carry no `metro`; take it from the catalog entry with the same
// careers URL so an unplaceable posting location can still fall back to it. Never overwrites. Pure.
// 1.72.0: the catalog's `nlx` (National Labor Exchange listing) is filled the same way — a portals.yml
// written before 1.72.0 has none.
export function withCatalogMetro(portals, employers) {
  const byUrl = new Map((employers || []).filter((e) => e.metro || e.nlx).map((e) => [key(e), e]))
  return (portals || []).map((p) => {
    const e = p && byUrl.get(key(p))
    if (!e) return p
    const out = { ...p }
    if (!out.metro && e.metro) out.metro = e.metro
    if (!out.nlx && e.nlx) out.nlx = e.nlx
    return out
  })
}

// Catalog entries for the regions asked for; `nationwide` (or no region) means the whole catalog.
export function employersForRegions(employers, regions) {
  const regs = (Array.isArray(regions) ? regions : [regions]).filter(Boolean)
  const all = regs.length === 0 || regs.includes('nationwide') || regs.includes('custom')
  return (employers || []).filter((e) => all || regs.includes(String(e.region || '')))
}

// Materialize catalog entries into portal configs ({company, careers_url, provider?, site?}).
export function employersToPortals(employers) {
  return (employers || []).map((e) => {
    const p = { company: e.company, careers_url: e.careers_url }
    if (e.provider) p.provider = e.provider
    if (e.site) p.site = e.site
    if (e.metro) p.metro = e.metro // 1.71.0: the fallback for postings whose location names no place
    if (e.nlx) p.nlx = e.nlx // 1.72.0: the National Labor Exchange listing a person's scan falls back to
    return p
  })
}

// The boards one scan reads: the requested regions' catalog boards + the person's own boards (saved
// portals that match no catalog entry in ANY region), de-duplicated by careers URL. Pure.
// `metros` (1.71.0): when the person targets cities, the catalog boards are the ones near any of those
// cities (across regions) instead of the regions' boards. Empty = the 1.67.4 behaviour exactly.
export function portalsForScan(savedPortals, employers, regions, metros = []) {
  const catalogUrls = new Set((employers || []).map(key).filter(Boolean))
  const own = (savedPortals || []).filter((p) => key(p) && !catalogUrls.has(key(p)))
  const out = []
  const seen = new Set()
  const fromCatalog = metros && metros.length ? employersNearMetros(employers, metros) : employersForRegions(employers, regions)
  for (const p of [...employersToPortals(fromCatalog), ...own]) {
    const k = key(p)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}
