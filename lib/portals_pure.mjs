// Jobdar — which boards a scan reads (PURE: arrays in → out, no fs). Shared by `jobdar serve` /scan and
// the phone's on-device scan (via @jobdar/engine).
//
// Before 1.67.4 both seeded the saved portal list from the catalog ONCE — on the first scan, for the
// region searched that day — and every later scan read that saved list. Searching the West first and the
// Midwest later therefore scanned the West's employers filtered to Midwest locations: almost nothing.
// Now every scan takes the catalog boards for the regions REQUESTED plus every board the person added
// themselves (`/discover`, or hand-edited) — a board that is not in the catalog at all. Catalog boards
// from other regions are left out of that scan but never deleted.

const key = (p) => String((p && p.careers_url) || '').trim().toLowerCase()

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
    return p
  })
}

// The boards one scan reads: the requested regions' catalog boards + the person's own boards (saved
// portals that match no catalog entry in ANY region), de-duplicated by careers URL. Pure.
export function portalsForScan(savedPortals, employers, regions) {
  const catalogUrls = new Set((employers || []).map(key).filter(Boolean))
  const own = (savedPortals || []).filter((p) => key(p) && !catalogUrls.has(key(p)))
  const out = []
  const seen = new Set()
  for (const p of [...employersToPortals(employersForRegions(employers, regions)), ...own]) {
    const k = key(p)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}
