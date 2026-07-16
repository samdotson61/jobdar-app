// Jobfaro — `jobfaro seed` (Phase 5.5). Preview or materialize the region employer catalog into
// config/portals.yml, so a user gets useful seeds without hand-editing YAML.
//   jobfaro seed                       # preview employers for your profile's region(s)
//   jobfaro seed --region southwest    # preview a different region
//   jobfaro seed --region midwest --write   # write them to config/portals.yml

import { mkdirSync } from 'node:fs'
import yaml from 'js-yaml'
import { loadProfile, paths, atomicWrite } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectEmployers, toPortals } from '../seed.mjs'
import { color, heading } from '../ui.mjs'

export async function runSeed(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  const regions = flags.region
    ? String(flags.region).split(',').map((s) => s.trim()).filter(Boolean)
    : profile.target_regions
  // Metros are separated by `;` (not `,`, since a metro is itself "City, ST"); matched as a contains.
  const metros = flags.metro ? String(flags.metro).split(';').map((s) => s.trim()).filter(Boolean) : []
  const sectors = flags.sector ? String(flags.sector).split(',').map((s) => s.trim()).filter(Boolean) : []

  const employers = selectEmployers({ regions, metros, sectors })

  heading(t('seed.title'))
  if (employers.length === 0) {
    console.log(color.dim(t('seed.none')))
    return { count: 0 }
  }
  console.log(color.dim(t('seed.matched', { count: employers.length, regions: regions.join(', ') })))
  for (const e of employers) {
    console.log(`  ${e.company}  ${color.dim(`${e.metro || ''} · ${e.sector || ''}`)}`)
  }

  if (flags.write) {
    const portals = toPortals(employers)
    mkdirSync(paths.configDir, { recursive: true }) // fresh JOBFARO_HOME / ~/.jobfaro on first write
    atomicWrite(paths.portals, yaml.dump({ portals }, { lineWidth: 100 }))
    console.log('\n' + color.green(t('seed.written', { count: portals.length, file: 'config/portals.yml' })))
  } else {
    console.log('\n' + color.dim(t('seed.hint')))
  }
  return { count: employers.length }
}
