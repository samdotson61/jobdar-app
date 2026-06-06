// Jobdar — `jobdar dashboard`. A zero-dependency localhost web view of your pipeline. It mirrors the
// `jobdar tui` (scored roles: score · band · role · company · location, with Apply/Research/Don't/pending
// counts and a band filter) AND adds an analytics section with charts. Charts are server-rendered inline
// SVG — no JS libraries, no CDN, nothing leaves your machine. The only client JS is a tiny inline script
// for column sorting (persisted in sessionStorage). renderDashboard() is pure (unit-tested); runDashboard()
// serves it read-only and auto-refreshes.

import { createServer } from 'node:http'
import { loadProfile, loadPortals } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { readPipeline, isEvaluated } from '../evaluations.mjs'
import { readTrackerRows } from '../tracker.mjs'
import { resolveState, stateLabel } from '../states.mjs'
import { loadEmployers } from '../seed.mjs'
import { parseLocation } from '../regions.mjs'
import { resolveProvider } from '../../providers/_contract.mjs'
import { color, heading } from '../ui.mjs'

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const BAND_HEX = { apply: '#3fb950', research: '#d29922', dont: '#6f7787', pending: '#58a6ff' }
const BAND_ORDER = ['apply', 'research', 'dont', 'pending']
const BAND_RANK = { apply: 3, research: 2, dont: 1 }
const num = (r) => Number(r.score) || 0

// Bucket a job location into a state / Remote / Intl / Other for the geography breakdown.
function locBucket(loc) {
  const p = parseLocation(loc || '')
  if (p.usStates && p.usStates.length) return p.usStates[0]
  if (p.remote && !p.foreign) return 'Remote'
  if (p.foreign) return 'Intl'
  return 'Other'
}

// --- pure analytics over the pipeline rows (+ catalog for sector/region metadata) ---
export function analyze(pipeline = [], tracker = [], catalog = []) {
  const counts = { apply: 0, research: 0, dont: 0, pending: 0 }
  const byCompany = new Map(), bySector = new Map(), byLoc = new Map()
  const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i * 0.5, value: 0 })) // 0–5 in 0.5 steps
  const meta = new Map(catalog.map((e) => [e.company, e]))
  const bump = (map, key) => {
    let c = map.get(key)
    if (!c) { c = { name: key, total: 0, bands: { apply: 0, research: 0, dont: 0, pending: 0 } }; map.set(key, c) }
    return c
  }
  let scoreSum = 0
  for (const r of pipeline) {
    const evald = isEvaluated(r)
    const key = evald ? r.band : 'pending'
    if (counts[key] != null) counts[key]++
    for (const [map, name] of [
      [byCompany, r.company || '?'],
      [bySector, (meta.get(r.company) || {}).sector || 'other'],
      [byLoc, locBucket(r.location)],
    ]) {
      const c = bump(map, name)
      c.total++
      c.bands[key] = (c.bands[key] || 0) + 1
    }
    if (evald) {
      bins[Math.max(0, Math.min(9, Math.floor(num(r) / 0.5)))].value++
      scoreSum += num(r)
    }
  }
  const evaluated = pipeline.filter(isEvaluated).length
  const desc = (m, n) => [...m.values()].sort((a, b) => b.total - a.total).slice(0, n)
  return {
    counts,
    total: pipeline.length,
    evaluated,
    avgScore: evaluated ? scoreSum / evaluated : 0,
    bins,
    topCompanies: desc(byCompany, 10),
    sectors: desc(bySector, 12),
    locations: desc(byLoc, 8),
    funnel: [
      { label: 'discovered', value: pipeline.length },
      { label: 'evaluated', value: evaluated },
      { label: 'applytier', value: counts.apply },
      { label: 'applied', value: tracker.length },
    ],
  }
}

