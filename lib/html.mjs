// Jobdar — minimal HTML helpers (zero dependencies).
// Used by HTML-scraping providers (iCIMS, Phase 3). JSON-LD is the reliable, structured path;
// tag-stripping is a best-effort fallback. Deliberately lightweight — no DOM library.

// Named entities we decode. The dash/quote/misc set matters beyond cosmetics: ATS boards (Greenhouse)
// encode salary ranges as "$73,125&mdash;$117,000", so leaving &mdash;/&ndash; undecoded makes a pay
// range parse as its floor only (lib/salary.mjs). Decode them here so EVERY JD consumer sees clean text.
const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
  '&mdash;': '—', '&ndash;': '–', '&rsquo;': '’', '&lsquo;': '‘', '&ldquo;': '“', '&rdquo;': '”',
  '&hellip;': '…', '&bull;': '•', '&deg;': '°', '&times;': '×', '&trade;': '™', '&reg;': '®', '&copy;': '©',
}

export function decodeEntities(s) {
  // ONE pass so a decode's output is never re-decoded: "&amp;#x2014;" must stay "&#x2014;", not
  // become "—". Handles named, hex (&#x…; / &#X…;), and decimal (&#…;) entities; unknown → unchanged.
  return String(s == null ? '' : s).replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z0-9]+);/g, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1))
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : m
    }
    return ENTITIES['&' + body + ';'] || m
  })
}

export function stripTags(s) {
  return decodeEntities(
    String(s == null ? '' : s)
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

// Extract and parse every JSON-LD <script> block from an HTML string. Returns a flat array of
// parsed objects (unwrapping arrays and @graph). Malformed blocks are skipped, never thrown.
export function extractJsonLd(html) {
  const out = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(String(html || '')))) {
    let parsed
    try {
      parsed = JSON.parse(m[1].trim())
    } catch {
      continue
    }
    if (Array.isArray(parsed)) out.push(...parsed)
    else if (parsed && Array.isArray(parsed['@graph'])) out.push(...parsed['@graph'])
    else if (parsed) out.push(parsed)
  }
  return out
}
