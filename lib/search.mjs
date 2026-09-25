// Jobdar — intent-driven search (Phase 9.3). Turns a free-text "what are you looking for?" into concrete
// search criteria and scores how RELEVANT a discovered role is to that intent. Two layers, mirroring the
// rest of the engine: a deterministic keyword path that always works (zero-token), and a winc-powered
// parse that expands the intent into adjacent job titles + domain keywords so matching is smarter
// (PM → "product manager / product owner / program manager / associate product manager"). The model
// only INTERPRETS the request once per search; per-role relevance stays deterministic + instant.

import { callBackend } from './inference.mjs'
import { parseEvalJson } from './eval_engine.mjs'

// Words that carry no role signal — dropped from the deterministic keyword set so the meaningful tokens
// ("product", "manager", "marketing") drive matching, not "looking"/"for"/"entry"/"role".
const STOPWORDS = new Set(
  ('a an and or for of in on at to with the my me i im want wanted need needs looking look seeking seek ' +
   'find role roles job jobs position positions opening openings work working career careers please new ' +
   'grad graduate level entry mid senior junior remote hybrid onsite on site fulltime full part time ' +
   'something anything around near area open to that which would like prefer ideally is are be as').split(/\s+/)
)

const tokenize = (s) => String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9+#.]*/g) || []
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Deterministic fallback: meaningful tokens from the raw intent. Always available, no backend.
export function expandQueryTerms(intent) {
  const keywords = [...new Set(tokenize(intent).filter((w) => w.length > 1 && !STOPWORDS.has(w)))]
  return { keywords, titles: [], exclude: [] }
}

// Résumé words that carry no DOMAIN signal — dates, verbs of accomplishment, résumé furniture. Kept
// separate from STOPWORDS because they're specific to how résumés are written, not how intents are.
const RESUME_NOISE = new Set(
  ('present current jan feb mar apr may jun jul aug sep oct nov dec january february march april june ' +
   'july august september october november december experience professional summary skills education ' +
   'certifications projects core competencies led owned built managed delivered improved reduced cut ' +
   'com www http https linkedin github email phone years user users team teams staff company').split(/\s+/)
)