// --- inline-SVG chart helpers (pure strings) ---
function stackedBar(segs, total, width = 600, height = 22) {
  if (!total) return ''
  let x = 0
  const rects = BAND_ORDER.filter((b) => segs[b] > 0)
    .map((b) => {
      const w = Math.max(1, Math.round((segs[b] / total) * width))
      const r = `<rect x="${x}" y="0" width="${w}" height="${height}" fill="${BAND_HEX[b]}"><title>${b}: ${segs[b]}</title></rect>`
      x += w
      return r
    })
    .join('')
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" role="img">${rects}</svg>`
}

function scoreHistogram(bins) {
  const W = 600, H = 150, base = H - 22, top = 14
  const max = Math.max(1, ...bins.map((b) => b.value))
  const bw = W / bins.length
  const body = bins
    .map((b, i) => {
      const h = Math.round((b.value / max) * (base - top))
      const x = i * bw + 4
      const y = base - h
      const col = b.lo >= 4 ? BAND_HEX.apply : b.lo >= 3.5 ? BAND_HEX.research : BAND_HEX.dont
      const bar = `<rect x="${x}" y="${y}" width="${bw - 8}" height="${h}" fill="${col}" rx="2"><title>${b.lo.toFixed(1)}–${(b.lo + 0.5).toFixed(1)}: ${b.value}</title></rect>`
      const lbl = `<text x="${x + (bw - 8) / 2}" y="${H - 6}" fill="#6f7787" font-size="9" text-anchor="middle">${b.lo.toFixed(1)}</text>`
      const cnt = b.value ? `<text x="${x + (bw - 8) / 2}" y="${y - 3}" fill="#aeb6c4" font-size="9" text-anchor="middle">${b.value}</text>` : ''
      return bar + lbl + cnt
    })
    .join('')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img">${body}</svg>`
}

// Horizontal bars, stacked by band — used for top companies, sectors, and locations.
function hBarChart(items, labelW = 150) {
  if (!items.length) return ''
  const W = 600, rowH = 26, max = Math.max(1, ...items.map((c) => c.total))
  const barMax = W - labelW - 36
  const rows = items
    .map((c, i) => {
      const y = i * rowH
      let x = labelW
      const segs = BAND_ORDER.map((b) => {
        const v = c.bands[b] || 0
        if (!v) return ''
        const w = Math.max(1, Math.round((v / max) * barMax))
        const r = `<rect x="${x}" y="${y + 4}" width="${w}" height="${rowH - 12}" fill="${BAND_HEX[b]}"><title>${esc(c.name)} — ${b}: ${v}</title></rect>`
        x += w
        return r
      }).join('')
      const name = c.name.length > 22 ? c.name.slice(0, 21) + '…' : c.name
      const label = `<text x="0" y="${y + rowH / 2}" fill="#aeb6c4" font-size="11" dominant-baseline="middle">${esc(name)}</text>`
      const tot = `<text x="${x + 6}" y="${y + rowH / 2}" fill="#8b93a3" font-size="10" dominant-baseline="middle">${c.total}</text>`
      return label + segs + tot
    })
    .join('')
  return `<svg viewBox="0 0 ${W} ${items.length * rowH}" width="100%" height="${items.length * rowH}" role="img">${rows}</svg>`
}

function funnelChart(stages, labels) {
  const W = 600, rowH = 30, gap = 8, labelW = 150, max = Math.max(1, ...stages.map((s) => s.value))
  const cols = ['#58a6ff', '#7aa2f7', '#3fb950', '#d29922']
  const rows = stages
    .map((s, i) => {
      const y = i * (rowH + gap)
      const w = Math.max(2, Math.round((s.value / max) * (W - labelW - 50)))
      const label = `<text x="0" y="${y + (rowH - 6) / 2}" fill="#aeb6c4" font-size="11" dominant-baseline="middle">${esc(labels[s.label] || s.label)}</text>`
      const bar = `<rect x="${labelW}" y="${y}" width="${w}" height="${rowH - 6}" fill="${cols[i] || '#8b93a3'}" rx="3"/>`
      const val = `<text x="${labelW + w + 6}" y="${y + (rowH - 6) / 2}" fill="#e7e9ee" font-size="11" font-weight="600" dominant-baseline="middle">${s.value}</text>`
      return label + bar + val
    })
    .join('')
  return `<svg viewBox="0 0 ${W} ${stages.length * (rowH + gap)}" width="100%" height="${stages.length * (rowH + gap)}" role="img">${rows}</svg>`
}

