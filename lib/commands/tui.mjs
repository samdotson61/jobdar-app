// Jobdar — `jobdar tui`. An interactive, zero-dependency terminal view over the pipeline
// (data/pipeline.tsv). Roles discovered by `scan` show as "pending eval" — the deterministic tool does
// NOT score fit. Once the model records a verdict (`jobdar eval --save`), the role shows its fit score +
// band, color-coded: Apply (green) / Research (yellow) / Don't (dim). renderTui() is pure (unit-tested);
// runTui() drives the raw-mode loop. Non-TTY → one frame and exit (scriptable).
//   Keys: s sort · 1/2/3 band filter · p pending · 0 all · c cycle company · C clear · r refresh · q quit · ↑/↓ scroll

import { loadProfile } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, isEvaluated } from '../evaluations.mjs'
import { color } from '../ui.mjs'

const A = { altOn: '\x1b[?1049h', altOff: '\x1b[?1049l', hide: '\x1b[?25l', show: '\x1b[?25h', clear: '\x1b[2J\x1b[H' }
const SORTS = ['score', 'company', 'band']
const BAND_COLOR = { apply: color.green, research: color.yellow, dont: color.dim }
const num = (r) => Number(r.score) || 0
const pad = (s, n) => {
  const str = String(s == null ? '' : s)
  return str.length > n ? str.slice(0, n - 1) + '…' : str.padEnd(n)
}

function view(rows, { sort, filter, company }) {
  let v = rows.slice()
  if (filter === 'pending') v = v.filter((r) => !isEvaluated(r))
  else if (filter && filter !== 'all') v = v.filter((r) => isEvaluated(r) && r.band === filter)
  if (company) v = v.filter((r) => String(r.company || '').toLowerCase().includes(String(company).toLowerCase()))
  if (sort === 'company') v.sort((a, b) => String(a.company).localeCompare(String(b.company)) || num(b) - num(a))
  else v.sort((a, b) => num(b) - num(a)) // score: evaluated (scored) first, then pending (0)
  return v
}

export function renderTui(t, { profile, rows = [], lang, sort = 'score', filter = 'all', company = null, scroll = 0, height = 24 }) {
  const regions = (profile.target_regions || []).map((r) => t(`regions.${r}`)).join(', ')
  const levels = (profile.target_levels || []).map((l) => t(`levels.${l}`)).join(', ')
  const counts = { apply: 0, research: 0, dont: 0, pending: 0 }
  for (const r of rows) {
    if (isEvaluated(r)) counts[r.band] != null && counts[r.band]++
    else counts.pending++
  }
  const v = view(rows, { sort, filter, company })

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
    const room = Math.max(3, height - 13)
    const shown = v.slice(scroll, scroll + room)
    for (const r of shown) {
      if (isEvaluated(r)) {
        const c = BAND_COLOR[r.band] || ((s) => s)
        lines.push('   ' + c(pad(num(r).toFixed(1), 6) + pad(t('bands.' + r.band) || r.band, 13)) + pad(r.role, 30) + pad(r.company, 16) + (r.location || ''))
      } else {
        lines.push('   ' + color.dim(pad('—', 6) + pad(t('tui.pending'), 13)) + pad(r.role, 30) + pad(r.company, 16) + (r.location || ''))
      }
    }
    const more = v.length - (scroll + shown.length)
    if (more > 0) lines.push(color.dim(`   … +${more} more`))
  }
  lines.push('')
  lines.push(color.dim(' ' + t('tui.keys')))
  return lines.join('\n') + '\n'
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
  let scroll = 0
  let state = load()
  const draw = () => {
    state = load()
    process.stdout.write(A.clear + renderTui(t, { ...state, sort, filter, company, scroll, height: process.stdout.rows || 24 }))
  }
  const restore = () => {
    try {
      process.stdin.setRawMode(false)
    } catch {
      /* ignore */
    }
    process.stdout.write(A.show + A.altOff)
  }
  const onKey = (buf) => {
    const k = buf.toString()
    if (k === 'q' || k === '\x03') {
      restore()
      process.stdin.removeListener('data', onKey)
      process.stdin.pause()
      process.exit(0)
    } else if (k === 'r') {
      draw()
    } else if (k === 's') {
      sort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length]
      scroll = 0
      draw()
    } else if (k === '1' || k === '2' || k === '3') {
      filter = { 1: 'apply', 2: 'research', 3: 'dont' }[k]
      scroll = 0
      draw()
    } else if (k === 'p') {
      filter = 'pending'
      scroll = 0
      draw()
    } else if (k === '0') {
      filter = 'all'
      scroll = 0
      draw()
    } else if (k === 'c') {
      const cs = [...new Set(state.rows.map((r) => r.company).filter(Boolean))].sort()
      companyIdx = (companyIdx + 1) % (cs.length + 1)
      company = companyIdx >= cs.length ? null : cs[companyIdx]
      scroll = 0
      draw()
    } else if (k === 'C') {
      company = null
      companyIdx = -1
      scroll = 0
      draw()
    } else if (k === 'j' || k === '\x1b[B') {
      scroll = Math.min(scroll + 1, Math.max(0, state.rows.length - 1))
      draw()
    } else if (k === 'k' || k === '\x1b[A') {
      scroll = Math.max(0, scroll - 1)
      draw()
    }
  }

  process.on('exit', restore)
  process.stdout.write(A.altOn + A.hide)
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.stdin.on('data', onKey)
  process.stdout.on('resize', draw)
  draw()
  await new Promise(() => {})
}
