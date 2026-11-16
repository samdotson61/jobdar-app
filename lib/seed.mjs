// Jobdar — region employer seeds (Phase 5.5). Loads the region-aware employer catalog and
// materializes matching entries into portal config. The `jobdar seed` command and the Phase 6
// wizard both build on this — no hand-editing of portals.yml required.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { paths } from './config.mjs'
import { employersNearMetros } from './portals_pure.mjs'

const SEED_FILE = path.join(paths.root, 'data', 'seed', 'employers.yml')

export function loadEmployers() {
  if (!existsSync(SEED_FILE)) return []
  const data = yaml.load(readFileSync(SEED_FILE, 'utf8'))
  return data && Array.isArray(data.employers) ? data.employers : []
}

// Filter the catalog by region(s), and optionally metro(s) / sector(s). `nationwide` matches all.
export function selectEmployers({ regions = ['midwest'], metros = [], sectors = [] } = {}) {
  const regs = (Array.isArray(regions) ? regions : [regions]).filter(Boolean)
  const all = regs.includes('nationwide') || regs.includes('custom') || regs.length === 0
  const metroList = (Array.isArray(metros) ? metros : [metros]).map((m) => String(m).trim()).filter(Boolean)
  const sectorSet = new Set((Array.isArray(sectors) ? sectors : [sectors]).map((s) => String(s).toLowerCase()).filter(Boolean))
  // 1.71.0: metros select by DISTANCE (within METRO_RADIUS_KM of any of them) ACROSS regions — "Cincinnati,
  // OH; Chicago, IL; New York, NY" spans two regions. An unplaceable metro still matches by name.
  const catalog = loadEmployers()
  const near = metroList.length ? new Set(employersNearMetros(catalog, metroList)) : null
  return catalog.filter((e) => {
    if (near) { if (!near.has(e)) return false } else if (!all && !regs.includes(e.region)) return false
    if (sectorSet.size && !sectorSet.has(String(e.sector || '').toLowerCase())) return false
    return true
  })
}

// Zero-config portals (1.56.1): the portal list a FRESH home should scan — the region catalog, exactly
// what `jobdar seed --region <r> --write` would materialize. The native app has seeded this way since
// Phase 10; serve's /scan silently scanned an empty list instead, so a fresh desktop/web tester's
// "Find matching roles" found nothing with no explanation (caught driving the packed desktop app).
// An empty region selection falls back to the whole catalog — scanning something beats scanning nothing.
export function defaultPortalsForRegions(regions = ['midwest']) {
  const employers = selectEmployers({ regions })
  return toPortals(employers.length ? employers : loadEmployers())
}

// Map employer entries to portal entries (the scanner's input shape).
export function toPortals(employers) {
  return (employers || []).map((e) => {
    const p = { company: e.company, careers_url: e.careers_url }
    if (e.provider) p.provider = e.provider
    if (e.site) p.site = e.site
    if (e.metro) p.metro = e.metro // 1.71.0: fallback for postings whose location names no place
    return p
  })
}