// Tiny inline sorter: click a column header to sort the pipeline table; persists across the auto-refresh
// via sessionStorage. Pure local JS — no libraries, no network.
const SORT_SCRIPT = `<script>
(function(){
  var tbl=document.getElementById('pipe'); if(!tbl||!tbl.tHead) return;
  var tb=tbl.tBodies[0], ths=tbl.tHead.rows[0].cells, KEY='jobdar-sort';
  function apply(col,dir){
    var rows=[].slice.call(tb.rows).filter(function(r){return r.cells.length>1});
    rows.sort(function(a,b){
      var av=a.cells[col].getAttribute('data-v')||'', bv=b.cells[col].getAttribute('data-v')||'';
      var an=parseFloat(av), bn=parseFloat(bv), n=!isNaN(an)&&!isNaN(bn);
      var c=n?an-bn:av.localeCompare(bv); return dir==='asc'?c:-c;
    });
    rows.forEach(function(r){tb.appendChild(r)});
    for(var i=0;i<ths.length;i++){var s=ths[i].querySelector('.ind'); if(s)s.textContent=(i===col)?(dir==='asc'?' \\u25B2':' \\u25BC'):'';}
  }
  for(var i=0;i<ths.length;i++){(function(i){ths[i].addEventListener('click',function(){
    var cur={}; try{cur=JSON.parse(sessionStorage.getItem(KEY)||'{}')}catch(e){}
    var dir=(cur.col===i&&cur.dir==='desc')?'asc':'desc';
    sessionStorage.setItem(KEY,JSON.stringify({col:i,dir:dir})); apply(i,dir);
  });})(i);}
  try{var s=JSON.parse(sessionStorage.getItem(KEY)||'null'); if(s&&typeof s.col==='number')apply(s.col,s.dir);}catch(e){}
})();
</script>`

