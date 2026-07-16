// Jobfaro — region taxonomy & location filtering (Phase 5).
// US-focused, Midwest-default. Presets map to US states + major metros; the location filter keeps
// roles in the selected region(s) plus remote-US, and drops clear out-of-region / offshore roles.
// Coarse by design (like lib/levels.mjs) — the model does the nuanced read. Ambiguous locations
// ("6 Locations") pass through rather than being dropped.

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
  lincoln: 'NE', madison: 'WI',
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
export function parseLocation(text) {
  const raw = String(text || '')
  const lower = raw.toLowerCase()
  const remote = /\bremote\b/.test(lower)
  const usStates = new Set()
  // Washington, D.C. — its own region-less capital; handle before the generic "washington"→WA name scan
  // so the US capital isn't filed as Washington state (West). Bucketed to the Northeast/Mid-Atlantic.
  const isDC = /washington,?\s*d\.?\s?c\.?\b/i.test(raw) || /district of columbia/i.test(lower)
  for (const m of raw.matchAll(/\b([A-Z]{2})\b/g)) {
    const c = m[1]
    if (!STATE_CODES.has(c)) continue
    if (AMBIGUOUS_CODES.has(c) && !/[,\-]\s*$/.test(raw.slice(0, m.index))) continue
    usStates.add(c)
  }
  for (const [name, code] of STATE_NAME_ENTRIES) {
    if (code === 'WA' && isDC) continue // "Washington" in "Washington, DC" is the city, not the state
    if (lower.includes(name)) usStates.add(code)
  }
  if (isDC) usStates.add('DC')
  // Resolve a bare-city location to its state only when no explicit state was found.
  if (usStates.size === 0) {
    for (const [metro, code] of METRO_ENTRIES) {
      if (lower.includes(metro)) {
        usStates.add(code)
        break
      }
    }
  }
  const foreign = FOREIGN.some((f) => lower.includes(f))
  const usMentioned = usStates.size > 0 || /\b(united states|u\.s\.a?\.?|usa)\b/.test(lower)
  return { usStates: [...usStates], remote, foreign, usMentioned }
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
  const stateSet = regionStateSet(targetRegions)
  if (opts.userMetro) {
    const city = String(opts.userMetro).toLowerCase().split(',')[0].trim()
    if (city && String(text || '').toLowerCase().includes(city)) return true
  }
  if (p.remote && !p.foreign) return true // remote-US works everywhere
  if (stateSet === 'ALL') {
    if (p.usStates.length || p.usMentioned) return true
    return !p.foreign // foreign-only dropped; ambiguous kept
  }
  if (p.usStates.some((s) => stateSet.has(s))) return true
  if (p.usStates.length) return false // US but outside the selected region(s)
  if (p.foreign) return false // offshore-only
  return true // ambiguous (no parseable state) -> lenient keep
}

export function filterByLocation(jobs, targetRegions = ['midwest'], opts = {}) {
  const kept = []
  let excluded = 0
  for (const job of jobs || []) {
    if (locationMatches(job.location, targetRegions, opts)) kept.push(job)
    else excluded++
  }
  return { kept, excluded, total: (jobs || []).length }
}
