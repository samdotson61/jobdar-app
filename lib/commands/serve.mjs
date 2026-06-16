// Jobdar — `jobdar serve` (Phase 8e.2 → 9.1). The local HTTP façade over the engine contract
// (lib/engine.mjs): the WHOLE pipeline as JSON endpoints on one socket, so the web/desktop/mobile GUIs
// are thin callers — the CLI + winc do all the work (scan, prescreen, the real-model eval, tracking).
//
// Default bind is loopback (127.0.0.1) — a private desktop companion. CORS is reflected only for
// private/loopback/LAN origins (a public website the user has open can't read responses). Pass
// `--host 0.0.0.0` to reach it from a phone on the same Wi-Fi; that flips on a REQUIRED bearer token
// (auto-generated and printed, or `--token <x>`), so opening the LAN is a deliberate, gated act.
//
// Endpoints (all JSON; model endpoints 503 {reason} when the backend is down):
//   GET  /health                          backend + engine version
//   GET  /pipeline[?status=|?pending=true] the pipeline rows (the table the GUI renders)
//   GET  /profile                          the real config/profile.yml (secrets redacted)
//   GET  /cv                               the real data/cv.md
//   POST /cv          {content}                        persist the GUI's résumé to data/cv.md
//   GET  /outreach/due                     follow-ups ripe today (the real ledger)
//   POST /search/parse {intent}                        free-text → {titles,keywords,exclude,level?,regions?}
//   POST /discover    {intent,regions?,levels?}        winc-suggest companies → probe ATS → add verified boards
//   POST /scan        {company?,levels?,regions?}      live discovery → persists scanned rows
//   POST /prescreen   {limit?,company?,terms?}         zero-token gate + rank (intent-relevant first)
//   POST /evaluate    {jd,cv?,confirm?,transferable?}  one-off real-model score (no persist)
//   POST /eval/next   {includeScreened?}               next best pending role + its JD
//   POST /eval/save   {url,score,band?,recommendation?,…}  persist a verdict (status→evaluated)
//   POST /tracker/set {url,status}                     advance the funnel (applied/interviewing/…)
//   POST /outreach/log {url,person,kind,…}             cadence-checked ledger write
//   POST /import      {file}                            extract+structure a résumé (server-side path, confined)
//   POST /import/upload {name,base64}                   parse an UPLOADED résumé's bytes (docx/pdf/txt) → cv
// (POST /tailor + /outreach/draft — the model-generation verbs — land in the next increment.)

import http from 'node:http'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { loadProfile, loadCv, loadPortals, savePortals, paths, atomicWrite } from '../config.mjs'
import { resolveState } from '../states.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectActive, evaluate, tailor, importDocument, resolveBackend, backendHealth, ENGINE_VERSION } from '../engine.mjs'
import { wincVersion } from './backend.mjs'
import { resolveProvider, fetchJobDescription } from '../../providers/_contract.mjs'
import { filterByLevel } from '../levels.mjs'
import { filterByLocation } from '../regions.mjs'
import { prescreenRole, reasonLine } from '../prescreen.mjs'
import { parseIntent, relevanceScore } from '../search.mjs'
import { discoverCompanies } from '../discover.mjs'
import { paySummary } from '../salary.mjs'
import {
  readPipeline, pendingQueue, isEvaluated, isTracked,
  upsertScanned, upsertPrescreen, upsertPrescreenMany, upsertEval, updateStatusByUrl,
} from '../evaluations.mjs'
import { draftOutreach, readOutreach, appendOutreach, canContact, canFollowup, dueFollowups } from '../outreach.mjs'
import { color, heading } from '../ui.mjs'

const today = () => new Date().toISOString().slice(0, 10)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Abandon a hung promise after ms so one slow company board can't stall the whole scan wave.
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))])
const lanIp = () => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces || []) if (i.family === 'IPv4' && !i.internal) return i.address
  }
  return null
}
// constant-time token compare (avoids a timing side-channel on the LAN token)
const tokenEq = (a, b) => {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b))
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb)
}

