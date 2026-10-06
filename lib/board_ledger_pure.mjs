// Jobdar — the board ledger (PURE: arrays/strings in → out, no fs, no network). The pipeline only
// remembers roles that passed the user's filters, and `scan --prune` forgets the ones that left a
// board — so nothing in it can answer "how does this EMPLOYER behave?". The ledger keeps one row per
// posting ever seen on a board: when it first appeared, when it disappeared, and whether it came back.
// From that history an employer's own norm falls out (how long roles stay open, how many close a
// month, how often a closed role is reposted), which is the only outside evidence of active hiring
// that survives scrutiny — a single posting reveals almost nothing about itself.
//
// Honesty rules (the liveness contract, carried over):
//   • only a COMPLETE look at a board can close a posting — a failed, truncated, or suspiciously
//     short listing adds what it saw but never marks anything gone;
//   • a posting that returns is REOPENED (and counted), never treated as new — unless it was missing
//     from exactly one look, which is a paging blip (a big board shifts while it is being read), so a
//     closure dated at the board's latest complete look is provisional until the next look agrees;
//   • a board that suddenly lists under half its roles is not believed until a second look says the
//     same — one short read closes nothing;
//   • open rows are not rewritten day to day (`last_seen` is stamped only at closure), so the stored
//     file changes by exactly what changed on the boards.
//
// The scheduled baseline scan (scripts/baseline-scan.mjs) is the first writer; the same functions
// are meant to run on a user's own scans later.

export const LEDGER_COLS = ['employer', 'board', 'url', 'title', 'location', 'posted', 'first_seen', 'last_seen', 'gone_on', 'reopens']
export const BOARD_COLS = ['board', 'employer', 'provider', 'last_ok', 'last_count']
export const RUN_COLS = ['date', 'board', 'employer', 'provider', 'status', 'count', 'note']

// Providers mark a list they did not read to its end `incomplete` (1.67.1); that flag, not a size
// guess, decides whether absence means anything. (A 2,000-row guess used to stand in for it.)
export const TRUNCATION_CAP = Infinity
// A board that had at least this many roles and now lists under half of them is treated as a bad
// read (partial page, outage, changed markup) rather than a mass closure.
const SHRINK_MIN_PREV = 10

export function parseTsv(text, cols) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length <= 1) return []
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cells = line.split('\t')
    const row = {}
    header.forEach((h, i) => (row[h] = cells[i] ?? ''))
    for (const c of cols) if (!(c in row)) row[c] = ''
    return row
  })
}

export function serializeTsv(rows, cols) {
  const esc = (v) => String(v == null ? '' : v).replace(/[\t\n\r]/g, ' ')
  return [cols.join('\t'), ...(rows || []).map((r) => cols.map((c) => esc(r[c])).join('\t'))].join('\n') + '\n'
}

