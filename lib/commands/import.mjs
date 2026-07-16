// Jobfaro — `jobfaro import <file>` (Phase 8c.2). The "upload résumé → go" path: a thin CLI caller over
// the engine contract (lib/engine.mjs importDocument) — extract deterministically, the backend structures
// the PROFILE fields, cv.md is the EXTRACTED text (never a model rewrite). Confirm summary; saves on --write.

import { mkdirSync } from 'node:fs'
import yaml from 'js-yaml'
import { paths, PROFILE_DEFAULTS, loadProfile, atomicWrite } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectActive } from '../inference.mjs'
import { importDocument } from '../engine.mjs'
import { color, heading } from '../ui.mjs'

export async function runImport(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  heading(t('import.title'))

  const file = typeof flags.file === 'string' ? flags.file : positionals[0]
  if (!file) {
    console.error(t('import.usage'))
    process.exitCode = 1
    return { imported: false }
  }
  const active = await selectActive(profile)
  const r = await importDocument(file, { active })
  if (!r.ok) {
    console.log(color.yellow(t(`import.err_${r.error}`, { file })))
    process.exitCode = 1
    return { imported: false }
  }
  console.log(t('import.extracted', { chars: r.cv.length, kind: (r.ext || 'text').replace('.', '').toUpperCase() }))

  const next = {
    ...PROFILE_DEFAULTS,
    ...profile,
    name: r.fields.name || profile.name,
    location: r.fields.location || profile.location,
    target_levels: r.fields.level ? [r.fields.level] : profile.target_levels,
  }
  console.log(t('import.summary'))
  console.log(`  ${t('import.f_name')}: ${next.name || '—'}`)
  console.log(`  ${t('import.f_location')}: ${next.location || '—'}`)
  console.log(`  ${t('import.f_level')}: ${(next.target_levels || []).join(', ') || '—'}`)
  if (r.fields.skills.length) console.log(`  ${t('import.f_skills')}: ${r.fields.skills.join(', ')}`)
  console.log(`  ${t('import.f_cv')}: data/cv.md (${r.cv.length} ${t('import.chars')})`)
  console.log(color.dim('  ' + t('import.backend', { backend: r.structuredBy === 'heuristic' ? t('import.heuristic') : r.structuredBy })))

  if (!(flags.write || flags.yes || flags.y)) {
    console.log('\n' + color.dim(t('import.dry')))
    return { imported: false, fields: r.fields, cvChars: r.cv.length }
  }
  mkdirSync(paths.dataDir, { recursive: true })
  atomicWrite(paths.cv, r.cv)
  mkdirSync(paths.configDir, { recursive: true })
  atomicWrite(paths.profile, yaml.dump(next, { lineWidth: 100 }))
  console.log('\n' + color.green(t('import.saved', { profile: 'config/profile.yml', cv: 'data/cv.md' })))
  return { imported: true, fields: r.fields, cvChars: r.cv.length }
}
