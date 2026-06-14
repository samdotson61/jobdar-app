// Jobdar — `jobdar init` (Phase 6.1). Bilingual interactive setup wizard. Asks a few questions,
// then writes config/profile.yml AND materializes config/portals.yml from the region seed catalog —
// so `jobdar scan` works immediately, no YAML editing. `--defaults`/`--yes` runs non-interactively;
// any field can be preset with a flag (--region, --levels, --name, --resume, …).

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import yaml from 'js-yaml'
import { paths, PROFILE_DEFAULTS, SUPPORTED_LANGUAGES } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags } from '../cli.mjs'
import { selectEmployers, toPortals } from '../seed.mjs'
import { bootstrapResume } from '../resume.mjs'
import { ask, askChoice, closePrompt } from '../prompt.mjs'
import { color, heading } from '../ui.mjs'

const REGION_CHOICES = ['midwest', 'northeast', 'southeast', 'southwest', 'west', 'nationwide']

// API keys NEVER go in the tracked profile.yml — store in a gitignored file under data/.
function saveApiKey(key) {
  mkdirSync(paths.dataDir, { recursive: true })
  writeFileSync(path.join(paths.dataDir, 'credentials.env'), `JOBDAR_API_KEY=${key}\n`, { mode: 0o600 })
}

export async function runInit(argv = []) {
  const { flags } = parseFlags(argv)
  const interactive = !(flags.defaults || flags.yes || flags.y)

  // Language first (bilingual prompt), then everything else in the chosen language.
  let lang = SUPPORTED_LANGUAGES.includes(flags.lang || flags.language) ? flags.lang || flags.language : 'en'
  let t = getT(lang)
  heading(t('init.title'))
  console.log(color.dim(t('init.intro')))
  if (interactive && !(flags.lang || flags.language)) {
    lang = await askChoice(t('init.q_language'), [
      { value: 'en', label: 'American English' },
      { value: 'es', label: 'Español' },
    ], 'en')
    t = getT(lang)
  }

  const askText = async (flagVal, key) =>
    flagVal != null ? String(flagVal) : interactive ? await ask(t(key), '') : ''
  const pickOne = async (flagVal, key, options, def) =>
    flagVal != null ? String(flagVal) : interactive ? await askChoice(t(key), options, def) : def

  const name = await askText(flags.name, 'init.q_name')
  const location = await askText(flags.location, 'init.q_location')
  const salaryRaw = flags.salary != null ? String(flags.salary) : interactive ? await ask(t('init.q_salary'), '') : ''
  const target_salary = Number(String(salaryRaw).replace(/[^0-9]/g, '')) || 0
  const region = await pickOne(flags.region, 'init.q_region', REGION_CHOICES.map((r) => ({ value: r, label: t(`regions.${r}`) })), 'midwest')
  const levelSel = await pickOne(flags.levels, 'init.q_levels', [
    { value: 'entry', label: t('init.lvl_entry') },
    { value: 'entry,mid', label: t('init.lvl_entry_mid') },
    { value: 'entry,mid,senior', label: t('init.lvl_all') },
  ], 'entry')
  const tuning = await pickOne(flags.tuning, 'init.q_tuning', [
    { value: 'new_grad', label: t('init.tun_new_grad') },
    { value: 'early_career', label: t('init.tun_early_career') },
    { value: 'no_degree', label: t('init.tun_no_degree') },
    { value: 'career_changer', label: t('init.tun_career_changer') },
  ], 'new_grad')
  const inference = await pickOne(flags.inference, 'init.q_inference', [
    { value: 'local', label: t('init.inf_local') },
    { value: 'api', label: t('init.inf_api') },
  ], 'local')

  let apiKeyStatus = null
  if (inference === 'api') {
    const key = flags['api-key'] != null ? String(flags['api-key']) : interactive ? await ask(t('init.q_api_key'), '') : ''
    if (key) {
      saveApiKey(key)
      apiKeyStatus = t('init.key_saved', { file: 'data/credentials.env' })
    } else {
      apiKeyStatus = t('init.key_skipped')
    }
  }

  closePrompt()

  const resumeInfo = flags.resume ? bootstrapResume(String(flags.resume), t) : null

  const profile = {
    ...PROFILE_DEFAULTS,
    language: lang,
    target_regions: [region],
    target_levels: levelSel.split(',').map((s) => s.trim()).filter(Boolean),
    tuning_profile: tuning,
    inference,
    name: (resumeInfo && resumeInfo.name) || name,
    location: (resumeInfo && resumeInfo.location) || location,
    target_salary,
  }
  mkdirSync(paths.configDir, { recursive: true }) // first run may target a fresh JOBDAR_HOME / ~/.jobdar
  writeFileSync(paths.profile, yaml.dump(profile, { lineWidth: 100 }))

  const portals = toPortals(selectEmployers({ regions: [region] }))
  if (portals.length) writeFileSync(paths.portals, yaml.dump({ portals }, { lineWidth: 100 }))

  console.log('')
  if (portals.length) console.log(color.green(t('init.done', { profile: 'config/profile.yml', portals: portals.length })))
  else console.log(color.yellow(t('init.seeded_none', { profile: 'config/profile.yml' })))
  if (apiKeyStatus) console.log(color.dim(apiKeyStatus))
  if (inference !== 'api') console.log(color.dim(t('init.local_hint')))
  if (resumeInfo) console.log(color.dim(resumeInfo.message))
  console.log(t('init.next'))
  console.log(color.dim(t('dashboard.access')))
  return { profile, portals: portals.length, lang }
}
