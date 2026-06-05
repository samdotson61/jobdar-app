// Jobdar — `jobdar dashboard` (Phase 7.1). A lightweight, zero-dependency localhost web view of your
// pipeline: active region + level(s) + language, the application tracker, and configured portals.
// Read-only, bilingual, never phones home. renderDashboard() is a pure function (unit-tested).

import { createServer } from 'node:http'
import { loadProfile, loadPortals } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readTrackerRows } from '../tracker.mjs'
import { resolveState, stateLabel } from '../states.mjs'
import { resolveProvider } from '../../providers/_contract.mjs'
import { color, heading } from '../ui.mjs'

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function renderDashboard(t, { profile, portals, rows, lang }) {
  const regions = (profile.target_regions || []).map((r) => t(`regions.${r}`)).join(', ')
  const levels = (profile.target_levels || []).map((l) => t(`levels.${l}`)).join(', ')
  const body = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td>${esc(r.company)}</td><td>${esc(r.role)}</td><td>${esc(stateLabel(resolveState(r.state) || r.state, lang))}</td><td>${esc(r.updated)}</td></tr>`
        )
        .join('')
    : `<tr><td colspan="4" class="muted">${esc(t('tracker.empty'))}</td></tr>`
  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30"><title>Jobdar</title>
<style>
  a{color:#7aa2f7;text-decoration:none}a:hover{text-decoration:underline}
  body{font:15px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#0f1115;color:#e7e9ee}
  .wrap{max-width:860px;margin:0 auto;padding:32px 20px}
  h1{margin:0 0 6px;font-size:22px}
  .ctx{margin-bottom:22px}
  .pill{display:inline-block;background:#1b2230;border:1px solid #2b3344;border-radius:999px;padding:3px 11px;margin:0 6px 6px 0;font-size:13px;color:#aeb6c4}
  .card{background:#161922;border:1px solid #242a36;border-radius:10px;padding:16px 18px;margin-bottom:18px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#8b93a3;margin:0 0 10px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #242a36;font-size:14px}
  th{color:#8b93a3;font-weight:600;font-size:11px;text-transform:uppercase}
  .muted{color:#6f7787}
  footer{color:#6f7787;font-size:12px;margin-top:22px}
</style></head><body><div class="wrap">
  <h1>${esc(t('dashboard.title'))}</h1>
  <div class="ctx">
    <span class="pill">${esc(t('dashboard.region'))}: ${esc(regions)}</span>
    <span class="pill">${esc(t('dashboard.level'))}: ${esc(levels)}</span>
    <span class="pill">${esc(t('dashboard.language'))}: ${esc(lang)}</span>
    ${profile.name ? `<span class="pill">${esc(profile.name)}</span>` : ''}
  </div>
  <div class="card"><h2>${esc(t('dashboard.tracker'))}</h2>
    <table><thead><tr>
      <th>${esc(t('tracker.col_company'))}</th><th>${esc(t('tracker.col_role'))}</th>
      <th>${esc(t('tracker.col_state'))}</th><th>${esc(t('tracker.col_updated'))}</th>
    </tr></thead><tbody>${body}</tbody></table>
  </div>
  <div class="card"><h2>${esc(t('dashboard.portals'))} (${portals.length})</h2>
    ${
      portals.length
        ? `<table><tbody>${portals
            .map((p) => {
              const hit = resolveProvider(p)
              const url = esc(p.careers_url || '')
              return `<tr><td>${esc(p.company)}</td><td class="muted">${esc(hit ? hit.provider.id : '?')}</td><td><a href="${url}" target="_blank" rel="noopener">${url}</a></td></tr>`
            })
            .join('')}</tbody></table>`
        : `<div class="muted">${esc(t('scan.none'))}</div>`
    }
  </div>
  <footer>${esc(t('dashboard.footer'))}<br>${esc(t('dashboard.access'))}</footer>
</div></body></html>`
}

export async function runDashboard(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  const port = Number(flags.port) || 4319

  const server = createServer((req, res) => {
    const html = renderDashboard(t, { profile, portals: loadPortals(), rows: readTrackerRows(), lang })
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })

  heading(t('dashboard.title'))
  console.log(t('dashboard.serving', { url: `http://localhost:${port}` }))
  console.log(color.dim(t('dashboard.stop')))
  await new Promise(() => {}) // serve until Ctrl-C
}
