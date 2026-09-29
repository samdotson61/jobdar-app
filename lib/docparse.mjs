// Jobdar — document text extraction (Phase 8c.1). DETERMINISTIC: a parser, never a model. Understanding
// (text → structured fields) is the inference backend's job (8c.2), so it stays private-by-default.
// Dependency-light on purpose — and (1.64.0) it must work on a LAYMAN's machine: the desktop drive-test
// found DOCX needed the system `unzip` (absent on Windows) and PDF needed poppler's `pdftotext` (absent
// on stock Mac AND Windows — this Mac only passed because Homebrew was on the GUI PATH). Now:
//   DOCX → a built-in zip reader (node:zlib) — every OS, no tool; macOS `textutil` as the last resort.
//   PDF  → `pdftotext` when present → macOS PDFKit via osascript (built into every Mac) → pdf.js when the
//          host ships `pdfjs-dist` (the desktop app does — that's Windows' path; async, extractTextAsync)
//          → else an honest failure + DOCX/text hint (8c.4).
// .txt/.md pass through. The web/serverless path (Phase 9) swaps in unpdf/mammoth behind extractText().

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { inflateRawSync } from 'node:zlib'
import { decodeEntities } from './html.mjs'

// Single-pass, codepoint-guarded entity decode (lib/html.mjs): a naive multi-pass decode double-decoded
// literal entities, and an unguarded String.fromCodePoint threw RangeError on a numeric entity > U+10FFFF.
const decode = (s) => decodeEntities(s)

// One member of a zip archive, read with node:zlib (no `unzip` binary). Handles stored (0) and deflate (8)
// entries via the central directory — what every .docx writer produces. null when absent/unreadable.
export function zipEntry(buf, name) {
  try {
    let eocd = -1
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
    if (eocd < 0) return null
    const count = buf.readUInt16LE(eocd + 10)
    let p = buf.readUInt32LE(eocd + 16)
    for (let n = 0; n < count && buf.readUInt32LE(p) === 0x02014b50; n++) {
      const method = buf.readUInt16LE(p + 10)
      const csize = buf.readUInt32LE(p + 20)
      const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32)
      const local = buf.readUInt32LE(p + 42)
      if (buf.toString('utf8', p + 46, p + 46 + nlen) === name) {
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
        const data = buf.subarray(start, start + csize)
        return method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data) : null
      }
      p += 46 + nlen + xlen + clen
    }
  } catch { /* not a zip / truncated */ }
  return null
}

// .docx body → text. word/document.xml holds the paragraphs; map <w:p>→newline, <w:tab/>→tab, strip rest.
function docxText(file) {
  const member = zipEntry(readFileSync(file), 'word/document.xml')
  if (!member) {
    // Not a readable zip / no document part — macOS textutil can still read some Word files.
    try {
      return execFileSync('textutil', ['-convert', 'txt', '-stdout', file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
      return ''
    }
  }
  const xml = member.toString('utf8')
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

// macOS PDFKit through JavaScript-for-Automation — ships with every Mac, reads text PDFs in ~0.1 s.
const PDFKIT_JXA = 'ObjC.import("PDFKit"); function run(argv) { const d = $.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(argv[0])); return (d && !d.isNil()) ? (ObjC.unwrap(d.string) || "") : "" }'

function pdfText(file) {
  try {
    return execFileSync('pdftotext', ['-q', '-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch { /* no poppler — try the OS */ }
  if (process.platform === 'darwin') {
    try {
      return execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', PDFKIT_JXA, file], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 30000 }).trim()
    } catch { /* fall through */ }
  }
  return null // no synchronous extractor on this machine (extractTextAsync may still have pdf.js)
}

// pdf.js (Mozilla, pure JS) when the host ships `pdfjs-dist` — the desktop app does, so Windows reads
// PDFs with nothing installed. Not an engine dependency: the CLI keeps its one-dependency footprint.
async function pdfjsText(file) {
  let pdfjs
  try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs') } catch { return null }
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(file)), isEvalSupported: false, useSystemFonts: false, verbosity: 0 }).promise
    const pages = []
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent()
      pages.push(tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : '')).join(''))
    }
    await doc.destroy()
    return pages.join('\n').replace(/[ \t]+\n/g, '\n').trim()
  } catch {
    return null
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

// extractText + the async pdf.js tier. Upload/import paths use this; sync callers keep extractText.
export async function extractTextAsync(file) {
  const r = extractText(file)
  if (r.error !== 'pdf-no-extractor') return r
  const text = await pdfjsText(file)
  if (text == null) return r
  return { ext: r.ext, text, error: text.trim().length < 30 ? 'image-pdf' : undefined }
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
