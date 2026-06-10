// Jobdar — `jobdar pdf` (career-ops "Customize" stage). Renders your cv.md into a tailored,
// ATS-friendly HTML résumé under output/, and to PDF when Playwright is installed (lazy-imported so
// the heavy dep stays optional). Tailoring target comes from a pipeline role (--company / --url /
// positional) so the résumé is flagged for that job.
//   jobdar pdf                 # render your résumé
//   jobdar pdf Enova           # tailor to the matching pipeline role

import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadProfile, loadCv, paths } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline } from '../evaluations.mjs'
import { cvToHtml, matchedKeywords } from '../cv_render.mjs'
import { color, heading } from '../ui.mjs'

const slug = (s) =>
  String(s || 'resume').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60) || 'resume'

export async function runPdf(argv = []) {
  const { flags, positionals } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  const cv = loadCv()

  heading(t('pdf.title'))
  if (!cv.trim()) {
    console.log(color.yellow(t('pdf.no_cv')))
    return { ok: false }
  }

  // Resolve a target role from the pipeline (by url / company / role substring).
  const target = flags.url || flags.company || positionals[0] || ''
  let role = null
  if (target) {
    const q = String(target).toLowerCase()
    role = readPipeline().find((r) =>
      flags.url ? r.url === flags.url : String(r.company || '').toLowerCase().includes(q) || String(r.role || '').toLowerCase().includes(q)
    )
  }
  const roleTitle = role ? role.role : ''
  const company = role ? role.company : ''
  const matched = roleTitle ? matchedKeywords(roleTitle, cv) : []
  const html = cvToHtml(cv, { role: roleTitle, company, matched, name: profile.name })

  mkdirSync(paths.outputDir, { recursive: true })
  const base = slug(`${profile.name || 'resume'}${roleTitle ? '-' + roleTitle : ''}`)
  const htmlPath = path.join(paths.outputDir, base + '.html')
  writeFileSync(htmlPath, html)
  console.log(color.green(t('pdf.html_written', { file: path.relative(process.cwd(), htmlPath) })))

  // Opt-in PDF: Playwright stays optional and is lazy-imported only on demand.
  try {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const pdfPath = path.join(paths.outputDir, base + '.pdf')
      await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, margin: { top: '0.6in', bottom: '0.6in', left: '0.7in', right: '0.7in' } })
      console.log(color.green(t('pdf.pdf_written', { file: path.relative(process.cwd(), pdfPath) })))
    } finally {
      await browser.close()
    }
  } catch {
    console.log(color.dim(t('pdf.no_playwright')))
  }
  return { ok: true, html: htmlPath }
}