export async function runServe(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  const port = Number(flags.port) > 0 ? Number(flags.port) : 4320
  const host = flags.host ? String(flags.host) : '127.0.0.1'
  const isLoopback = host === '127.0.0.1' || host === 'localhost'
  // Non-loopback bind ⇒ a token is mandatory: use --token, else mint one and print it. Loopback stays open.
  const token = flags.token ? String(flags.token) : isLoopback ? '' : crypto.randomBytes(16).toString('hex')
  const backend = resolveBackend(profile) // winc URL + health path, independent of the inference mode
  let starting = false // true while a winc autostart (setup → serve) is in flight
  heading(t('serve.title'))

  // CORS is reflected ONLY for private/loopback/LAN origins (the GUI is served from a different port —
  // 8081 dev / 8799 static — than serve, and on the phone from the Mac's LAN IP). A public website the
  // user happens to have open is NOT reflected, so the browser's same-origin policy blocks it from reading
  // any response (résumé/profile/pipeline) — the fix for the reflective-CORS drive-by.
  const originAllowed = (origin) => {
    if (!origin) return false
    try {
      const h = new URL(origin).hostname.toLowerCase().replace(/^\[|\]$/g, '')
      if (h === 'localhost' || h.endsWith('.localhost') || h === '::1') return true
      if (/^127\./.test(h)) return true
      if (/^10\./.test(h) || /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
      if (/^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true
      return false
    } catch { return false }
  }
  const cors = (req) => {
    const h = {
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      vary: 'origin',
    }
    const origin = req.headers.origin
    if (originAllowed(origin)) h['access-control-allow-origin'] = origin
    return h
  }
  const send = (res, code, obj, req) => {
    res.writeHead(code, { 'content-type': 'application/json', ...cors(req) })
    res.end(JSON.stringify(obj))
  }
  // Cap the body (a malicious loopback page could otherwise OOM the process) and settle the Promise on a
  // mid-stream abort/error so an awaiting handler never hangs forever.
  const MAX_BODY = 2_000_000
  const readBody = (req) =>
    new Promise((resolve) => {
      let b = ''
      let done = false
      const finish = (v) => { if (!done) { done = true; resolve(v) } }
      req.on('data', (d) => {
        if (done) return
        b += d
        if (b.length > MAX_BODY) { req.destroy(); finish({}) }
      })
      req.on('end', () => { try { finish(JSON.parse(b || '{}')) } catch { finish({}) } })
      req.on('error', () => finish({}))
    })
  // Confine a client-supplied import path to the jobdar data home — never readFileSync an arbitrary path
  // (would otherwise expose ~/.ssh, ~/.aws, etc. over HTTP).
  const withinHome = (f) => {
    try {
      const resolved = path.resolve(String(f || ''))
      const base = path.resolve(paths.home)
      return resolved === base || resolved.startsWith(base + path.sep)
    } catch { return false }
  }
  const authed = (req, u) => {
    if (!token) return true
    const h = req.headers['authorization'] || ''
    const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
    if (bearer && tokenEq(bearer, token)) return true
    const qp = u.searchParams.get('token') || ''
    return Boolean(qp) && tokenEq(qp, token)
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost')
    const path = u.pathname
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {}, req)
      if (!authed(req, u)) return send(res, 401, { error: 'unauthorized', hint: 'pass ?token=… or Authorization: Bearer …' }, req)

      // ── reads ────────────────────────────────────────────────────────────
      if (req.method === 'GET' && path === '/health') {
        const a = await selectActive(profile)
        return send(res, 200, { ok: true, engine: ENGINE_VERSION, backend: { kind: a.kind, runtime: a.runtime, up: a.up } }, req)
      }
      if (req.method === 'GET' && path === '/backend') {
        const winc = wincVersion()
        const localUp = await backendHealth(backend.localUrl, { path: backend.healthPath })
        const a = await selectActive(profile)
        return send(res, 200, { installed: Boolean(winc), version: winc ? winc.version : null, localUp, activeKind: a.kind, activeUp: a.up, reason: a.reason, starting }, req)
      }
      if (req.method === 'GET' && path === '/pipeline') {
        const rows = readPipeline()
        if (u.searchParams.get('pending') === 'true') {
          const q = pendingQueue(rows, { includeScreened: u.searchParams.get('includeScreened') === 'true' })
          return send(res, 200, { rows: q, count: q.length }, req)
        }
        const status = u.searchParams.get('status')
        const out = status ? rows.filter((r) => r.status === status) : rows
        return send(res, 200, { rows: out, count: out.length }, req)
      }
      if (req.method === 'GET' && path === '/profile') {
        const p = loadProfile()
        // secrets NEVER leave: no api key, no inference_url/local_model (device-specific implementation).
        return send(res, 200, {
          name: p.name, language: p.language, location: p.location,
          target_regions: p.target_regions, target_levels: p.target_levels,
          tuning_profile: p.tuning_profile, include_degree_required_roles: p.include_degree_required_roles,
          transferable_skills: p.transferable_skills, target_salary: p.target_salary,
          score_weights: p.score_weights, inference: p.inference,
          inference_runtime: p.inference_runtime, eval_grammar: p.eval_grammar,
        }, req)
      }
      if (req.method === 'GET' && path === '/cv') {
        const cv = loadCv()
        return send(res, 200, { content: cv, loaded: cv.length > 0 }, req)
      }
      // The GUI's uploaded/edited résumé is persisted here (data/cv.md) so scan/prescreen/eval all judge
      // against the SAME text the user sees — without it, the app scored against a stale on-disk résumé.
      if (req.method === 'POST' && path === '/cv') {
        const p = await readBody(req)
        if (typeof p.content !== 'string') return send(res, 400, { ok: false, error: 'content (string) required' }, req)
        mkdirSync(paths.dataDir, { recursive: true })
        atomicWrite(paths.cv, p.content)
        return send(res, 200, { ok: true, length: p.content.length }, req)
      }
      if (req.method === 'GET' && path === '/outreach/due') {
        const { due, closed } = dueFollowups(readOutreach(), today())
        return send(res, 200, { due, closed }, req)
      }

      // ── intelligent discovery — winc suggests companies → probe ATS slugs → keep verified boards ──
      if (req.method === 'POST' && path === '/discover') {
        const p = await readBody(req)
        const a = await selectActive(profile)
        if (!a.up) return send(res, 200, { ok: false, reason: a.reason || 'discovery needs the local model (winc) — start the backend' }, req)
        const levels = Array.isArray(p.levels) && p.levels.length ? p.levels : profile.target_levels
        const regions = Array.isArray(p.regions) && p.regions.length ? p.regions : profile.target_regions
        const intentTerms = await parseIntent({ active: a, intent: String(p.intent || '') })
        const existing = new Set(loadPortals().map((x) => String(x.careers_url || '').toLowerCase()))
        const { suggested, portals, jobs } = await discoverCompanies({ active: a, intent: String(p.intent || ''), titles: intentTerms.titles, regions, existingUrls: existing, ctx: { render: false, lang: profile.language } })
        if (portals.length) savePortals([...loadPortals(), ...portals]) // add the verified boards to the seed
        const lvl = filterByLevel(jobs, levels)
        const loc = filterByLocation(lvl.kept, regions, { userMetro: profile.location })
        if (loc.kept.length) upsertScanned(loc.kept, today())
        return send(res, 200, { ok: true, suggested, added: portals.length, companies: portals.map((x) => x.company), found: loc.kept.length, rows: readPipeline() }, req)
      }

      // ── intent parse (winc when up, else deterministic keywords — never 503s, search must always work) ──
      if (req.method === 'POST' && path === '/search/parse') {
        const p = await readBody(req)
        const a = await selectActive(profile)
        const terms = await parseIntent({ active: a, intent: String(p.intent || '') })
        return send(res, 200, { ok: true, ...terms }, req)
      }

      // ── discovery ────────────────────────────────────────────────────────
      if (req.method === 'POST' && path === '/scan') {
        const p = await readBody(req)
        const levels = Array.isArray(p.levels) && p.levels.length ? p.levels : profile.target_levels
        const regions = Array.isArray(p.regions) && p.regions.length ? p.regions : profile.target_regions
        const ctx = { render: false, lang: profile.language }
        let portals = loadPortals()
        const cf = typeof p.company === 'string' ? p.company.toLowerCase() : null
        if (cf) portals = portals.filter((x) => (x.company || '').toLowerCase().includes(cf))
        // mirrors scan.mjs runScan: resolve a provider per portal, fetch, then the SAME level+region filters.
        const resolved = portals.map((portal) => ({ portal, hit: resolveProvider(portal) }))
        const kept = []
        let excludedLevel = 0, excludedRegion = 0
        const queue = resolved.slice()
        const scanOne = async ({ hit }) => {
          if (!hit) return
          try {
            const jobs = await withTimeout(hit.provider.fetch(hit.match, ctx), 12000) // a slow board is skipped, not blocking
            const lvl = filterByLevel(jobs, levels)
            const loc = filterByLocation(lvl.kept, regions, { userMetro: profile.location })
            for (const j of loc.kept) kept.push(j)
            excludedLevel += lvl.excluded
            excludedRegion += loc.excluded
          } catch {
            /* a flaky board never fails the whole scan */
          }
        }
        const workers = Array.from({ length: Math.min(12, queue.length) }, async () => {
          while (queue.length) await scanOne(queue.shift())
        })
        await Promise.all(workers)
        if (kept.length) upsertScanned(kept, today())
        return send(res, 200, { ok: true, found: kept.length, excludedLevel, excludedRegion, portals: resolved.length, rows: readPipeline() }, req)
      }
      if (req.method === 'POST' && path === '/prescreen') {
        const p = await readBody(req)
        const cv = loadCv()
        const date = today()
        const limit = Number(p.limit) > 0 ? Number(p.limit) : 12
        // rescore=true re-runs the gate over ALREADY-scored rows too (a résumé re-upload changes skill
        // overlap, so the user's results should change); default only scores the not-yet-prescreened ones.
        const rescore = p.rescore === true
        let rows = readPipeline().filter((r) => r.url && !isEvaluated(r) && !isTracked(r) && (rescore || !String(r.prescreen || '').trim()))
        if (p.company) rows = rows.filter((r) => (r.company || '').toLowerCase().includes(String(p.company).toLowerCase()))
        // Intent-aware ordering: when the search carries parsed terms, spend the limited prescreen budget on
        // the roles that match what the user asked for first, and drop roles the intent explicitly excludes.
        const terms = p.terms && typeof p.terms === 'object' ? p.terms : null
        if (terms && ((terms.keywords && terms.keywords.length) || (terms.titles && terms.titles.length))) {
          rows = rows
            .map((r, i) => ({ r, i, rel: relevanceScore(`${r.role} ${r.company} ${r.location}`, terms) }))
            .filter((x) => x.rel >= 0) // an exclude-term hit (rel < 0) never gets prescreened
            .sort((a, b) => b.rel - a.rel || a.i - b.i)
            .map((x) => x.r)
        }
        rows = rows.slice(0, limit)
        // Fetch JDs CONCURRENTLY (a pool) and write the whole batch ONCE — the old one-at-a-time fetch with
        // a 200ms pause + a per-row pipeline rewrite was the search bottleneck. A pool of 6 stays polite
        // (most roles are on different hosts) and cuts a batch from ~tens of seconds to a couple.
        let screened = 0, ranked = 0
        const updates = []
        const queue = rows.slice()
        const prescreenOne = async () => {
          while (queue.length) {
            const row = queue.shift()
            let jdText = ''
            try {
              const jd = await fetchJobDescription(row.url)
              jdText = (jd && jd.description) || ''
            } catch {
              /* unreachable JD → neutral prescreen, never a crash */
            }
            const v = prescreenRole({ jdText, cvText: cv, title: row.role, posted: row.posted, firstSeen: row.first_seen, today: date, profile })
            // A role whose JD we couldn't fetch (expired/404) is UNASSESSABLE — skillPoints falls back to a
            // résumé-blind neutral 30, which would otherwise let an expired listing fake a "fit" for ANY
            // résumé. Flag it + floor the score so it sorts to the bottom instead of polluting the matches.
            const dead = !v.screened && !v.jdAvailable
            const reason = v.screened ? reasonLine(v.reasons, t) : dead ? 'listing expired — can’t assess fit' : ''
            const score = dead ? 8 : v.score
            const pay = paySummary(v.pay, Number(profile.target_salary) || 0)
            updates.push({ url: row.url, score, reason, pay })
            v.screened || dead ? screened++ : ranked++
          }
        }
        await Promise.all(Array.from({ length: Math.min(8, rows.length) }, prescreenOne))
        upsertPrescreenMany(updates, date)
        return send(res, 200, { ok: true, checked: rows.length, screened, ranked, rows: readPipeline() }, req)
      }

      // ── evaluate (real model) ──────────────────────────────────────────────
      if (req.method === 'POST' && path === '/evaluate') {
        const p = await readBody(req)
        const a = await selectActive(profile)
        if (!a.up) return send(res, 503, { error: 'backend not ready', reason: a.reason }, req)
        // The app sends a pipeline {url}; fetch its JD (like /tailor) so the eval has real text to judge.
        let jd = p.jd || ''
        if (!jd && p.url) {
          try {
            const d = await fetchJobDescription(p.url)
            jd = (d && d.description) || ''
          } catch {
            /* JD unreachable → eval falls back to title-only via the prompt */
          }
        }
        const v = await evaluate({ active: a, jd, cv: p.cv || loadCv(), profile, today: today(), confirm: Boolean(p.confirm), transferable: p.transferable })
        return send(res, 200, v, req)
      }
      if (req.method === 'POST' && path === '/eval/next') {
        const p = await readBody(req)
        const pending = pendingQueue(readPipeline(), { includeScreened: Boolean(p.includeScreened) })
        if (!pending.length) return send(res, 200, { done: true }, req)
        const row = pending[0]
        let jd = ''
        try {
          const d = await fetchJobDescription(row.url)
          jd = (d && d.description) || ''
        } catch {
          /* JD may be unreachable; the client still gets the row to score on title */
        }
        return send(res, 200, { url: row.url, jd, title: row.role, company: row.company, role: row.role, location: row.location, prescreen: row.prescreen }, req)
      }
      if (req.method === 'POST' && path === '/eval/save') {
        const p = await readBody(req)
        if (!p.url) return send(res, 400, { ok: false, error: 'url required' }, req)
        const score = Number(p.score)
        if (!Number.isFinite(score)) return send(res, 400, { ok: false, error: 'numeric score required' }, req)
        const rows = upsertEval({ url: p.url, score, band: p.band || '', company: p.company || '', role: p.role || '', location: p.location || '', recommendation: p.recommendation || '' }, today())
        return send(res, 200, { ok: true, row: rows.find((r) => r.url === p.url) || null }, req)
      }
      if (req.method === 'POST' && path === '/tracker/set') {
        const p = await readBody(req)
        if (!p.url || !p.status) return send(res, 400, { ok: false, error: 'url and status required' }, req)
        // Validate against the funnel taxonomy (mirrors `jobdar tracker`): an arbitrary status could demote
        // a row to 'scanned' and make it eligible for prune deletion, or corrupt the tracker view.
        const status = resolveState(p.status)
        if (!status) return send(res, 400, { ok: false, error: `unknown status: ${p.status}` }, req)
        const date = today()
        if (!updateStatusByUrl(p.url, status, date)) return send(res, 404, { ok: false, error: 'url not found in pipeline' }, req)
        return send(res, 200, { ok: true, url: p.url, status, updated: date }, req)
      }

      // ── outreach ledger (cadence-enforced; drafting verb lands next increment) ──
      if (req.method === 'POST' && path === '/outreach/log') {
        const p = await readBody(req)
        if (!p.url || !p.person) return send(res, 400, { ok: false, error: 'url and person required' }, req)
        const ledger = readOutreach()
        const kind = p.kind === 'followup' ? 'followup' : 'contact'
        const verdict = kind === 'followup'
          ? canFollowup(ledger, { url: p.url, person: p.person, today: today() })
          : canContact(ledger, { url: p.url, person: p.person })
        if (!verdict.ok) return send(res, 200, { ok: false, reason: verdict.reason }, req)
        const entry = { company: p.company || '', url: p.url, person: p.person, title: p.title || '', channel: p.channel || 'linkedin', kind, date: today(), note: p.note || '' }
        appendOutreach(entry)
        return send(res, 200, { ok: true, entry }, req)
      }

      // ── model generation (Apply "Customize" + Follow-up draft) — real model, 503 when winc is down ──
      if (req.method === 'POST' && (path === '/tailor' || path === '/outreach/draft')) {
        const p = await readBody(req)
        const a = await selectActive(profile)
        if (!a.up) return send(res, 503, { error: 'backend not ready', reason: a.reason }, req)
        const cv = typeof p.cv === 'string' && p.cv.trim() ? p.cv : loadCv()
        const row = p.url ? readPipeline().find((r) => r.url === p.url) : null
        const role = p.role || (row && row.role) || ''
        const company = p.company || (row && row.company) || ''
        const directives = Array.isArray(p.directives) ? p.directives : p.instruct ? [String(p.instruct)] : []
        let jd = p.jd || ''
        const url = p.url || (row && row.url) || ''
        if (!jd && url) {
          try {
            const d = await fetchJobDescription(url)
            jd = (d && d.description) || ''
          } catch {
            /* JD unreachable → the verb still grounds in the résumé + role/company */
          }
        }
        if (path === '/tailor') {
          const r = await tailor({ active: a, jd, cv, profile, role, company, directives })
          if (!r.ok) return send(res, 400, { ok: false, error: r.error || 'tailor failed' }, req)
          return send(res, 200, { ok: true, summary: r.summary, coverLetter: r.coverLetter, keywords: r.keywords, tailoredCv: r.tailoredCv }, req)
        }
        const r = await draftOutreach({ active: a, jd, cv, profile, role, company, person: p.person || '', channel: p.channel || 'linkedin', directives })
        if (!r.ok) return send(res, 400, { ok: false, error: r.error || 'draft failed' }, req)
        return send(res, 200, { ok: true, note: r.message, problems: (r.lint && r.lint.problems) || [] }, req)
      }

      // ── backend autostart — winc setup (downloads the recommended model) → serve, gated on confirm ──
      if (req.method === 'POST' && path === '/backend/start') {
        const p = await readBody(req)
        if (await backendHealth(backend.localUrl, { path: backend.healthPath })) return send(res, 200, { ok: true, up: true }, req)
        const winc = wincVersion()
        if (!winc) return send(res, 200, { ok: false, needsInstall: true, hint: t('backend.install_source') }, req)
        // The download is a few GB the first time — never start it without an explicit yes from the user.
        if (p.confirm !== true) return send(res, 200, { ok: false, needsConfirm: true, note: t('backend.setup_step') }, req)
        if (!starting) {
          starting = true
          // detached so it outlives this request. REQUIRES the winc-jobdar branch (the eval profile lives
          // there, not master): `winc serve --eval <model>` serves headless with the EVAL PROFILE —
          // reasoning off + greedy + guaranteed-JSON (response_format=json_schema) — per-serve, so it never
          // touches the user's global winc.toml reasoning mode. `-d` pre-downloads the eval-tier model
          // (qwen3.5-4b, ~2.6GB first run — the model the UI confirms). Tier sweep on a labeled set picked
          // 4b as the anchor: only tier that put a clear non-fit at Don't (PCB 1.3) AND a genuine fit at
          // Apply (PM 4.5); 2b is too flat (~3.4 for everything), e2b over-conservative (genuine fit→Don't).
          const model = 'qwen3.5-4b'
          const cmd = `"${winc.bin}" -d ${model} && "${winc.bin}" serve --eval ${model}`
          spawn('sh', ['-c', cmd], { detached: true, stdio: 'ignore' }).unref()
          const poll = setInterval(async () => {
            if (await backendHealth(backend.localUrl, { path: backend.healthPath })) { starting = false; clearInterval(poll) }
          }, 4000)
          setTimeout(() => { starting = false; clearInterval(poll) }, 15 * 60 * 1000).unref()
        }
        return send(res, 200, { ok: true, starting: true }, req)
      }

      // ── import ─────────────────────────────────────────────────────────────
      if (req.method === 'POST' && path === '/import') {
        const p = await readBody(req)
        if (!p.file || typeof p.file !== 'string') return send(res, 400, { ok: false, error: 'file (string) required' }, req)
        if (!withinHome(p.file)) return send(res, 403, { ok: false, error: 'file must be inside the jobdar data home' }, req)
        const a = await selectActive(profile)
        const r = await importDocument(p.file, { active: a })
        return send(res, r.ok ? 200 : 400, r, req)
      }
      // Upload + parse a résumé's BYTES (base64). The GUI can't hand serve a path inside its own sandbox, so
      // it sends the file contents; we write them to the confined uploads dir, run the SAME docparse extractor
      // (docx via unzip, pdf via pdftotext, txt/md direct), and persist the extracted text as the résumé.
      if (req.method === 'POST' && path === '/import/upload') {
        const p = await readBody(req)
        if (typeof p.base64 !== 'string' || !p.base64) return send(res, 400, { ok: false, error: 'base64 required' }, req)
        const safe = (String(p.name || 'resume').split(/[/\\]/).pop() || 'resume').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'resume'
        let buf
        try { buf = Buffer.from(p.base64, 'base64') } catch { return send(res, 400, { ok: false, error: 'bad base64' }, req) }
        // NOTE: `path` is shadowed here by the route pathname (const path = u.pathname) — build the file path
        // with string concat (safe is sanitized to [A-Za-z0-9._-], so no separators/traversal).
        const dir = `${paths.dataDir}/uploads`
        const dest = `${dir}/${safe}`
        mkdirSync(dir, { recursive: true })
        atomicWrite(dest, buf)
        const r = await importDocument(dest, { active: null }) // deterministic extract; no model call needed for the text
        if (!r.ok) return send(res, 400, { ok: false, error: r.error || 'could not read this file', ext: r.ext, name: safe }, req)
        atomicWrite(paths.cv, r.cv) // persist as the active résumé so scan/prescreen/eval judge against it
        return send(res, 200, { ok: true, name: safe, ext: r.ext, length: (r.cv || '').length, text: r.cv }, req)
      }

      return send(res, 404, { error: 'not found', path }, req)
    } catch (e) {
      send(res, 500, { error: e.message }, req)
    }
  })

  // Keep the process alive (the CLI router exits once runServe resolves) — resolve only on error.
  await new Promise((_, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      console.log(t('serve.up', { url: `http://${host}:${port}` }))
      if (token) {
        const ip = lanIp()
        if (ip && !isLoopback) console.log(color.dim(`  on your phone (same Wi-Fi): http://${ip}:${port}`))
        console.log(color.yellow(`  LAN access ON — token: ${token}`))
        console.log(color.dim('  send it as ?token=… or  Authorization: Bearer …'))
      }
      console.log(color.dim('  ' + t('serve.endpoints')))
      console.log(color.dim('  ' + t('serve.stop')))
    })
  })
}
