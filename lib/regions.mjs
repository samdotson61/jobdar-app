// Jobdar — region taxonomy & location filtering (Phase 5).
// US-focused, Midwest-default. Presets map to US states + major metros; the location filter keeps
// roles in the selected region(s) plus remote-US, and drops clear out-of-region / offshore roles.
// Coarse by design (like lib/levels.mjs) — the model does the nuanced read. Ambiguous locations
// ("6 Locations") pass through rather than being dropped.

import { US_PLACES, FOREIGN_PLACES } from './places_data.mjs'

export const REGIONS = {
  midwest: {
    states: ['IL', 'IN', 'IA', 'KS', 'MI', 'MN', 'MO', 'NE', 'ND', 'OH', 'SD', 'WI'],
    metros: ['Chicago', 'Indianapolis', 'Columbus', 'Cincinnati', 'Cleveland', 'Detroit', 'Minneapolis', 'St. Paul', 'Milwaukee', 'Kansas City', 'St. Louis', 'Des Moines', 'Omaha', 'Lincoln', 'Madison'],
  },
  northeast: {
    states: ['CT', 'DC', 'DE', 'ME', 'MD', 'MA', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'],
    metros: ['New York', 'Boston', 'Philadelphia', 'Pittsburgh', 'Baltimore', 'Newark', 'Providence', 'Hartford', 'Washington'],
  },
  southeast: {
    states: ['AL', 'AR', 'FL', 'GA', 'KY', 'LA', 'MS', 'NC', 'SC', 'TN', 'VA', 'WV'],
    metros: ['Atlanta', 'Charlotte', 'Miami', 'Orlando', 'Tampa', 'Nashville', 'Raleigh', 'Richmond', 'Louisville', 'Birmingham', 'New Orleans'],
  },
  southwest: {
    states: ['AZ', 'NM', 'OK', 'TX'],
    metros: ['Phoenix', 'Tempe', 'Scottsdale', 'Mesa', 'Tucson', 'Dallas', 'Houston', 'Austin', 'San Antonio', 'Albuquerque', 'Oklahoma City', 'Tulsa'],
  },
  west: {
    states: ['AK', 'CA', 'CO', 'HI', 'ID', 'MT', 'NV', 'OR', 'UT', 'WA', 'WY'],
    metros: ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Seattle', 'Portland', 'Denver', 'Salt Lake City', 'Las Vegas', 'Sacramento'],
  },
}

const STATE_NAMES = {
  AL: 'alabama', AK: 'alaska', AZ: 'arizona', AR: 'arkansas', CA: 'california', CO: 'colorado',
  CT: 'connecticut', DE: 'delaware', FL: 'florida', GA: 'georgia', HI: 'hawaii', ID: 'idaho',
  IL: 'illinois', IN: 'indiana', IA: 'iowa', KS: 'kansas', KY: 'kentucky', LA: 'louisiana',
  ME: 'maine', MD: 'maryland', MA: 'massachusetts', MI: 'michigan', MN: 'minnesota',
  MS: 'mississippi', MO: 'missouri', MT: 'montana', NE: 'nebraska', NV: 'nevada',
  NH: 'new hampshire', NJ: 'new jersey', NM: 'new mexico', NY: 'new york', NC: 'north carolina',
  ND: 'north dakota', OH: 'ohio', OK: 'oklahoma', OR: 'oregon', PA: 'pennsylvania',
  RI: 'rhode island', SC: 'south carolina', SD: 'south dakota', TN: 'tennessee', TX: 'texas',
  UT: 'utah', VT: 'vermont', VA: 'virginia', WA: 'washington', WV: 'west virginia',
  WI: 'wisconsin', WY: 'wyoming', DC: 'district of columbia',
}
const STATE_CODES = new Set(Object.keys(STATE_NAMES))
// Longest names first so "west virginia" wins before "virginia", etc.
const STATE_NAME_ENTRIES = Object.entries(STATE_NAMES)
  .map(([code, name]) => [name, code])
  .sort((a, b) => b[0].length - a[0].length)

// Common non-US / offshore signals to block. The US-state check in locationMatches() runs FIRST,
// so US cities that share a name with these (e.g. "London, KY", "Ontario, CA") are unaffected.
const FOREIGN = [
  // countries / regions
  'india', 'china', 'hong kong', 'philippines', 'spain', 'canada', 'ontario', 'brazil', 'ireland',
  'united kingdom', 'england', 'scotland', 'wales', 'poland', 'israel', 'mexico', 'germany',
  'france', 'singapore', 'australia', 'japan', 'netherlands', 'korea', 'czechia', 'czech republic',
  'slovakia', 'romania', 'hungary', 'austria', 'switzerland', 'sweden', 'denmark', 'norway',
  'finland', 'belgium', 'portugal', 'italy', 'greece', 'ukraine', 'turkey', 'türkiye', 'egypt',
  'south africa', 'argentina', 'colombia', 'chile', 'peru', 'uruguay', 'costa rica', 'panama',
  'new zealand', 'malaysia', 'indonesia', 'thailand', 'vietnam', 'taiwan', 'pakistan', 'sri lanka',
  'bangladesh', 'kenya', 'nigeria', 'morocco', 'united arab emirates', 'saudi', 'qatar',
  // offshore hub cities (used when no country is named)
  'bengaluru', 'bangalore', 'hyderabad', 'pune', 'chennai', 'mumbai', 'delhi', 'gurgaon', 'gurugram',
  'noida', 'manila', 'barcelona', 'madrid', 'toronto', 'vancouver', 'montreal', 'dublin', 'london',
  'berlin', 'munich', 'paris', 'amsterdam', 'sydney', 'melbourne', 'tokyo', 'seoul', 'taipei',
  'sao paulo', 'são paulo', 'guadalajara', 'monterrey', 'bogota', 'lima', 'santiago', 'warsaw',
  'krakow', 'kraków', 'katowice', 'brno', 'prague', 'bucharest', 'budapest', 'vienna', 'zurich',
  'geneva', 'stockholm', 'copenhagen', 'oslo', 'helsinki', 'brussels', 'lisbon', 'milan', 'rome',
  'athens', 'dubai', 'abu dhabi', 'tel aviv', 'yokneam', 'kuala lumpur', 'jakarta', 'bangkok',
]

// Major metros -> state, so a bare-city location ("Chicago", "Detroit") resolves to its region.
// Only consulted when no state code/name was found, so "Portland, ME" stays Maine (not OR).
const METRO_STATE = {
  chicago: 'IL', indianapolis: 'IN', columbus: 'OH', cincinnati: 'OH', cleveland: 'OH',
  detroit: 'MI', minneapolis: 'MN', 'st. paul': 'MN', 'saint paul': 'MN', milwaukee: 'WI',
  'kansas city': 'MO', 'st. louis': 'MO', 'saint louis': 'MO', 'des moines': 'IA', omaha: 'NE',
  lincoln: 'NE', madison: 'WI', nyc: 'NY', dmv: 'DC',
  'new york city': 'NY', 'new york': 'NY', boston: 'MA', philadelphia: 'PA', pittsburgh: 'PA',
  baltimore: 'MD', newark: 'NJ', providence: 'RI', hartford: 'CT',
  atlanta: 'GA', charlotte: 'NC', miami: 'FL', orlando: 'FL', tampa: 'FL', nashville: 'TN',
  raleigh: 'NC', richmond: 'VA', louisville: 'KY', birmingham: 'AL', 'new orleans': 'LA',
  phoenix: 'AZ', tempe: 'AZ', scottsdale: 'AZ', mesa: 'AZ', tucson: 'AZ', dallas: 'TX',
  houston: 'TX', austin: 'TX', 'san antonio': 'TX', albuquerque: 'NM', 'oklahoma city': 'OK', tulsa: 'OK',
  'los angeles': 'CA', 'san francisco': 'CA', 'san diego': 'CA', 'san jose': 'CA', seattle: 'WA',
  portland: 'OR', denver: 'CO', 'salt lake city': 'UT', 'las vegas': 'NV', sacramento: 'CA',
}
const METRO_ENTRIES = Object.entries(METRO_STATE).sort((a, b) => b[0].length - a[0].length)

// Every word of a US state or seeded-metro name (1.64.0). Search keywords drop these: WHERE is the
// region filter's job, and a "columbus"/"ohio" keyword matched every Columbus posting's location line —
// a robotics engineer ranked as relevant to a warehouse lead (caught driving the desktop app).
export const PLACE_WORDS = new Set(
  [...Object.values(STATE_NAMES), ...Object.keys(METRO_STATE)].flatMap((n) => n.replace(/\./g, '').split(/\s+/)).filter((w) => w.length > 2)
)

// Union of states for the selected regions; 'ALL' for nationwide / custom / empty (lenient).
export function regionStateSet(targetRegions) {
  const regs = (Array.isArray(targetRegions) ? targetRegions : [targetRegions]).filter(Boolean)
  if (regs.includes('nationwide') || regs.includes('custom') || regs.length === 0) return 'ALL'
  const set = new Set()
  for (const r of regs) if (REGIONS[r]) REGIONS[r].states.forEach((s) => set.add(s))
  return set.size ? set : 'ALL'
}

// 2-letter codes that double as common capitalized English words ("ONSITE OR HYBRID", "IN-PERSON"):
// only treat them as a state code when they sit in a state position (right after a comma or hyphen).
const AMBIGUOUS_CODES = new Set(['IN', 'OR', 'OK', 'HI', 'ME', 'OH'])

// The offline GeoNames place table (1.65.0, scripts/gen-places.mjs): places a location the state/metro
// rules can't — "Beavercreek" → OH, "Sosnowiec, Silesian" → foreign — instead of keeping it as
// "can't tell". A US name shared by several states returns them all (most populous first), so a role
// still matches when ANY of them is in the selected region: placing never drops a job on a guess.
// 1.70.0: each state entry also carries the place's coordinates ("name:ST@lat/lon,…"), so a job location
// can be measured against the person's own metro (metroPenalty below) — offline, like everything here.
let PLACES = null
const places = () => {
  if (!PLACES) {
    const us = new Map()
    for (const e of US_PLACES.split(';')) {
      const i = e.indexOf(':')
      us.set(
        e.slice(0, i),
        e.slice(i + 1).split(',').map((s) => {
          const [st, ll] = s.split('@')
          const [lat, lon] = ll ? ll.split('/').map(Number) : [NaN, NaN]
          return { st, lat, lon }
        }),
      )
    }
    PLACES = { us, foreign: new Set(FOREIGN_PLACES.split(';')) }
  }
  return PLACES
}
const placeKey = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[.']/g, '').replace(/\s+/g, ' ').trim()
// Market codes postings use inside phrases ("Remote in APJ Region") — whole words only.
const REGION_CODES = new Set(['uk', 'uae', 'emea', 'apac', 'apj', 'latam'])
const FILLER = /\b(greater|area|metro|metropolitan|region|county|city of|remote|hybrid|on-?site|office|hq)\b/g
export function placeFromTable(text) {
  const { us, foreign } = places()
  const states = []
  let isForeign = false
  for (const seg of String(text || '').split(/[,;|/()\n]|\s[-–—]\s/)) {
    const k = placeKey(seg)
    if (!k) continue
    const cands = [...new Set([k, k.replace(FILLER, '').replace(/\s+/g, ' ').trim()])].filter(Boolean)
    const hit = cands.map((c) => us.get(c)).find(Boolean)
    if (hit) { for (const { st } of hit) if (!states.includes(st)) states.push(st); continue }
    // Region adjectives name their region: "Silesian" → Silesia, "Bavarian" → Bavaria, "Brazilian" → Brazil.
    const variants = cands.flatMap((c) => [c, c.replace(/ian$/, 'ia'), c.replace(/ian$/, ''), c.replace(/an$/, 'a'), c.replace(/n$/, '')])
    if (variants.some((c) => foreign.has(c)) || k.split(' ').some((w) => REGION_CODES.has(w))) isForeign = true
  }
  return { states, foreign: isForeign }
}

// The US states a location string names outright — a code in a state position, a full name, the
// capital. Shared by parseLocation and placesIn (1.70.0) so both read "Columbus, OH" the same way.
function statesNamed(raw) {
  const lower = raw.toLowerCase()
  const states = new Set()
  // Washington, D.C. — its own region-less capital; handle before the generic "washington"→WA name scan
  // so the US capital isn't filed as Washington state (West). Bucketed to the Northeast/Mid-Atlantic.
  const isDC = /washington,?\s*d\.?\s?c\.?\b/i.test(raw) || /district of columbia/i.test(lower)
  for (const m of raw.matchAll(/\b([A-Z]{2})\b/g)) {
    const c = m[1]
    if (!STATE_CODES.has(c)) continue
    if (AMBIGUOUS_CODES.has(c) && !/[,\-]\s*$/.test(raw.slice(0, m.index))) continue
    states.add(c)
  }
  for (const [name, code] of STATE_NAME_ENTRIES) {
    if (code === 'WA' && isDC) continue // "Washington" in "Washington, DC" is the city, not the state
    if (lower.includes(name)) states.add(code)
  }
  if (isDC) states.add('DC')
  return states
}

export function parseLocation(text) {
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  const remote = /\bremote\b/.test(lower)
  const usStates = statesNamed(raw)
  // Resolve a bare-city location to its state only when no explicit state was found.
  if (usStates.size === 0) {
    for (const [metro, code] of METRO_ENTRIES) {
      if (lower.includes(metro)) {
        usStates.add(code)
        break
      }
    }
  }
  // Last resort before "can't tell": the place table (1.65.0).
  let placed = false
  let tableForeign = false
  const legacyForeign = FOREIGN.some((f) => lower.includes(f))
  if (usStates.size === 0 && !legacyForeign) {
    const t = placeFromTable(raw)
    for (const s of t.states) usStates.add(s)
    placed = t.states.length > 0
    tableForeign = t.foreign
  }
  const foreign = legacyForeign || tableForeign
  const usMentioned = usStates.size > 0 || /\b(united states|u\.s\.a?\.?|usa)\b/.test(lower)
  return { usStates: [...usStates], remote, foreign, usMentioned, placed }
}

const titleCase = (k) => k.replace(/(^|\s)[a-z]/g, (c) => c.toUpperCase())

// Every named place a location string points at (1.70.0): [{ name, st, lat, lon }] in the order written.
// "Cincinnati Children's, Cincinnati OH" → Cincinnati OH; "Main Campus, Columbus, OH" → Columbus OH; a
// state the string names picks that state's entry ("Columbus, GA" is Georgia's), otherwise the most
// populous place of the name. A place name buried inside a longer segment ("Main Campus Columbus OH")
// counts only when the string names a state the place is in — so "Main" or "Campus" can never place a
// job. "2 Locations", "Remote", a bare "Ohio" or blank → [] (nothing to measure). Pure, offline.
export function placesIn(text) {
  const raw = String(text || '').replace(/\bUS-([A-Z]{2})-([^,;|()]+)/g, '$2, $1') // iCIMS "US-OH-Cincinnati" → "Cincinnati, OH"
  const { us } = places()
  const out = []
  // Each segment, flagged when it sits in a location's CITY SLOT: the first non-blank segment of the
  // string or of any location after a `;` or newline ("Boston, MA; New York, New York" lists two).
  const parts = raw.split(/([,;|/()\n]|\s[-–—]\s)/)
  const segs = []
  let slotOpen = true
  for (let i = 0; i < parts.length; i += 2) {
    const s = parts[i]
    segs.push({ s, citySlot: slotOpen && Boolean(s.trim()) })
    if (s.trim()) slotOpen = false
    if (/[;\n]/.test(parts[i + 1] || '')) slotOpen = true // `|` often joins a city and its state ("Albany | New York")
  }
  for (let { s: seg, citySlot } of segs) {
    // 1.71.0: the table names it "New York City", so "New York, NY" — the usual spelling — placed nowhere
    // (NYC roles escaped the metro penalty and any metro filter). "NYC" means the city anywhere; "New
    // York" only in a city slot (a location's first segment), so "Rochester, New York" stays Rochester, NY.
    const sk = placeKey(seg)
    if (sk === 'nyc' || (sk === 'new york' && citySlot)) seg = 'New York City'
    // The states the whole string names, plus a bare code ending this segment ("Cincinnati OH").
    const named = statesNamed(raw)
    const tail = /\b([A-Z]{2})\s*$/.exec(seg.trim())
    if (tail && STATE_CODES.has(tail[1])) named.add(tail[1])
    const add = (name, hit) => {
      const entry = named.size ? hit.find((h) => named.has(h.st)) : hit[0]
      if (entry && Number.isFinite(entry.lat) && !out.some((o) => o.name === name && o.st === entry.st)) out.push({ name, ...entry })
    }
    const k = placeKey(seg)
    const stripped = k.replace(FILLER, '').replace(/\s+/g, ' ').trim()
    const whole = [k, stripped].filter(Boolean).map((c) => [c, us.get(c)]).find(([, h]) => h)
    if (whole) { add(whole[0], whole[1]); continue }
    if (!named.size) continue
    const words = stripped.split(' ').filter(Boolean)
    let found = false
    for (let n = Math.min(3, words.length); n >= 1 && !found; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        const name = words.slice(i, i + n).join(' ')
        const hit = us.get(name)
        if (hit && hit.some((h) => named.has(h.st))) { add(name, hit); found = true; break }
      }
    }
  }
  return out
}

// Great-circle distance between two { lat, lon } points, in km.
const toRad = (d) => (d * Math.PI) / 180
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

// A role this close to the person's own place is "in the metro" (1.70.0): ≈ 37 miles — Mason, Florence
// and Hamilton sit inside Cincinnati's circle, Dayton (77 km) and Columbus (160 km) outside it.
export const METRO_RADIUS_KM = 60

// How much a role outside the metro loses, in points on the 0–5 fit scale — from the profile's location
// weight, which had no effect on a fit score before 1.70.0: the default 0.15 costs 0.3, a weight of 0
// turns the penalty off, and it never exceeds 0.5 (under one band, so a strong Apply stays an Apply).
export function metroPenaltyPoints(profile = {}) {
  const raw = profile.score_weights ? profile.score_weights.location : undefined
  if (raw == null || raw === '') return 0.3
  const w = Number(raw)
  if (!Number.isFinite(w) || w <= 0) return 0
  return Math.min(0.5, Math.round(w * 20) / 10)
}

// Code's slight preference for the person's own metro (1.70.0 — the model judges fit, code owns every
// number): a role placed outside it loses metroPenaltyPoints — enough to break a tie with the same role
// at home, never enough to move a strong Apply to Don't. Nothing comes off when the person's location or
// the role's can't be placed (blank, "2 Locations", a bare state), when the listing says remote, or when
// the weight is 0. A multi-site role is measured at its nearest site. Pure. Returns { points, note, tier }
// — tier: 'home' | 'away' | 'remote' | 'unplaced' | 'off'; the note is the one clause the verdict carries
// ("0.3 off for Columbus vs Cincinnati").
export function metroPenalty({ location = '', profile = {} } = {}) {
  const points = metroPenaltyPoints(profile)
  if (!points) return { points: 0, note: '', tier: 'off' }
  // 1.71.0: every place the person targets — their own city plus any target_metros — counts as home, and
  // a role is measured against the NEAREST one (a Chicago role isn't docked when Chicago is a target).
  const homes = placeMetros([profile.location, ...targetMetrosOf(profile)])
  if (!homes.length) return { points: 0, note: '', tier: 'unplaced' }
  if (parseLocation(location).remote) return { points: 0, note: '', tier: 'remote' }
  const there = placesIn(location)
  if (!there.length) return { points: 0, note: '', tier: 'unplaced' }
  let nearest = there[0]
  let home = homes[0]
  let best = Infinity
  for (const p of there) {
    for (const h of homes) {
      const d = distanceKm(h, p)
      if (d < best) { best = d; nearest = p; home = h }
    }
  }
  if (best <= METRO_RADIUS_KM) return { points: 0, note: '', tier: 'home' }
  return { points, note: `${points} off for ${titleCase(nearest.name)} vs ${titleCase(home.name)}`, tier: 'away' }
}

// --- Multi-city targeting + the catalog-metro fallback (1.71.0) ---

// The profile's target_metros as a clean list of "City, ST" strings ([] = none — 1.70.0 behaviour).
export function targetMetrosOf(profile = {}) {
  const raw = profile && profile.target_metros
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(';') : []
  return list.map((s) => String(s || '').trim()).filter(Boolean)
}

// Place "City, ST" strings → [{ name, st, lat, lon, label }]; anything unplaceable is dropped. Already
// placed entries (with lat/lon) pass through, so callers can place once and reuse. Pure.
export function placeMetros(metros) {
  const out = []
  for (const m of metros || []) {
    if (m && typeof m === 'object' && Number.isFinite(m.lat)) { out.push(m); continue }
    const p = placesIn(m)[0]
    if (p && !out.some((o) => o.name === p.name && o.st === p.st)) out.push({ ...p, label: String(m) })
  }
  return out
}

// A location to MEASURE (filters, metro penalty, the eval's logistics line): the posting's own text when
// it names a place, is remote, or is foreign; otherwise the board's catalog metro stands in, kept beside
// the raw text — "Burnet Campus" → "Cincinnati, OH (Burnet Campus)", blank → "Cincinnati, OH". A board
// with no catalog metro (the person's own boards) changes nothing; nor does "4 Locations" (a multi-site
// posting isn't "at" the board's home metro). Display always keeps the raw text. Pure.
export function measuredLocation(location, fallbackMetro = '') {
  const raw = String(location || '').trim()
  const metro = String(fallbackMetro || '').trim()
  if (!metro) return raw
  if (/^\d+\s+locations?$/i.test(raw)) return raw
  const p = parseLocation(raw)
  if (p.remote || p.foreign || p.usStates.length || placesIn(raw).length) return raw
  return raw ? `${metro} (${raw})` : metro // metro FIRST: it sits in the city slot placesIn reads
}

// Where a location sits relative to the target metros: { tier, km, place, metro } with tier 'near'
// (some named place within METRO_RADIUS_KM of some target), 'far' (placed, none near), 'remote', or
// 'unplaced'. `targets` may be raw strings or placeMetros() output. Pure.
export function nearestMetro(location, targets) {
  const placedTargets = placeMetros(targets)
  const none = { km: Infinity, place: null, metro: null }
  if (!placedTargets.length) return { tier: 'unplaced', ...none }
  const p = parseLocation(location)
  if (p.remote && !p.foreign) return { tier: 'remote', ...none }
  const there = placesIn(location)
  if (!there.length) return { tier: 'unplaced', ...none }
  let best = none
  for (const pl of there) {
    for (const t of placedTargets) {
      const km = distanceKm(t, pl)
      if (km < best.km) best = { km, place: pl, metro: t }
    }
  }
  return { tier: best.km <= METRO_RADIUS_KM ? 'near' : 'far', ...best }
}

// Canonical location key for near-duplicate dedup (7.8.3): collapse a campus/building/suite within a
// metro to one key while keeping different metros distinct. Resolution: metro (most specific) → state
// code/name → remote → normalized free text. "Cincinnati Children's, Cincinnati OH" and "Cincinnati,
// OH" both → 'cincinnati'; "Cleveland, OH" stays 'cleveland'.
export function canonicalLocation(text) {
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  // Find an explicit state first (code, then full name) so the metro key can be state-qualified —
  // otherwise "Columbus, OH" and "Columbus, GA" (distinct cities) collapse to one key and the second
  // role is wrongly absorbed as a duplicate of the first.
  let state = ''
  for (const c of raw.match(/\b[A-Z]{2}\b/g) || []) if (STATE_CODES.has(c)) { state = c; break }
  if (!state) for (const [name, code] of STATE_NAME_ENTRIES) if (lower.includes(name)) { state = code; break }
  for (const [metro, mcode] of METRO_ENTRIES) if (lower.includes(metro)) return `${metro}|${state || mcode}`
  if (state) return state
  if (/\bremote\b/.test(lower)) return 'remote'
  const norm = lower.replace(/[^a-z0-9]+/g, ' ').trim()
  return norm || 'unknown'
}

// Rough timezone per state — used to PRIORITIZE (not filter) roles by how well their location lines up
// with the selected region's timezone. A remote role anchored outside the region's timezone (e.g. "remote
// out of Columbus, OH" while "West" is selected) should rank BELOW genuine in-region / in-timezone roles.
const STATE_TZ = {
  CT: 'ET', DC: 'ET', DE: 'ET', FL: 'ET', GA: 'ET', IN: 'ET', KY: 'ET', MA: 'ET', MD: 'ET', ME: 'ET',
  MI: 'ET', NC: 'ET', NH: 'ET', NJ: 'ET', NY: 'ET', OH: 'ET', PA: 'ET', RI: 'ET', SC: 'ET', VA: 'ET',
  VT: 'ET', WV: 'ET',
  AL: 'CT', AR: 'CT', IA: 'CT', IL: 'CT', KS: 'CT', LA: 'CT', MN: 'CT', MO: 'CT', MS: 'CT', ND: 'CT',
  NE: 'CT', OK: 'CT', SD: 'CT', TN: 'CT', TX: 'CT', WI: 'CT',
  AZ: 'MT', CO: 'MT', ID: 'MT', MT: 'MT', NM: 'MT', UT: 'MT', WY: 'MT',
  CA: 'PT', NV: 'PT', OR: 'PT', WA: 'PT', AK: 'AKT', HI: 'HT',
}

// Priority of a role's location for the selected region(s): 2 = in-region (top), 1 = timezone-aligned or a
// region-agnostic remote role, 0 = anchored outside the region's timezone (deprioritize). Never cuts —
// it only reorders. Nationwide / no-region → neutral 2 (no preference).
export function regionPriority(text, targetRegions = ['midwest']) {
  const stateSet = regionStateSet(targetRegions)
  if (stateSet === 'ALL') return 2
  const regionTz = new Set()
  for (const s of stateSet) if (STATE_TZ[s]) regionTz.add(STATE_TZ[s])
  const p = parseLocation(text)
  if (p.usStates.some((s) => stateSet.has(s))) return 2 // physically in the selected region
  const roleTz = new Set(p.usStates.map((s) => STATE_TZ[s]).filter(Boolean))
  if ([...roleTz].some((tz) => regionTz.has(tz))) return 1 // same timezone as the region (incl. anchored-remote)
  if (p.remote && roleTz.size === 0 && !p.foreign) return 1 // remote with no US anchor → region-agnostic
  return 0 // anchored outside the region's timezone (e.g. remote-out-of-Columbus while West is selected)
}

// The region key for a location ("Cincinnati, OH" → "midwest"), or '' if it can't be resolved. Used to
// seed the search region from an uploaded résumé — the user can still override it via the region chips.
export function regionForLocation(text) {
  const p = parseLocation(text)
  for (const s of p.usStates) {
    for (const [key, def] of Object.entries(REGIONS)) if (def.states.includes(s)) return key
  }
  return ''
}

// Keep a role for the selected region(s)? Remote-US is allowed for any region; the user's metro is
// always allowed; clear out-of-region or offshore roles are dropped; ambiguous ones pass through.
export function locationMatches(text, targetRegions = ['midwest'], opts = {}) {
  const p = parseLocation(text)
  if (opts.userMetro) {
    const city = String(opts.userMetro).toLowerCase().split(',')[0].trim()
    if (city && String(text || '').toLowerCase().includes(city)) return true
  }
  if (p.remote && !p.foreign) return true // remote-US works everywhere
  // 1.71.0 target_metros: when set, distance to the nearest target metro replaces the region test — a
  // role is kept if ANY place it names is within METRO_RADIUS_KM of ANY target. A bare state is kept only
  // if it holds a target; a location naming no place at all ("2 Locations") stays a lenient keep.
  const targets = placeMetros(opts.targetMetros)
  if (targets.length) {
    const n = nearestMetro(text, targets)
    if (n.tier === 'near') return true
    if (n.tier === 'far') return false
    if (p.usStates.length) return p.usStates.some((s) => targets.some((t) => t.st === s))
    return !p.foreign
  }
  const stateSet = regionStateSet(targetRegions)
  if (stateSet === 'ALL') {
    if (p.usStates.length || p.usMentioned) return true
    return !p.foreign // foreign-only dropped; ambiguous kept
  }
  if (p.usStates.some((s) => stateSet.has(s))) return true
  if (p.usStates.length) return false // US but outside the selected region(s)
  if (p.foreign) return false // offshore-only
  return true // no state, no metro, not in the place table ("Remote", "2 Locations") -> lenient keep
}

// `opts.targetMetros` (1.71.0) switches to metro-distance matching; each job's catalog metro
// (`job.metro`, or `opts.fallbackMetro` for a whole board) stands in for an unplaceable location.
export function filterByLocation(jobs, targetRegions = ['midwest'], opts = {}) {
  const kept = []
  let excluded = 0
  const o = opts.targetMetros ? { ...opts, targetMetros: placeMetros(opts.targetMetros) } : opts // place once per call
  for (const job of jobs || []) {
    const metro = job.metro || opts.fallbackMetro || ''
    if (locationMatches(measuredLocation(job.location, metro), targetRegions, o)) kept.push(metro && !job.metro ? { ...job, metro } : job)
    else excluded++
  }
  return { kept, excluded, total: (jobs || []).length }
}
