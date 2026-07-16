// Jobfaro — shared JD resolution for tailor/outreach with dead-link honesty. Job boards expire
// postings fast, so a fetch failure is an EXPECTED condition: print one clean bilingual line and
// report ok:false — never let it escape as a stack trace (bin/jobfaro's global handler stack-dumps
// anything unexpected, which is exactly wrong for "that listing closed").

import { existsSync } from 'node:fs'
import { extractText, isExtractable } from '../docparse.mjs'
import { fetchJobDescription } from '../../providers/_contract.mjs'
import { color } from '../ui.mjs'

// Resolve a JD reference (URL, or a local PDF/DOCX/text file) → { ok, title, description }.
// ok:false means the friendly error has already been printed; callers just stop politely.
// An unmatched/garbage ref resolves EMPTY (ok:true, no description) — that's the caller's honest
// "couldn't find a JD" path, not an error. `fetcher` is an injectable seam for tests.
export async function resolveJdSafe(ref, t, fetcher = fetchJobDescription) {
  try {
    if (ref && isExtractable(ref) && existsSync(ref)) {
      const d = extractText(ref)
      return { ok: true, title: String(ref).split('/').pop(), description: d.error ? '' : d.text }
    }
    const d = await fetcher(ref)
    return { ok: true, title: (d && d.title) || '', description: (d && d.description) || '' }
  } catch (err) {
    console.log(color.yellow(t('common.jd_fetch_error', { error: err && err.message ? err.message : String(err), url: ref })))
    return { ok: false, title: '', description: '' }
  }
}
