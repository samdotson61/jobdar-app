// Jobdar — `jobdar tailor <company|url|file>` (Apply-stage "Customize"). Model-backed: produces a
// role-targeted CV summary + a complete, grounded cover letter via the engine `tailor` verb, and writes
// both to output/. STEERABLE + re-runnable (Phase 8f): pass `--instruct "<directive>"` to shape tone/
// emphasis/length/structure (never facts); directives accumulate per role and re-runs layer them at low
// temperature, so the SAME directives reproduce the SAME letter (idempotent) and a CHANGED directive
// writes the next `-vN` variant. Resolve the role from the pipeline (--company/--url/positional) or --jd.
//   jobdar tailor Enova                                    # tailor (reuses any stored directives)
//   jobdar tailor Enova --instruct "warmer, one paragraph shorter"
//   jobdar tailor Enova --list                             # show stored directives + current variant
//   jobdar tailor Enova --reset                            # drop stored directives, start clean
import { mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, loadCv, paths, atomicWrite } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectActive } from '../inference.mjs'
import { tailor as engineTailor } from '../engine.mjs'
import { readPipeline } from '../evaluations.mjs'
import { extractText, isExtractable } from '../docparse.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { color, heading } from '../ui.mjs'
import { customizeKey, loadCustomize, getArtifact, effectiveDirectives, contentHash, recordVariant, writeCustomize } from '../customize_store.mjs'

const slug = (s) => String(s || 'role').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'role'
const today = () => new Date().toISOString().slice(0, 10)

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

  const instruct = typeof flags.instruct === 'string' ? flags.instruct : ''
  const reset = !!flags.reset
  const revise = !!flags.revise // re-emit the current variant (e.g. if its file was deleted) — no version bump
  const listOnly = !!flags.list

  const jdFlag = typeof flags.jd === 'string' ? flags.jd : ''
  const target = flags.url || flags.company || jdFlag || positionals[0] || ''
  if (!target) { console.log(color.yellow(t('tailor.no_target'))); return { ok: false } }

  let role = typeof flags.role === 'string' ? flags.role : ''
  let company = typeof flags.company === 'string' ? flags.company : ''
  let url = typeof flags.url === 'string' ? flags.url : ''
  let jd = ''
  if (jdFlag) {
    const d = await resolveJd(jdFlag); jd = d.description || ''; role = role || d.title || ''
  } else {
    const q = String(target).toLowerCase()
    const row = readPipeline().find((r) =>
      flags.url ? r.url === flags.url : String(r.company || '').toLowerCase().includes(q) || String(r.role || '').toLowerCase().includes(q)
    )
    if (row) { role = role || row.role || ''; company = company || row.company || ''; url = url || row.url || ''; const d = await resolveJd(row.url); jd = (d && d.description) || '' }
    else if (isExtractable(target) && existsSync(target)) { const d = await resolveJd(target); jd = d.description || ''; role = role || d.title || '' }
  }

  const key = customizeKey({ url, company, role })
  const store = loadCustomize()
  const prevArt = getArtifact(store, key, 'tailor')

  // --list: show what's stored for this role; no generation.
  if (listOnly) {
    console.log(t('tailor.list_header', { role: role || company || target }))
    const dirs = (prevArt && prevArt.directives) || []
    if (!dirs.length) { console.log(color.dim(t('tailor.list_none'))); return { ok: true, directives: [], variant: 0 } }
    dirs.forEach((d, i) => console.log(`  ${i + 1}. ${d}`))
    console.log(color.dim(t('tailor.list_variant', { variant: `v${(prevArt && prevArt.variant) || 0}` })))
    return { ok: true, directives: dirs, variant: (prevArt && prevArt.variant) || 0 }
  }

  if (!jd) { console.log(color.yellow(t('tailor.no_jd'))); return { ok: false } }

  const directives = effectiveDirectives(prevArt, { directive: instruct, reset })
  const hash = contentHash(cv, jd, directives)
  const unchanged = !!(prevArt && prevArt.hash === hash && !reset)
  const base = slug(`${profile.name || 'resume'}-${role || company || 'role'}`)
  const fileFor = (n) => ({
    cv: path.join(paths.outputDir, `${base}-cv-v${n}.md`),
    cover: path.join(paths.outputDir, `${base}-cover-letter-v${n}.md`),
  })

  // Idempotency: identical (résumé + JD + directives) as the latest variant → nothing to regenerate.
  if (unchanged && !revise) {
    const f = fileFor(prevArt.variant)
    console.log(color.dim(t('tailor.no_change', { variant: `v${prevArt.variant}` })))
    if (existsSync(f.cv)) console.log(color.green(t('tailor.variant_written', { variant: `v${prevArt.variant}`, cv: path.relative(process.cwd(), f.cv), cover: path.relative(process.cwd(), f.cover) })))
    return { ok: true, variant: prevArt.variant, unchanged: true, cv: f.cv, cover: f.cover, directives }
  }

  const active = await selectActive(profile)
  if (!active.up) { console.log(color.yellow(t('tailor.backend_down', { reason: active.reason }))); return { ok: false } }

  if (directives.length) console.log(color.dim(t('tailor.directives_applied', { count: directives.length })))
  console.log(color.dim(t('tailor.running', { role: role || target, backend: active.runtime || active.kind })))
  const r = await engineTailor({ active, jd, cv, profile, role, company, directives })
  if (!r.ok) { console.log(color.red(t('tailor.failed'))); return { ok: false } }

  // Re-emitting an unchanged artifact (--revise) keeps the current variant number; otherwise bump + persist.
  let variant, nextStore = null
  if (unchanged && revise && prevArt) { variant = prevArt.variant }
  else { const rec = recordVariant(store, { key, url, role, company, artifact: 'tailor', directives, hash, dateStr: today() }); variant = rec.variant; nextStore = rec.store }

  mkdirSync(paths.outputDir, { recursive: true })
  const f = fileFor(variant)
  atomicWrite(f.cv, r.tailoredCv)
  atomicWrite(f.cover, `# Cover letter — ${role}${company ? ' @ ' + company : ''}\n\n${r.coverLetter}\n`)
  if (nextStore) writeCustomize(nextStore)

  console.log('\n' + t('tailor.summary_label'))
  console.log(r.summary)
  if (directives.length) {
    console.log('\n' + color.dim(t('tailor.directives_list_header')))
    directives.forEach((d, i) => console.log(color.dim(`  ${i + 1}. ${d}`)))
  }
  console.log('\n' + color.green(t('tailor.variant_written', { variant: `v${variant}`, cv: path.relative(process.cwd(), f.cv), cover: path.relative(process.cwd(), f.cover) })))
  if (!r.coverComplete) console.log(color.yellow(t('tailor.cover_short')))
  console.log(color.dim(t('tailor.pdf_hint')))
  return { ok: true, variant, cv: f.cv, cover: f.cover, directives }
}
