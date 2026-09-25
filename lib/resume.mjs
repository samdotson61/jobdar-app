// Jobdar — résumé bootstrap (Phase 6.6). Turns a pasted/plain-text résumé into data/cv.md and
// prefilled profile fields. PDF/DOCX parsing needs heavy deps, so those are deferred to the agent
// layer (the onboard mode reads them) — kept light and dependency-free here.

import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { paths, atomicWrite } from './config.mjs'

// Heuristically pull name / email / metro from résumé text. Never invents — blanks if unsure.
export function parseResumeText(text) {
  const str = String(text || '')
  const email = (str.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || ''
  const location = (str.match(/\b[A-Z][a-zA-Z.\- ]+,\s*[A-Z]{2}\b/) || [])[0] || ''
  const first = str.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || ''
  const name = first && first.length <= 50 && !first.includes('@') && !/\d/.test(first) ? first : ''
  return { name, email, location }
}

// Save a text/markdown résumé to data/cv.md and return prefill info. PDF/DOCX → manual message.
export function bootstrapResume(file, t) {
  if (!existsSync(file)) return { name: '', location: '', message: `(${file} not found)` }
  const ext = path.extname(file).toLowerCase()
  if (ext === '.txt' || ext === '.md' || ext === '') {
    const text = readFileSync(file, 'utf8')
    mkdirSync(paths.dataDir, { recursive: true })
    atomicWrite(paths.cv, text)
    return { ...parseResumeText(text), message: t('init.resume_saved', { file: 'data/cv.md' }) }
  }
  return { name: '', location: '', message: t('init.resume_manual', { file, kind: ext.replace('.', '').toUpperCase() }) }
}
