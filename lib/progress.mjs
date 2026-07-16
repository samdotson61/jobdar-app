// Jobfaro — the radar sweep: fun, honest progress for every long-running CLI verb (zero deps).
// Two modes, one controller:
//   • determinate  (total: N)   — a filling bar with a sweeping head, real counts, measured ETA
//   • indeterminate (total: null) — a bouncing radar blip with true elapsed time (a percent that
//     isn't measured would be a lie — single model calls and Batches polling get the blip)
// Honest by construction: tallies show only what actually landed, the ETA comes from the measured
// pace, and on a non-TTY stream (pipes, CI) the bar stays out entirely — the plain per-item lines
// remain the record. Pure renderers below are unit-tested; the controller is a thin TTY shell.

import { color } from './ui.mjs'

export const SWEEP_FRAMES = ['◐', '◓', '◑', '◒'] // the dish spinning at the head of the sweep
const BAR_WIDTH = 24

const ANSI = /\x1b\[[0-9;]*m/g
export const visibleLength = (s) => String(s).replace(ANSI, '').length

// Compact remaining-time estimate: '~45s' / '~4m' / '~1h 12m'. '' when unknown or done.
export function fmtEta(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return ''
  const s = Math.round(ms / 1000)
  if (s < 90) return `~${Math.max(1, s)}s`
  const m = Math.round(s / 60)
  if (m < 90) return `~${m}m`
  return `~${Math.floor(m / 60)}h ${m % 60}m`
}

// True elapsed time: '42s' / '3m 10s' / '1h 5m'. Never an estimate.
export function fmtElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0s'
  const s = Math.floor(ms / 1000)
  if (s < 90) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 90) return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

// Append ` · part`s only while they fit the width whole (colored segments are never cut
// mid-escape); the label alone is truncated. Shared by both renderers.
function fitLine(line, parts, label, width) {
  for (const part of parts) {
    if (part && visibleLength(line) + 3 + visibleLength(part) <= width - 1) line += ` · ${part}`
  }
  if (label) {
    const budget = width - visibleLength(line) - 4 // ' · ' + a margin for the wide 📡
    if (budget >= 8) {
      const plain = String(label)
      line += color.dim(' · ' + (plain.length > budget ? plain.slice(0, budget - 1) + '…' : plain))
    }
  }
  return line
}

// Determinate: 📡 3/10 [██████◐·········]  30% · 1 Apply · ✗ 2 · ~2m · Cardinal Health — …
export function renderRadar({ done, total, frame = 0, tallyText = '', label = '', width = 80, etaMs = 0 }) {
  const n = Math.max(1, Number(total) || 1)
  const d = Math.max(0, Math.min(Number(done) || 0, n))
  const pct = d / n
  const filled = Math.min(BAR_WIDTH, Math.round(pct * BAR_WIDTH))
  const sweeping = d < n
  const sweep = sweeping ? SWEEP_FRAMES[frame % SWEEP_FRAMES.length] : ''
  const rest = Math.max(0, BAR_WIDTH - filled - (sweeping ? 1 : 0))
  const line = `📡 ${d}/${n} [${'█'.repeat(filled)}${sweep}${'·'.repeat(rest)}] ${String(Math.round(pct * 100)).padStart(3)}%`
  const eta = sweeping ? fmtEta(etaMs) : ''
  return fitLine(line, [tallyText, eta ? color.dim(eta) : ''], label, width)
}

// Indeterminate: 📡 [··········◑·············] 42s · tailoring Data Analyst I
// The blip bounces across the track — motion without a fake percent; elapsed time is always true.
export function renderSweep({ frame = 0, tallyText = '', label = '', width = 80, elapsedMs = 0 }) {
  const span = BAR_WIDTH - 1
  const phase = frame % (2 * span)
  const pos = phase <= span ? phase : 2 * span - phase
  const track = '·'.repeat(pos) + SWEEP_FRAMES[frame % SWEEP_FRAMES.length] + '·'.repeat(BAR_WIDTH - pos - 1)
  const line = `📡 [${track}] ${fmtElapsed(elapsedMs)}`
  return fitLine(line, [tallyText], label, width)
}

// Controller. `total: N` → bar; `total: null` → sweep. `tallies` is caller-defined:
// [{ key, fmt: (n) => string }] — a tally renders only once its count is > 0, so the line grows
// as results land instead of opening with a row of zeros. tick(key, n?) advances one unit of work
// and adds n (default 1) to that tally — e.g. scan ticks one portal with the roles it kept.
// Every method is a safe no-op where it has nothing to do; callers never branch on TTY-ness.
export function createRadar({ total = null, stream = process.stdout, tallies = [] } = {}) {
  const counts = Object.fromEntries(tallies.map((s) => [s.key, 0]))
  const state = { done: 0, total, frame: 0, label: '', startedAt: 0 }
  const isActive = Boolean(stream.isTTY)
  let started = false
  let timer = null
  const tallyText = () => tallies.filter((s) => counts[s.key] > 0).map((s) => s.fmt(counts[s.key])).join(' · ')
  const etaMs = () => (state.done > 0 ? ((Date.now() - state.startedAt) / state.done) * (state.total - state.done) : 0)
  const compose = () => {
    const width = stream.columns || 80
    if (state.total == null) return renderSweep({ frame: state.frame, tallyText: tallyText(), label: state.label, width, elapsedMs: Date.now() - state.startedAt })
    return renderRadar({ done: state.done, total: state.total, frame: state.frame, tallyText: tallyText(), label: state.label, width, etaMs: etaMs() })
  }
  const draw = () => {
    if (started && isActive) stream.write('\r\x1b[2K' + compose())
  }
  return {
    active: isActive,
    start(label = '') {
      state.label = label
      state.startedAt = Date.now()
      started = true
      if (isActive) {
        timer = setInterval(() => {
          state.frame++
          draw()
        }, 120)
        if (timer.unref) timer.unref()
        draw()
      }
    },
    label(l) {
      state.label = l
      draw()
    },
    tick(key, n = 1) {
      state.done++
      if (key in counts) counts[key] += n
      draw()
    },
    log(line) {
      if (started && isActive) stream.write('\r\x1b[2K')
      console.log(line)
      draw()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = null
      if (started && isActive) stream.write('\r\x1b[2K')
      started = false
    },
  }
}
