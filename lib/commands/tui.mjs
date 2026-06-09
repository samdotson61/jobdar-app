// Jobdar — `jobdar tui`. An interactive, zero-dependency terminal workspace over the pipeline
// (data/pipeline.tsv). Roles discovered by `scan` show as "pending eval" — the deterministic tool does
// NOT score fit. Once the model records a verdict (`jobdar eval --save`), the role shows its fit score +
// band, color-coded: Apply (green) / Research (yellow) / Don't (dim); human-tracked statuses (applied, …)
// show their state label. A cursor row makes it a workspace: open the posting, mark it applied.
// Scrolling is first-class: mouse wheel (alternate-scroll mode), arrows/j/k, PgUp/PgDn, Home/End, g/G,
// with a "from–to of N" position indicator. renderTui() is pure (unit-tested); runTui() drives the
// raw-mode loop. Non-TTY → one frame and exit (scriptable).

import { spawn } from 'node:child_process'
import { loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, isEvaluated, isTracked, updateStatusByUrl } from '../evaluations.mjs'
import { stateLabel } from '../states.mjs'
import { color } from '../ui.mjs'

// 1049 = alt screen · 25 = cursor · 1007 = alternate scroll (terminal turns mouse-wheel into arrow keys)
const A = {
  on: '\x1b[?1049h\x1b[?25l\x1b[?1007h',
  off: '\x1b[?1007l\x1b[?25h\x1b[?1049l',
  clear: '\x1b[2J\x1b[H',
}
const inv = (s) => `\x1b[7m${s}\x1b[27m`
const SORTS = ['score', 'company', 'band']
const BAND_COLOR = { apply: color.green, research: color.yellow, dont: color.dim }
const num = (r) => Number(r.score) || 0
const pad = (s, n) => {
  const str = String(s == null ? '' : s)
  return str.length > n ? str.slice(0, n - 1) + '…' : str.padEnd(n)
}

// The filtered + sorted view — shared by render and the key loop so cursor/scroll math always agrees.
export function pipelineView(rows, { sort = 'score', filter = 'all', company = null } = {}) {
  let v = (rows || []).slice()
  if (filter === 'pending') v = v.filter((r) => !isEvaluated(r))
  else if (filter && filter !== 'all') v = v.filter((r) => isEvaluated(r) && r.band === filter)
  if (company) v = v.filter((r) => String(r.company || '').toLowerCase().includes(String(company).toLowerCase()))
  if (sort === 'company') v.sort((a, b) => String(a.company).localeCompare(String(b.company)) || num(b) - num(a))
  else v.sort((a, b) => num(b) - num(a)) // score: evaluated (scored) first, then pending (0)
  return v
}

export const tuiRoom = (height) => Math.max(3, height - 14)

export function renderTui(t, { profile, rows = [], lang, sort = 'score', filter = 'all', company = null, scroll = 0, cursor = -1, height = 24 }) {
  const regions = (profile.target_regions || []).map((r) => t(`regions.${r}`)).join(', ')
  const levels = (profile.target_levels || []).map((l) => t(`levels.${l}`)).join(', ')
  const counts = { apply: 0, research: 0, dont: 0, pending: 0 }
  for (const r of rows) {
    if (isEvaluated(r)) counts[r.band] != null && counts[r.band]++
    else counts.pending++
  }
  const v = pipelineView(rows, { sort, filter, company })

  const lines = []
  lines.push(color.cyan(color.bold(` ${t('dashboard.title')} `)))
  lines.push(color.dim(` ${t('dashboard.region')}: ${regions}   ${t('dashboard.level')}: ${levels}   ${t('dashboard.language')}: ${lang}`))
  lines.push(
    ' ' +
      color.green(`${t('bands.apply')} ${counts.apply}`) +
      '   ' + color.yellow(`${t('bands.research')} ${counts.research}`) +
      '   ' + color.dim(`${t('bands.dont')} ${counts.dont}`) +
      '   ' + color.dim(`${counts.pending} ${t('tui.pending')}`) +
      '    ' + color.cyan(t('tui.sorted', { mode: t('tui.by_' + sort) })) +
      (filter !== 'all' ? color.cyan(`  [${filter === 'pending' ? t('tui.pending') : t('bands.' + filter)}]`) : '') +
      (company ? color.cyan(`  ⌕ ${company}`) : '')
  )
  lines.push('')
  if (!rows.length) {
    lines.push('   ' + color.dim(t('tui.empty')))
  } else if (!v.length) {
    lines.push('   ' + color.dim(t('tui.none_match')))
  } else {
    lines.push(color.dim('   ' + pad(t('tui.col_score'), 6) + pad(t('tui.col_band'), 13) + pad(t('tui.col_role'), 30) + pad(t('tui.col_company'), 16) + t('tui.col_location')))
    const room = tuiRoom(height)
    const shown = v.slice(scroll, scroll + room)
    shown.forEach((r, i) => {
      const idx = scroll + i
      let line
      if (isTracked(r)) {
        line = '   ' + color.cyan(pad(isEvaluated(r) ? num(r).toFixed(1) : '—', 6) + pad(stateLabel(r.status, lang), 13)) + pad(r.role, 30) + pad(r.company, 16) + (r.location || '')
      } else if (isEvaluated(r)) {
        const c = BAND_COLOR[r.band] || ((s) => s)
        line = '   ' + c(pad(num(r).toFixed(1), 6) + pad(t('bands.' + r.band) || r.band, 13)) + pad(r.role, 30) + pad(r.company, 16) + (r.location || '')
      } else {
        line = '   ' + color.dim(pad('—', 6) + pad(t('tui.pending'), 13)) + pad(r.role, 30) + pad(r.company, 16) + (r.location || '')
      }
      lines.push(idx === cursor ? inv(line) : line)
    })
    lines.push(color.dim('   ' + t('tui.position', { from: v.length ? scroll + 1 : 0, to: scroll + shown.length, total: v.length })))
  }
  lines.push('')
  lines.push(color.dim(' ' + t('tui.keys')))
  return lines.join('\n') + '\n'
}