export function renderDashboard(t, { profile, portals = [], pipeline = [], tracker = [], catalog = [], lang, view = {} }) {
  const regions = (profile.target_regions || []).map((r) => t(`regions.${r}`)).join(', ')
  const levels = (profile.target_levels || []).map((l) => t(`levels.${l}`)).join(', ')
  const a = analyze(pipeline, tracker, catalog)
  const band = view.band && ['apply', 'research', 'dont', 'pending'].includes(view.band) ? view.band : null

  let rows = pipeline.slice().sort((x, y) => num(y) - num(x))
  if (band === 'pending') rows = rows.filter((r) => !isEvaluated(r))
  else if (band) rows = rows.filter((r) => isEvaluated(r) && r.band === band)
  const shown = rows.slice(0, 100)

  const countCard = (key, label, c) =>
    `<a class="count ${band === key ? 'on' : ''}" href="?band=${key}" style="--c:${c}"><b>${a.counts[key] || 0}</b><span>${esc(label)}</span></a>`

  const dv = (s) => esc(String(s == null ? '' : s).toLowerCase())
  const pipeBody = shown.length
    ? shown
        .map((r) => {
          const ev = isEvaluated(r)
          const score = ev ? num(r).toFixed(1) : '—'
          const bn = ev ? t('bands.' + r.band) : t('tui.pending')
          const c = ev ? BAND_HEX[r.band] : BAND_HEX.pending
          return `<tr><td class="sc" style="color:${c}" data-v="${ev ? num(r).toFixed(1) : -1}">${esc(score)}</td><td data-v="${ev ? BAND_RANK[r.band] || 0 : 0}"><span class="pill2" style="--c:${c}">${esc(bn)}</span></td><td data-v="${dv(r.role)}">${esc(r.role)}</td><td data-v="${dv(r.company)}">${esc(r.company)}</td><td class="muted" data-v="${dv(r.location)}">${esc(r.location)}</td></tr>`
        })
        .join('')
    : `<tr><td colspan="5" class="muted">${esc(pipeline.length ? t('tui.none_match') : t('tui.empty'))}</td></tr>`

  const trackerBody = tracker.length
    ? tracker
        .map((r) => `<tr><td>${esc(r.company)}</td><td>${esc(r.role)}</td><td>${esc(stateLabel(resolveState(r.state) || r.state, lang))}</td><td class="muted">${esc(r.updated)}</td></tr>`)
        .join('')
    : `<tr><td colspan="4" class="muted">${esc(t('tracker.empty'))}</td></tr>`

  const funnelLabels = {
    discovered: t('dashboard.funnel_discovered'),
    evaluated: t('dashboard.funnel_evaluated'),
    applytier: t('dashboard.funnel_applytier'),
    applied: t('dashboard.funnel_applied'),
  }
  const th = (label) => `<th>${esc(label)}<span class="ind"></span></th>`
  const empty = `<div class="muted">${esc(t('tui.empty'))}</div>`

  return `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30"><title>Jobdar</title>
<style>
  a{color:#7aa2f7;text-decoration:none}a:hover{text-decoration:underline}
  body{font:15px/1.5 system-ui,-apple-system,sans-serif;margin:0;background:#0f1115;color:#e7e9ee}
  .wrap{max-width:960px;margin:0 auto;padding:32px 20px}
  h1{margin:0 0 6px;font-size:22px}
  .ctx{margin-bottom:18px}
  .pill{display:inline-block;background:#1b2230;border:1px solid #2b3344;border-radius:999px;padding:3px 11px;margin:0 6px 6px 0;font-size:13px;color:#aeb6c4}
  .cards{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
  .count{display:flex;flex-direction:column;align-items:center;min-width:84px;padding:10px 14px;background:#161922;border:1px solid #242a36;border-radius:10px;border-bottom:3px solid var(--c)}
  .count.on{background:#1b2230;box-shadow:0 0 0 1px var(--c)}
  .count b{font-size:22px;color:var(--c)}.count span{font-size:12px;color:#8b93a3}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  @media(max-width:720px){.grid{grid-template-columns:1fr}}
  .card{background:#161922;border:1px solid #242a36;border-radius:10px;padding:16px 18px;margin-bottom:18px}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#8b93a3;margin:0 0 12px}
  table{width:100%;border-collapse:collapse}
  th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #242a36;font-size:14px}
  th{color:#8b93a3;font-weight:600;font-size:11px;text-transform:uppercase}
  #pipe th{cursor:pointer;user-select:none}#pipe th:hover{color:#aeb6c4}.ind{color:#7aa2f7}
  .muted{color:#6f7787}.sc{font-variant-numeric:tabular-nums;font-weight:600}
  .pill2{font-size:11px;color:var(--c);border:1px solid var(--c);border-radius:999px;padding:1px 8px}
  .legend{font-size:11px;color:#8b93a3;margin-top:8px}.legend i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 4px 0 10px;vertical-align:middle}
  .stat{font-size:12px;color:#8b93a3;margin:0 0 10px}
</style></head><body><div class="wrap">
  <h1>${esc(t('dashboard.title'))}</h1>
  <div class="ctx">
    <span class="pill">${esc(t('dashboard.region'))}: ${esc(regions)}</span>
    <span class="pill">${esc(t('dashboard.level'))}: ${esc(levels)}</span>
    <span class="pill">${esc(t('dashboard.language'))}: ${esc(lang)}</span>
    ${profile.name ? `<span class="pill">${esc(profile.name)}</span>` : ''}
  </div>

  <div class="cards">
    ${countCard('apply', t('bands.apply'), BAND_HEX.apply)}
    ${countCard('research', t('bands.research'), BAND_HEX.research)}
    ${countCard('dont', t('bands.dont'), BAND_HEX.dont)}
    ${countCard('pending', t('tui.pending'), BAND_HEX.pending)}
    <a class="count ${!band ? 'on' : ''}" href="?" style="--c:#8b93a3"><b>${a.total}</b><span>${esc(t('dashboard.all'))}</span></a>
  </div>

  <h2>${esc(t('dashboard.analytics'))}</h2>
  <p class="stat">${esc(t('dashboard.stat_summary', { evaluated: a.evaluated, total: a.total, avg: a.avgScore.toFixed(1) }))}</p>
  <div class="grid">
    <div class="card"><h2>${esc(t('dashboard.chart_bands'))}</h2>${stackedBar(a.counts, a.total) || empty}
      <div class="legend"><i style="background:${BAND_HEX.apply}"></i>${esc(t('bands.apply'))}<i style="background:${BAND_HEX.research}"></i>${esc(t('bands.research'))}<i style="background:${BAND_HEX.dont}"></i>${esc(t('bands.dont'))}<i style="background:${BAND_HEX.pending}"></i>${esc(t('tui.pending'))}</div>
    </div>
    <div class="card"><h2>${esc(t('dashboard.chart_funnel'))}</h2>${funnelChart(a.funnel, funnelLabels)}</div>
    <div class="card"><h2>${esc(t('dashboard.chart_scores'))}</h2>${a.evaluated ? scoreHistogram(a.bins) : `<div class="muted">${esc(t('dashboard.no_eval'))}</div>`}</div>
    <div class="card"><h2>${esc(t('dashboard.chart_companies'))}</h2>${hBarChart(a.topCompanies) || empty}</div>
    <div class="card"><h2>${esc(t('dashboard.chart_sectors'))}</h2>${hBarChart(a.sectors) || empty}</div>
    <div class="card"><h2>${esc(t('dashboard.chart_locations'))}</h2>${hBarChart(a.locations) || empty}</div>
  </div>

  <div class="card"><h2>${esc(t('dashboard.pipeline'))}${band ? ` · ${esc(band === 'pending' ? t('tui.pending') : t('bands.' + band))}` : ''} (${rows.length})</h2>
    <table id="pipe"><thead><tr>
      ${th(t('tui.col_score'))}${th(t('tui.col_band'))}${th(t('tui.col_role'))}${th(t('tui.col_company'))}${th(t('tui.col_location'))}
    </tr></thead><tbody>${pipeBody}</tbody></table>
    ${rows.length > shown.length ? `<div class="muted" style="margin-top:8px">… +${rows.length - shown.length} more</div>` : ''}
  </div>

  <div class="card"><h2>${esc(t('dashboard.tracker'))}</h2>
    <table><thead><tr>
      <th>${esc(t('tracker.col_company'))}</th><th>${esc(t('tracker.col_role'))}</th>
      <th>${esc(t('tracker.col_state'))}</th><th>${esc(t('tracker.col_updated'))}</th>
    </tr></thead><tbody>${trackerBody}</tbody></table>
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
  <footer class="muted" style="font-size:12px;margin-top:22px">${esc(t('dashboard.footer'))}<br>${esc(t('dashboard.access'))}</footer>
</div>${SORT_SCRIPT}</body></html>`
}

export async function runDashboard(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const lang = resolveLang(flags, profile)
  const t = getT(lang)
  const port = Number(flags.port) || 4319
  const catalog = loadEmployers()

  const server = createServer((req, res) => {
    let band = null
    try {
      band = new URL(req.url, 'http://localhost').searchParams.get('band')
    } catch {
      /* ignore */
    }
    const html = renderDashboard(t, {
      profile,
      portals: loadPortals(),
      pipeline: readPipeline(),
      tracker: readTrackerRows(),
      catalog,
      lang,
      view: { band },
    })
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
