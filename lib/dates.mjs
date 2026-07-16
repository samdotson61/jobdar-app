// Jobfaro — résumé date normalization (Phase 7.8.2; rec-spec §3a). Zero-token and pure.
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
  const mo = Number(m[2])
  if (mo < 1 || mo > 12) return '' // reject malformed input rather than clamp it
  return `${MONTHS[mo - 1]} ${m[1]}`
}

// Replace an open-ended end-of-range token (Present/Current/Now/Ongoing/"to date") with today's
// month-year, but ONLY in a date-range context (after a dash or "to"/"through") so prose like
// "present your findings" is never touched. Pure; returns the text unchanged if today is unparseable.
export function normalizeResumeDates(text, today) {
  const stamp = monthYear(today)
  if (!stamp) return String(text || '')
  // Fire ONLY in a real range context: the terminator must sit right after a dash, or after a
  // 4-digit year + connector. This leaves prose untouched ("promoted to present role", "to current
  // standards", "present-day", "now-retired"). Trailing (?![\w-]) keeps "present-day" safe. "now"
  // and "to date" are deliberately excluded — too ambiguous with prose to normalize safely.
  return String(text || '').replace(
    /(\b\d{4}\s*(?:to|through|[-–—])\s*|[-–—]\s*)(present|current|ongoing)(?![\w-])/gi,
    (_, lead) => `${lead}${stamp}`
  )
}