function openUrl(url) {
  if (!url) return
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url]
  try {
    spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref()
  } catch {
    /* non-fatal */
  }
}

export async function runTui(argv = []) {
  const { flags } = parseFlags(argv)
  const lang = resolveLang(flags, loadProfile())
  const t = getT(lang)
  const load = () => ({ profile: loadProfile(), rows: readPipeline(), lang })

  if (!process.stdin.isTTY) {
    process.stdout.write(renderTui(t, { ...load(), height: process.stdout.rows || 24 }))
    return
  }

  let sort = 'score'
  let filter = 'all'
  let company = null
  let companyIdx = -1
  let cursor = 0
  let scroll = 0
  let state = load()

  const view = () => pipelineView(state.rows, { sort, filter, company })
  // Keep the cursor inside the view and the scroll window following the cursor.
  const clampNav = () => {
    const len = view().length
    cursor = Math.max(0, Math.min(cursor, len - 1))
    const room = tuiRoom(process.stdout.rows || 24)
    if (cursor < scroll) scroll = cursor
    if (cursor >= scroll + room) scroll = cursor - room + 1
    scroll = Math.max(0, Math.min(scroll, Math.max(0, len - room)))
  }
  const draw = (reload = true) => {
    if (reload) state = load()
    clampNav()
    process.stdout.write(A.clear + renderTui(t, { ...state, sort, filter, company, scroll, cursor, height: process.stdout.rows || 24 }))
  }
  const restore = () => {
    try {
      process.stdin.setRawMode(false)
    } catch {
      /* ignore */
    }
    process.stdout.write(A.off)
  }
  const move = (d) => {
    cursor += d
    draw(false)
  }
  const resetNav = () => {
    cursor = 0
    scroll = 0
  }

  const onKey = (buf) => {
    const k = buf.toString()
    const room = tuiRoom(process.stdout.rows || 24)
    if (k === 'q' || k === '\x03') {
      restore()
      process.stdin.removeListener('data', onKey)
      process.stdin.pause()
      process.exit(0)
    } else if (k === 'r') {
      draw()
    } else if (k === 'j' || k === '\x1b[B' || k === '\x1bOB') {
      move(1)
    } else if (k === 'k' || k === '\x1b[A' || k === '\x1bOA') {
      move(-1)
    } else if (k === '\x1b[6~') {
      move(room) // PgDn
    } else if (k === '\x1b[5~') {
      move(-room) // PgUp
    } else if (k === 'g' || k === '\x1b[H' || k === '\x1b[1~') {
      cursor = 0
      draw(false) // Home
    } else if (k === 'G' || k === '\x1b[F' || k === '\x1b[4~') {
      cursor = view().length - 1
      draw(false) // End
    } else if (k === 'o' || k === '\r') {
      const row = view()[cursor]
      if (row) openUrl(row.url)
    } else if (k === 'a') {
      const row = view()[cursor]
      if (row && row.url) {
        updateStatusByUrl(row.url, 'applied')
        draw()
      }
    } else if (k === 's') {
      sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]
      resetNav()
      draw()
    } else if (k === '1' || k === '2' || k === '3') {
      filter = { 1: 'apply', 2: 'research', 3: 'dont' }[k]
      resetNav()
      draw()
    } else if (k === 'p') {
      filter = 'pending'
      resetNav()
      draw()
    } else if (k === '0') {
      filter = 'all'
      resetNav()
      draw()
    } else if (k === 'c') {
      const cs = [...new Set(state.rows.map((r) => r.company).filter(Boolean))].sort()
      companyIdx = (companyIdx + 1) % (cs.length + 1)
      company = companyIdx >= cs.length ? null : cs[companyIdx]
      resetNav()
      draw()
    } else if (k === 'C') {
      company = null
      companyIdx = -1
      resetNav()
      draw()
    }
  }

  process.on('exit', restore)
  process.stdout.write(A.on)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', onKey)
  process.stdout.on('resize', () => draw(false))
  draw()
  await new Promise(() => {})
}
