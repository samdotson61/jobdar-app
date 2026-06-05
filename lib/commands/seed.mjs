// Jobdar — `jobdar seed` (Phase 5.5). Preview or materialize the region employer catalog into
// config/portals.yml, so a user gets useful seeds without hand-editing YAML.
//   jobdar seed                       # preview employers for your profile's region(s)
//   jobdar seed --region southwest    # preview a different region
//   jobdar seed --region midwest --write   # write them to config/portals.yml

import { writeFileSync } from 'node:fs'
import yaml from 'js-yaml'
import { loadProfile, paths } from '../config.mjs'
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
  const metros = flags.metro ? String(flags.metro).split(',').map((s) => s.trim()) : []

  const employers = selectEmployers({ regions, metros })

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
    writeFileSync(paths.portals, yaml.dump({ portals }, { lineWidth: 100 }))
    console.log('\n' + color.green(t('seed.written', { count: portals.length, file: 'config/portals.yml' })))
  } else {
    console.log('\n' + color.dim(t('seed.hint')))
  }
  return { count: employers.length }
}
