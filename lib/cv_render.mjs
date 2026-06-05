// Jobdar — résumé rendering (career-ops "Customize" stage). Turns a markdown cv.md into a clean,
// ATS-friendly HTML résumé (single column, standard fonts, semantic headings, selectable text — no
// tables, images, or columns that confuse ATS parsers). Pure + zero-dep; `jobdar pdf` renders this
// to HTML always, and to PDF when Playwright is installed. Deep content tailoring is the model's job
// (the `apply` mode); here we render and lightly flag role-matched keywords.

const STOP = new Set(['the', 'and', 'for', 'with', 'you', 'our', 'your', 'will', 'are', 'that', 'this', 'have', 'from', 'job', 'role', 'team', 'work', 'about', 'who', 'all'])
const esc = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const inline = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>')

// Minimal, résumé-focused markdown → HTML (headings, bullets, bold/italic, paragraphs).
export function mdToHtml(md) {
  const out = []
  let list = null
  const flush = () => {
    if (list) {
      out.push('<ul>' + list.map((li) => `<li>${inline(li)}</li>`).join('') + '</ul>')
      list = null
    }
  }
  for (const raw of String(md || '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (/^#\s+/.test(line)) {
      flush()
      out.push(`<h1>${inline(line.replace(/^#\s+/, ''))}</h1>`)
    } else if (/^##\s+/.test(line)) {
      flush()
      out.push(`<h2>${inline(line.replace(/^##\s+/, ''))}</h2>`)
    } else if (/^###\s+/.test(line)) {
      flush()
      out.push(`<h3>${inline(line.replace(/^###\s+/, ''))}</h3>`)
    } else if (/^[-*]\s+/.test(line)) {
      ;(list = list || []).push(line.replace(/^[-*]\s+/, ''))
    } else if (line.trim() === '') {
      flush()
    } else {
      flush()
      out.push(`<p>${inline(line)}</p>`)
    }
  }
  flush()
  return out.join('\n')
}

// Keywords from a role's text that actually appear in the résumé (for a light "Relevant:" flag).
export function matchedKeywords(roleText, cvText) {
  const cv = String(cvText || '').toLowerCase()
  const words = [...new Set(String(roleText || '').toLowerCase().match(/[a-z][a-z+#.]{2,}/g) || [])].filter((w) => !STOP.has(w))
  return words.filter((w) => cv.includes(w))
}

const ATS_CSS = `@page{size:Letter;margin:0.6in 0.7in}
*{box-sizing:border-box}
body{font:11pt/1.42 'Helvetica Neue',Arial,sans-serif;color:#111;margin:0}
.resume{max-width:7.1in;margin:0 auto;padding:0.3in 0}
h1{font-size:20pt;margin:0 0 2px}
h2{font-size:12pt;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #999;padding-bottom:2px;margin:16px 0 6px}
h3{font-size:11pt;margin:10px 0 2px}
p{margin:4px 0}
ul{margin:4px 0 8px;padding-left:18px}
li{margin:2px 0}
.tailor,.matched{color:#555;font-size:9.5pt;margin:0 0 3px}
.matched{font-style:italic}`

// Full ATS HTML document. The first markdown `# Name` (or opts.name) becomes the header; a role
// adds a subtle "Tailored for …" line and a role-matched keyword flag.
export function cvToHtml(md, opts = {}) {
  const { role = '', company = '', matched = [], name = '' } = opts
  let mdName = ''
  const rest = []
  let took = false
  for (const l of String(md || '').split(/\r?\n/)) {
    if (!took && /^#\s+/.test(l.trim())) {
      mdName = l.trim().replace(/^#\s+/, '')
      took = true
      continue
    }
    rest.push(l)
  }
  const cvName = mdName || name || 'Résumé' // the résumé's own name wins; profile name is a fallback
  const header = `<h1>${esc(cvName || 'Résumé')}</h1>`
  const sub = role ? `<p class="tailor">Tailored for <strong>${esc(role)}</strong>${company ? ` · ${esc(company)}` : ''}</p>` : ''
  const rel = matched && matched.length ? `<p class="matched">Relevant: ${esc(matched.slice(0, 12).join(', '))}</p>` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(cvName || 'Résumé')}</title>
<style>${ATS_CSS}</style></head><body><main class="resume">
${header}${sub}${rel}
${mdToHtml(rest.join('\n'))}
</main></body></html>`
}
