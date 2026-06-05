// Jobdar — minimal HTML helpers (zero dependencies).
// Used by HTML-scraping providers (iCIMS, Phase 3). JSON-LD is the reliable, structured path;
// tag-stripping is a best-effort fallback. Deliberately lightweight — no DOM library.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" }

export function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] || m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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
