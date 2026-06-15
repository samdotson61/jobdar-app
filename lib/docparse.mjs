// Jobdar — document text extraction (Phase 8c.1). DETERMINISTIC: a parser, never a model. Understanding
// (text → structured fields) is the inference backend's job (8c.2), so it stays private-by-default.
// Dependency-light on purpose: DOCX via the system `unzip` (its XML is a zip member) with a macOS
// `textutil` fallback; PDF via `pdftotext` when present (else an honest failure + DOCX/text hint, 8c.4);
// .txt/.md pass through. The web/serverless path (Phase 9) swaps in unpdf/mammoth behind extractText().

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const decode = (s) =>
  String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))

// .docx body → text. word/document.xml holds the paragraphs; map <w:p>→newline, <w:tab/>→tab, strip rest.
function docxText(file) {
  let xml
  try {
    xml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    try {
      return execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return ''
    }
  }
  return decode(
    xml
      .replace(/<w:p\b[^>]*>/g, '\n')
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pdfText(file) {
  try {
    return execFileSync('pdftotext', ['-q', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null // no extractor on this machine
  }
}

// extractText(file) → { ext, text, error? }. error is a short code; the command maps it to a localized hint.
export function extractText(file) {
  if (!file || !existsSync(file)) return { ext: '', text: '', error: 'not-found' }
  const ext = path.extname(file).toLowerCase()
  if (ext === '' || ext === '.txt' || ext === '.md') {
    const text = readFileSync(file, 'utf8')
    return { ext, text, error: text.trim().length < 20 ? 'empty' : undefined }
  }
  if (ext === '.docx') {
    const text = docxText(file)
    return { ext, text, error: text.trim().length < 30 ? 'empty' : undefined } // 8c.4: near-empty → honest fail
  }
  if (ext === '.pdf') {
    const text = pdfText(file)
    if (text == null) return { ext, text: '', error: 'pdf-no-extractor' }
    return { ext, text, error: text.trim().length < 30 ? 'image-pdf' : undefined } // scanned/image PDF
  }
  if (ext === '.doc' || ext === '.rtf') {
    try {
      const text = execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      return { ext, text, error: text.length < 30 ? 'empty' : undefined }
    } catch {
      return { ext, text: '', error: 'unsupported' }
    }
  }
  return { ext, text: '', error: 'unsupported' }
}

export const isExtractable = (file) => {
  const e = path.extname(String(file || '')).toLowerCase()
  return ['', '.txt', '.md', '.docx', '.pdf', '.doc', '.rtf'].includes(e)
}

// Lightly markdown-structure extracted résumé text: mark the name (`# `), recognized section headers
// (`## `), and bullet lines (`- `). DETERMINISTIC — it only adds markers, never changes a word (so cv.md
// stays the EXTRACTED text, not a model rewrite). Gives the renderer real headings and the tailorer a
// `## ` anchor to lead the CV with a tailored summary.
const CV_SECTION = /^(summary|objective|profile|education|experience|work experience|professional experience|employment(\s+history)?|projects?|skills?|technical skills|core competencies|leadership|activities|certifications?|licenses?|awards?|honors?|volunteer(ing)?|publications?|languages?|interests?|references)\s*:?\s*$/i
export function structureCv(text) {
  const lines = String(text || '').split(/\r?\n/)
  const out = []
  let named = false
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim()
    if (!t) { out.push(''); continue }
    if (!named && i < 3 && t.length <= 60 && !/^[#•·▪‣*\-]/.test(t)) { out.push(`# ${t}`); named = true; continue }
    if (t.length <= 40 && CV_SECTION.test(t)) { out.push(`## ${t.replace(/:$/, '')}`); continue }
    if (/^[•·▪‣]\s+/.test(t)) { out.push(`- ${t.replace(/^[•·▪‣]\s+/, '')}`); continue }
    out.push(lines[i])
  }
  return out.join('\n')
}
