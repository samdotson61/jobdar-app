// Jobdar — résumé date normalization (Phase 7.8.2; rec-spec §3a). Zero-token and pure.
// Resolves open-ended "Present"/"Current" in a résumé's date ranges to today's month-year BEFORE the
// text reaches the model, so an eval can't misread "Mar 2025 – Present" as future employment. The
// measured win: a prompt date-stamp alone cut the future-employment misread 3→1; normalizing the
// résumé text closes the rest. The Phase 8a prompt builder injects the matching "Today's date is …"
// stamp after the cached prefix (so it never busts the prompt cache).

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2026-06-13" → "Jun 2026". '' if today isn't a parseable ISO day.
export function monthYear(today) {
  const m = String(today || '').match(/^(\d{4})-(\d{2})/)
  if (!m) return ''
  const idx = Math.max(1, Math.min(12, Number(m[2]))) - 1
  return `${MONTHS[idx]} ${m[1]}`
}

// Replace an open-ended end-of-range token (Present/Current/Now/Ongoing/"to date") with today's
// month-year, but ONLY in a date-range context (after a dash or "to"/"through") so prose like
// "present your findings" is never touched. Pure; returns the text unchanged if today is unparseable.
export function normalizeResumeDates(text, today) {
  const stamp = monthYear(today)
  if (!stamp) return String(text || '')
  return String(text || '').replace(
    /(\b(?:to|through)\b\s*|\s*[-–—]\s*)(present|current|now|ongoing|to date|till date|to present)\b/gi,
    (_, lead) => `${lead}${stamp}`
  )
}