const shiftDay = (dateStr, days) => {
  const d = new Date(String(dateStr) + 'T00:00:00Z')
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

// The board's own posting date as a day. ISO timestamps pass through. Workday lists only say
// "Posted Today" / "Posted Yesterday" / "Posted 6 Days Ago" / "Posted 30+ Days Ago": the first three
// resolve against the day we looked; "30+" is an upper bound, written `<YYYY-MM-DD` (posted on or
// before that day) so it can never be mistaken for an exact date.
export function postedDay(postedOn, dateStr) {
  const s = String(postedOn == null ? '' : postedOn).trim()
  const iso = s.match(/^\d{4}-\d{2}-\d{2}/)
  if (iso) return iso[0]
  if (/^posted today$/i.test(s)) return shiftDay(dateStr, 0)
  if (/^posted yesterday$/i.test(s)) return shiftDay(dateStr, 1)
  const n = s.match(/^posted (\d+)(\+)? days? ago$/i)
  if (n) {
    const day = shiftDay(dateStr, Number(n[1]))
    return day && n[2] ? `<${day}` : day
  }
  return ''
}

// Can this look at a board close postings? 'ok' = a complete listing; 'partial' = something was
// listed but absence proves nothing; 'failed' = nothing usable.
export function observationStatus({ ok, count, prevCount = 0, cap = TRUNCATION_CAP, incomplete = false }) {
  if (!ok) return 'failed'
  if (incomplete) return 'partial' // the provider said it did not reach the end of the board
  const n = Number(count) || 0
  const prev = Number(prevCount) || 0
  if (n >= cap) return 'partial' // a caller-supplied ceiling, if any
  if (prev >= SHRINK_MIN_PREV && n < prev / 2) return 'partial'
  return 'ok'
}

// Fold one day's observations into the ledger. Pure — inputs are never mutated.
//   state        { rows: ledger rows, boards: board rows }
//   observations [{ board, employer, provider, ok, incomplete?, jobs: [{ url, title, location, postedOn }], error? }]
// Returns { rows, boards, runs, totals } where `runs` is this day's per-board log lines.
export function advanceLedger(state, observations, dateStr) {
  const rows = (state && state.rows ? state.rows : []).map((r) => ({ ...r }))
  const boards = new Map((state && state.boards ? state.boards : []).map((b) => [b.board, { ...b }]))
  const byUrl = new Map(rows.map((r) => [r.url, r]))
  const runs = []
  const totals = { added: 0, closed: 0, reopened: 0, ok: 0, partial: 0, failed: 0 }

  for (const obs of observations || []) {
    if (!obs || !obs.board) continue
    const prev = boards.get(obs.board) || { board: obs.board, employer: obs.employer || '', provider: obs.provider || '', last_ok: '', last_count: '' }
    const jobs = (obs.jobs || []).filter((j) => j && j.url)
    const status = observationStatus({ ok: Boolean(obs.ok), count: jobs.length, prevCount: prev.last_count, incomplete: Boolean(obs.incomplete) })
    totals[status]++
    const seen = new Set()
    let added = 0
    let closed = 0
    let reopened = 0

    for (const j of jobs) {
      if (seen.has(j.url)) continue
      seen.add(j.url)
      const posted = postedDay(j.postedOn, dateStr)
      const row = byUrl.get(j.url)
      if (!row) {
        const fresh = {
          employer: obs.employer || '', board: obs.board, url: j.url, title: j.title || j.role || '', location: j.location || '',
          posted, first_seen: dateStr, last_seen: '', gone_on: '', reopens: '',
        }
        rows.push(fresh)
        byUrl.set(j.url, fresh)
        added++
        continue
      }
      if (row.gone_on) {
        // Marked gone at the immediately preceding complete look and back now: it was missed, not reposted.
        const blip = row.gone_on === prev.last_ok
        row.gone_on = ''
        row.last_seen = ''
        if (!blip) {
          row.reopens = String((Number(row.reopens) || 0) + 1)
          reopened++
        }
      }
      // An exact date beats none, and beats a "posted on or before" bound; never the other way. Between
      // two exact dates the EARLIER stands — a board that re-dates a posting has refreshed it, not reposted it.
      if (posted && !posted.startsWith('<') && (!row.posted || row.posted.startsWith('<') || posted < row.posted)) row.posted = posted
    }

    if (status === 'ok') {
      // The posting was last on the board at the previous complete look; it closed between then and now.
      const lastSeen = prev.last_ok && prev.last_ok < dateStr ? prev.last_ok : ''
      for (const r of rows) {
        if (r.board !== obs.board || r.gone_on || seen.has(r.url)) continue
        r.gone_on = dateStr
        r.last_seen = lastSeen || r.first_seen
        closed++
      }
      boards.set(obs.board, { ...prev, employer: obs.employer || prev.employer, provider: obs.provider || prev.provider, last_ok: dateStr, last_count: String(jobs.length) })
    } else if (status === 'partial' && !obs.incomplete && jobs.length < TRUNCATION_CAP) {
      // A short read: remember its size (not its date). If the next look is about as short, the board
      // really did shrink and that look counts as complete; otherwise this one was a bad read.
      boards.set(obs.board, { ...prev, last_count: String(jobs.length) })
    } else if (!boards.has(obs.board)) {
      boards.set(obs.board, prev)
    }

    totals.added += added
    totals.closed += closed
    totals.reopened += reopened
    const note = status === 'failed' ? String(obs.error || '').slice(0, 160) : `+${added} -${closed} ~${reopened}`
    runs.push({ date: dateStr, board: obs.board, employer: obs.employer || '', provider: obs.provider || '', status, count: String(jobs.length), note })
  }

  return { rows, boards: [...boards.values()], runs, totals }
}

// Append a day's run lines to the log; a re-run on the same day replaces that day's lines per board.
export function mergeRuns(existing, runs) {
  const fresh = new Set((runs || []).map((r) => `${r.date}|${r.board}`))
  return [...(existing || []).filter((r) => !fresh.has(`${r.date}|${r.board}`)), ...(runs || [])]
}
