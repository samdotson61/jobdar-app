// Jobdar — `jobdar import <file>` (Phase 8c.2). The "upload résumé → go" path: extract the text
// deterministically (lib/docparse.mjs), then the inference backend structures the PROFILE fields
// (name / metro / level / skills). cv.md is the EXTRACTED text itself — the model never rewrites the
// résumé (no fabrication; the candidate's real words). Shows a confirm summary; saves on --write/--yes.

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { paths, PROFILE_DEFAULTS, loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { extractText } from '../docparse.mjs'
import { parseResumeText } from '../resume.mjs'
import { selectActive, callBackend } from '../inference.mjs'
import { parseEvalJson } from '../eval_engine.mjs'
import { color, heading } from '../ui.mjs'

const STRUCT_SYSTEM =
  'Extract structured profile fields from the résumé text below. Use ONLY what the text states — never ' +
  'invent. Reply with ONLY this JSON object, no prose:\n' +
  '{"name":"","location":"City, ST","level":"entry|mid|senior","skills":[]}\n' +
  'location = the candidate\'s metro as "City, ST"; level = their current career level; skills = up to 8 ' +
  'concrete skills/tools from the résumé.'

const LEVELS = ['entry', 'mid', 'senior']

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
  const doc = extractText(file)
  if (doc.error || !doc.text.trim()) {
    console.log(color.yellow(t(`import.err_${doc.error || 'empty'}`, { file }) || t('import.err_unsupported', { file })))
    process.exitCode = 1
    return { imported: false }
  }
  console.log(t('import.extracted', { chars: doc.text.length, kind: (doc.ext || 'text').replace('.', '').toUpperCase() }))

  // Understanding: the backend structures the profile fields. Falls back to a deterministic heuristic
  // (name/email/metro) when no backend is up — import still works offline with no model.
  let fields = { name: '', location: '', level: '', skills: [] }
  const active = await selectActive(profile)
  if (active.up) {
    try {
      const { text } = await callBackend(active, { system: STRUCT_SYSTEM, user: doc.text.slice(0, 8000), maxTokens: 400, cache: false })
      const j = parseEvalJson(text)
      if (j) fields = { name: j.name || '', location: j.location || '', level: LEVELS.includes(j.level) ? j.level : '', skills: Array.isArray(j.skills) ? j.skills.slice(0, 8) : [] }
    } catch {
      /* fall through to heuristic */
    }
  }
  if (!fields.name && !fields.location) {
    const h = parseResumeText(doc.text)
    fields.name = fields.name || h.name
    fields.location = fields.location || h.location
  }

  // cv.md is the EXTRACTED text (the candidate's real résumé), never a model rewrite.
  const cv = doc.text
  const next = {
    ...PROFILE_DEFAULTS,
    ...profile,
    name: fields.name || profile.name,
    location: fields.location || profile.location,
    target_levels: fields.level ? [fields.level] : profile.target_levels,
  }

  console.log(t('import.summary'))
  console.log(`  ${t('import.f_name')}: ${next.name || '—'}`)
  console.log(`  ${t('import.f_location')}: ${next.location || '—'}`)
  console.log(`  ${t('import.f_level')}: ${(next.target_levels || []).join(', ') || '—'}`)
  if (fields.skills.length) console.log(`  ${t('import.f_skills')}: ${fields.skills.join(', ')}`)
  console.log(`  ${t('import.f_cv')}: data/cv.md (${cv.length} ${t('import.chars')})`)
  console.log(color.dim('  ' + t('import.backend', { backend: active.up ? active.runtime || active.kind : t('import.heuristic') })))

  if (!(flags.write || flags.yes || flags.y)) {
    console.log('\n' + color.dim(t('import.dry')))
    return { imported: false, fields, cvChars: cv.length }
  }
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(paths.cv, cv)
  mkdirSync(paths.configDir, { recursive: true })
  writeFileSync(paths.profile, yaml.dump(next, { lineWidth: 100 }))
  console.log('\n' + color.green(t('import.saved', { profile: 'config/profile.yml', cv: 'data/cv.md' })))
  return { imported: true, fields, cvChars: cv.length }
}
