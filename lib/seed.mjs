// Jobfaro — region employer seeds (Phase 5.5). Loads the region-aware employer catalog and
// materializes matching entries into portal config. The `jobfaro seed` command and the Phase 6
// wizard both build on this — no hand-editing of portals.yml required.

import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { paths } from './config.mjs'

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
  const metroList = (Array.isArray(metros) ? metros : [metros]).map((m) => String(m).toLowerCase()).filter(Boolean)
  const sectorSet = new Set((Array.isArray(sectors) ? sectors : [sectors]).map((s) => String(s).toLowerCase()).filter(Boolean))
  return loadEmployers().filter((e) => {
    if (!all && !regs.includes(e.region)) return false
    // metro is a CONTAINS match, so "--metro Cincinnati" matches the entry "Cincinnati, OH"
    if (metroList.length && !metroList.some((m) => String(e.metro || '').toLowerCase().includes(m))) return false
    if (sectorSet.size && !sectorSet.has(String(e.sector || '').toLowerCase())) return false
    return true
  })
}

// Map employer entries to portal entries (the scanner's input shape).
export function toPortals(employers) {
  return (employers || []).map((e) => {
    const p = { company: e.company, careers_url: e.careers_url }
    if (e.provider) p.provider = e.provider
    if (e.site) p.site = e.site
    return p
  })
}
