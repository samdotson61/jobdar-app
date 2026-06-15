// Jobdar — `jobdar tailor <company|url|file>` (Apply-stage "Customize"). Model-backed: produces a
// role-targeted CV summary + a complete, grounded cover letter via the engine `tailor` verb, and writes
// both to output/. Resolve the role from the pipeline (--company/--url/positional) or pass --jd <file>.
//   jobdar tailor Enova            # tailor to the matching pipeline role
//   jobdar tailor --jd jd.txt --role "Marketing Coordinator" --company Acme
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, loadCv, paths } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectActive } from '../inference.mjs'
import { tailor as engineTailor } from '../engine.mjs'
import { readPipeline } from '../evaluations.mjs'
import { extractText, isExtractable } from '../docparse.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { color, heading } from '../ui.mjs'

const slug = (s) => String(s || 'role').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'role'

async function resolveJd(ref) {
  if (ref && isExtractable(ref) && existsSync(ref)) {
    const d = extractText(ref)
    return { title: String(ref).split('/').pop(), description: d.error ? '' : d.text }
  }
  return fetchJobDescription(ref)
}

export async function runTailor(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  const cv = loadCv()

  heading(t('tailor.title'))
  if (!cv.trim()) { console.log(color.yellow(t('tailor.no_cv'))); return { ok: false } }

  const jdFlag = typeof flags.jd === 'string' ? flags.jd : ''
  const target = flags.url || flags.company || jdFlag || positionals[0] || ''
  if (!target) { console.log(color.yellow(t('tailor.no_target'))); return { ok: false } }

  let role = typeof flags.role === 'string' ? flags.role : ''
  let company = typeof flags.company === 'string' ? flags.company : ''
  let jd = ''
  if (jdFlag) {
    const d = await resolveJd(jdFlag); jd = d.description || ''; role = role || d.title || ''
  } else {
    const q = String(target).toLowerCase()
    const row = readPipeline().find((r) =>
      flags.url ? r.url === flags.url : String(r.company || '').toLowerCase().includes(q) || String(r.role || '').toLowerCase().includes(q)
    )
    if (row) { role = role || row.role || ''; company = company || row.company || ''; const d = await resolveJd(row.url); jd = (d && d.description) || '' }
    else if (isExtractable(target) && existsSync(target)) { const d = await resolveJd(target); jd = d.description || ''; role = role || d.title || '' }
  }
  if (!jd) { console.log(color.yellow(t('tailor.no_jd'))); return { ok: false } }

  const active = await selectActive(profile)
  if (!active.up) { console.log(color.yellow(t('tailor.backend_down', { reason: active.reason }))); return { ok: false } }

  console.log(color.dim(t('tailor.running', { role: role || target, backend: active.runtime || active.kind })))
  const r = await engineTailor({ active, jd, cv, profile, role, company })
  if (!r.ok) { console.log(color.red(t('tailor.failed'))); return { ok: false } }

  mkdirSync(paths.outputDir, { recursive: true })
  const base = slug(`${profile.name || 'resume'}-${role || company || 'role'}`)
  const cvPath = path.join(paths.outputDir, base + '-cv.md')
  const coverPath = path.join(paths.outputDir, base + '-cover-letter.md')
  writeFileSync(cvPath, r.tailoredCv)
  writeFileSync(coverPath, `# Cover letter — ${role}${company ? ' @ ' + company : ''}\n\n${r.coverLetter}\n`)

  console.log('\n' + t('tailor.summary_label'))
  console.log(r.summary)
  console.log('\n' + color.green(t('tailor.written', { cv: path.relative(process.cwd(), cvPath), cover: path.relative(process.cwd(), coverPath) })))
  if (!r.coverComplete) console.log(color.yellow(t('tailor.cover_short')))
  console.log(color.dim(t('tailor.pdf_hint')))
  return { ok: true, cv: cvPath, cover: coverPath }
}