// Derive search terms from the RÉSUMÉ itself (1.59.0, pure) — the fix for "I uploaded an
// infrastructure-IT résumé and got customer-service recommendations." Generic word-overlap prescreen
// can't tell those apart (both worlds say "support/systems/service"), but the résumé's own STRUCTURE
// can: job-title lines become title phrases (which relevanceScore weights 3× and matches as phrases),
// and the headline + skills sections become the domain keyword set. Used whenever the person hasn't
// typed an intent — their own career history IS the default intent. Their typed words always win.
export function termsFromResume(cvText) {
  const text = String(cvText || '')
  if (!text.trim()) return { keywords: [], titles: [], exclude: [] }
  const lines = text.split(/\r?\n/)
  const titles = []
  const SECTION = /summary|skills|competenc|education|certification|experience|projects|tools|languages|contact/i
  for (const l of lines) {
    // Role headers: "### Systems Administrator — Company · dates" (any md depth, any common separator).
    const m = l.match(/^#{2,4}\s*([^—|·]+?)\s*(?:[—|·]|\s-\s)/)
    if (m) {
      const t2 = m[1].trim().toLowerCase()
      if (t2 && t2.length <= 60 && !SECTION.test(t2)) titles.push(t2)
    }
  }
  // Headline block: the first few lines (name/tagline) carry the person's own words for what they
  // are — MINUS contact/location lines. A "Columbus, OH · email · phone" line would put the city into
  // the keyword set and hand every local role a relevance hit (caught live: Medical Assistants ranking
  // for an infrastructure résumé purely because both said "Columbus").
  const isContactLine = (l) => /@|https?:\/\/|linkedin|github|\(\d{3}\)|\d{3}[-.\s]\d{4}/.test(l) || /^[^a-z]*[A-Z][A-Za-z .]+,\s*[A-Z]{2}\b/.test(l.trim())
  const head = lines.slice(0, 6).filter((l) => !isContactLine(l)).join(' ')
  // Skills-ish sections: body lines under a skills/competencies/tools header, until the next header.
  let inSkills = false
  let skillText = ''
  for (const l of lines) {
    if (/^#{1,4}\s/.test(l)) inSkills = /skills|competenc|tools|technolog/i.test(l)
    else if (inSkills) skillText += ' ' + l
  }
  const raw = tokenize(`${head} ${titles.join(' ')} ${skillText}`)
  const keywords = [...new Set(raw.map((w) => w.replace(/[.]+$/, '')).filter((w) => w.length > 2 && !STOPWORDS.has(w) && !RESUME_NOISE.has(w) && !ROLE_NOUNS.has(w) && !/^\d+$/.test(w)))]
  return { keywords: keywords.slice(0, 40), titles: [...new Set(titles)].slice(0, 8), exclude: [] }
}

// Generic role nouns appear in EVERY industry's titles ("…-SUPPORT", "Service …", "… Specialist"), so
// as bare résumé keywords they hand junk a relevance hit (a hospital's "Nurse Practitioner - Neurosurg
// SUPPORT" ranking for an IT résumé — caught live). They still match precisely through the TITLE
// PHRASES ("it support specialist" matches as a phrase); only the single-word form is dropped, and only
// for résumé-derived terms — words the user actually types are always kept verbatim.
const ROLE_NOUNS = new Set(
  ('support service services specialist coordinator assistant associate manager management director ' +
   'administrator administration analyst engineer consultant technician representative supervisor ' +
   'clerk officer intern lead senior junior professional').split(/\s+/)
)

// How relevant is `text` (a role title / "title company location") to the search terms? BM25-lite:
//   < 0  → an exclude term hit (cut it outright)
//   0    → no overlap (not relevant to what the user asked for)
//   > 0  → relevant; a title-phrase match dominates, keyword hits weigh by specificity (longer ≈ rarer,
//          a cheap IDF proxy), and matching MANY distinct intent terms earns a coverage bonus — so a real
//          "Product Manager" clearly outranks a generic "Manager, Workforce Management".
export function relevanceScore(text, terms) {
  const hay = String(text || '').toLowerCase()
  if (!hay.trim() || !terms) return 0
  const { keywords = [], titles = [], exclude = [] } = terms
  for (const x of exclude) if (x && hay.includes(String(x).toLowerCase())) return -1
  let title = false
  for (const tt of titles) if (tt && hay.includes(String(tt).toLowerCase())) { title = true; break }
  let hits = 0, weight = 0
  for (const k of keywords) {
    const kk = String(k).toLowerCase()
    if (kk && new RegExp(`\\b${escapeRe(kk)}`).test(hay)) { hits++; weight += Math.min(2, 0.6 + kk.length / 8) }
  }
  if (!title && hits === 0) return 0
  const coverage = hits >= 3 ? 2 : hits >= 2 ? 1 : 0
  return Math.round(((title ? 3 : 0) + weight + coverage) * 10) / 10
}

// --- winc-powered intent parse (one call per search; degrades to keywords when winc is down) ---

export const INTENT_SYSTEM =
  'You convert a job-seeker\'s free-text description of what they want into concrete search criteria. ' +
  'Be faithful to the request; never invent a field they didn\'t imply. Reply ONLY with the JSON.'

export const INTENT_SCHEMA = {
  name: 'jobdar_intent',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['titles', 'keywords', 'exclude'],
    properties: {
      titles: { type: 'array', items: { type: 'string' } },
      keywords: { type: 'array', items: { type: 'string' } },
      exclude: { type: 'array', items: { type: 'string' } },
      level: { type: 'string' },
      regions: { type: 'array', items: { type: 'string' } },
    },
  },
}

export function buildIntentUser(intent) {
  return (
    `The job-seeker described what they want:\n"""\n${String(intent || '').slice(0, 800)}\n"""\n\n` +
    'Extract:\n' +
    '- titles: 3–8 concrete job TITLES they\'d plausibly want, including close synonyms / adjacent titles.\n' +
    '- keywords: 5–12 lowercase skill/domain words to look for in a posting.\n' +
    '- exclude: titles or words that clearly do NOT fit (empty if none).\n' +
    '- level: one of entry | mid | senior, ONLY if they state a seniority (else omit).\n' +
    '- regions: any US regions named — midwest | northeast | southeast | southwest | west | nationwide (else omit).'
  )
}

const LEVELS = new Set(['entry', 'mid', 'senior'])
const REGIONS = new Set(['midwest', 'northeast', 'southeast', 'southwest', 'west', 'nationwide'])
const cleanList = (a, n) => (Array.isArray(a) ? a.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : [])

// parseIntent → { titles, keywords, exclude, level?, regions?, source:'model'|'keywords' }. Never throws.
export async function parseIntent({ active, intent }) {
  const base = expandQueryTerms(intent)
  if (!String(intent || '').trim() || !active || !active.up) return { ...base, source: 'keywords' }
  try {
    const rf = active.jsonEval ? { type: 'json_schema', json_schema: INTENT_SCHEMA } : null
    const res = await callBackend(active, { system: INTENT_SYSTEM, user: buildIntentUser(intent), maxTokens: 320, timeoutMs: 60000, responseFormat: rf, temperature: 0 })
    const j = parseEvalJson(res.text)
    if (j && (Array.isArray(j.titles) || Array.isArray(j.keywords))) {
      const level = typeof j.level === 'string' && LEVELS.has(j.level.toLowerCase()) ? j.level.toLowerCase() : undefined
      const regions = cleanList(j.regions, 6).map((r) => r.toLowerCase()).filter((r) => REGIONS.has(r))
      return {
        titles: cleanList(j.titles, 10),
        keywords: [...new Set([...cleanList(j.keywords, 16).map((k) => k.toLowerCase()), ...base.keywords])].slice(0, 20),
        exclude: cleanList(j.exclude, 10),
        level,
        regions: regions.length ? regions : undefined,
        source: 'model',
      }
    }
  } catch {
    /* model unreachable or off-format → deterministic keywords */
  }
  return { ...base, source: 'keywords' }
}
