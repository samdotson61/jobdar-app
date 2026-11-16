// Jobdar — `jobdar seed` (Phase 5.5). Preview or materialize the region employer catalog into
// config/portals.yml, so a user gets useful seeds without hand-editing YAML.
//   jobdar seed                       # preview employers for your profile's region(s)
//   jobdar seed --region southwest    # preview a different region
//   jobdar seed --region midwest --write   # write them to config/portals.yml
//   jobdar seed --metro "Cincinnati, OH; Chicago, IL" --write   # boards near those cities, any region (1.71.0)

import { mkdirSync } from 'node:fs'
import yaml from 'js-yaml'
import { loadProfile, paths, atomicWrite, REGIONS } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang, splitList, unknownTokens } from '../cli.mjs'
import { selectEmployers, toPortals, loadEmployers } from '../seed.mjs'
import { targetMetrosOf, placeMetros } from '../regions.mjs'
import { color, heading } from '../ui.mjs'

export async function runSeed(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  // 1.71.0: lists split on commas AND spaces (PowerShell turns an unquoted `midwest,northeast` into
  // "midwest northeast"); unknown values are refused by name instead of matching nothing.
  const regions = flags.region ? splitList(flags.region) : profile.target_regions
  // Metros are separated by `;` (not `,`, since a metro is itself "City, ST"); matched as a contains.
  // No --metro and no --region → the profile's target_metros (1.71.0), so `seed --write` follows `init --metros`.
  const metros = flags.metro ? splitList(flags.metro, { sep: ';', keepCase: true }) : flags.region ? [] : targetMetrosOf(profile)
  const sectors = flags.sector ? splitList(flags.sector) : []
  const knownSectors = [...new Set(loadEmployers().map((e) => String(e.sector || '').toLowerCase()).filter(Boolean))].sort()
  const unplaced = metros.filter((m) => !placeMetros([m]).length)
  if (unplaced.length) {
    console.error(color.red(t('common.bad_metro', { bad: unplaced.join('; ') })))
    process.exitCode = 1
    return { count: 0 }
  }
  for (const [flag, list, known] of [['--region', flags.region ? regions : [], REGIONS], ['--sector', sectors, knownSectors]]) {
    const bad = unknownTokens(list, known)
    if (bad.length) {
      console.error(color.red(t('common.bad_list', { flag, bad: bad.join(', '), known: known.join(', ') })))
      process.exitCode = 1
      return { count: 0 }
    }
  }

  const employers = selectEmployers({ regions, metros, sectors })

  heading(t('seed.title'))
  if (employers.length === 0) {
    console.log(color.dim(t('seed.none')))
    return { count: 0 }
  }
  console.log(color.dim(t('seed.matched', { count: employers.length, regions: metros.length ? metros.join('; ') : regions.join(', ') })))
  for (const e of employers) {
    console.log(`  ${e.company}  ${color.dim(`${e.metro || ''} · ${e.sector || ''}`)}`)
  }

  if (flags.write) {
    const portals = toPortals(employers)
    mkdirSync(paths.configDir, { recursive: true }) // fresh JOBDAR_HOME / ~/.jobdar on first write
    atomicWrite(paths.portals, yaml.dump({ portals }, { lineWidth: 100 }))
    console.log('\n' + color.green(t('seed.written', { count: portals.length, file: 'config/portals.yml' })))
  } else {
    console.log('\n' + color.dim(t('seed.hint')))
  }
  return { count: employers.length }
}
