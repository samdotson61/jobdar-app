// Jobdar — the inference backend client (Phase 8b). ONE tiny HTTP client covers both backends because
// both speak the Anthropic **Messages API**: winc.cpp's `winc serve --eval` serves `/v1/messages`
// natively on localhost (the DEFAULT — private, no key, no cost), and the user's BYO key hits
// api.anthropic.com (the opt-in accuracy upgrade). Only the base URL and the auth header differ.
//
// The deterministic CLI still never invents a score — this is the path the MODEL's eval runs over.
// 8a builds the full `eval --auto` UX on top of this exact client; 8b proves it end-to-end via the
// `jobdar backend` canary.

import { loadApiKey } from './config.mjs'
import { band } from './evaluations.mjs'

export const WINC_DEFAULT_URL = 'http://127.0.0.1:8080' // winc.toml default host:port
const ANTHROPIC_URL = 'https://api.anthropic.com'
const ANTHROPIC_VERSION = '2023-06-01'
// api eval model — overridable; 8a tunes this. Local (winc --eval) auto-picks 2B/4B, so no id needed.
const DEFAULT_API_MODEL = 'claude-sonnet-4-6'

// Local runtimes behind the same interface (8b.3). winc speaks the Anthropic Messages API natively;
// Ollama and llamafile speak the OpenAI chat-completions API, so one OpenAI→verdict shim covers both.
// winc is the documented happy path; the others are for users who already run one. Each entry gives the
// wire protocol, the default localhost URL, and the liveness path (Ollama has no /health).
const RUNTIMES = {
  winc: { protocol: 'messages', url: 'http://127.0.0.1:8080', health: '/health' },
  ollama: { protocol: 'openai', url: 'http://127.0.0.1:11434', health: '/api/tags' },
  llamafile: { protocol: 'openai', url: 'http://127.0.0.1:8080', health: '/health' },
}
export const LOCAL_RUNTIMES = Object.keys(RUNTIMES)

const trimUrl = (u) => String(u || '').replace(/\/+$/, '')

// Only loopback may be hit without TLS — the local backend is the user's own machine, never a remote.
export function isLoopbackUrl(rawUrl) {
  try {
    const h = new URL(rawUrl).hostname.toLowerCase()
    return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]'
  } catch {
    return false
  }
}

// Resolve the configured backends from profile + env. Pure.
export function resolveBackend(profile = {}, env = process.env) {
  const mode = ['local', 'api', 'auto'].includes(profile.inference) ? profile.inference : 'local'
  const runtime = RUNTIMES[profile.inference_runtime] ? profile.inference_runtime : 'winc'
  const rt = RUNTIMES[runtime]
  const localUrl = trimUrl(profile.inference_url || env.JOBDAR_INFERENCE_URL || rt.url)
  const apiUrl = trimUrl(env.JOBDAR_API_URL || ANTHROPIC_URL)
  const apiModel = profile.api_model || env.JOBDAR_API_MODEL || DEFAULT_API_MODEL
  const localModel = profile.local_model || env.JOBDAR_LOCAL_MODEL || '' // winc ignores it (--eval auto-picks); ollama/llamafile need it
  return { mode, runtime, protocol: rt.protocol, healthPath: rt.health, localUrl, apiUrl, apiModel, localModel, apiKey: loadApiKey(env) }
}

// Probe a backend's health. winc proxies GET /health through to llama-server → 200 only when fully
// loaded. The api backend has no /health, so we treat a present key as "ready". Never throws.
export async function backendHealth(baseUrl, { timeoutMs = 2500, path = '/health' } = {}) {
  if (!isLoopbackUrl(baseUrl)) return false // the liveness probe is the local-server path only
  const url = `${trimUrl(baseUrl)}${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

// Pick the concrete backend to use right now. local → winc; api → cloud; auto → winc if healthy,
// else cloud when a key exists. Returns { kind, baseUrl, key, model, up, reason }.
export async function selectActive(profile = {}, env = process.env) {
  const r = resolveBackend(profile, env)
  const local = { kind: 'local', runtime: r.runtime, protocol: r.protocol, healthPath: r.healthPath, baseUrl: r.localUrl, key: '', model: r.localModel }
  const api = { kind: 'api', runtime: 'anthropic', protocol: 'messages', healthPath: null, baseUrl: r.apiUrl, key: r.apiKey, model: r.apiModel }
  // ollama/llamafile REQUIRE a model id and their liveness path (/api/tags) 200s even with zero models
  // pulled — so a running daemon with no model is NOT ready. winc auto-picks via --eval, so no model id.
  const needsModel = r.protocol === 'openai' && !r.localModel
  const daemonUp = () => backendHealth(r.localUrl, { path: r.healthPath })
  if (r.mode === 'api') return { ...api, up: Boolean(r.apiKey), reason: r.apiKey ? 'api key present (unverified — run `jobdar backend --check`)' : 'no api key in data/credentials.env' }
  if (r.mode === 'auto') {
    if ((await daemonUp()) && !needsModel) return { ...local, up: true, reason: `auto → local (${r.runtime} up)` }
    if (r.apiKey) return { ...api, up: true, reason: 'auto → api (local not ready, key present but unverified)' }
    return { ...local, up: false, reason: `auto → local (${r.runtime} ${needsModel ? 'has no model' : 'down'}, no api key)` }
  }
  const daemon = await daemonUp()
  const reason = !daemon ? `local (${r.runtime} down)` : needsModel ? `local (${r.runtime} running but no model — set local_model + pull it)` : `local (${r.runtime} up)`
  return { ...local, up: daemon && !needsModel, reason }
}

// Low-level Messages-API call. `active` = a selectActive() result. Returns { text, usage, model }.
export async function callMessages(active, { system, user, maxTokens = 1024, timeoutMs = 120000, cache = false }) {
  const url = `${trimUrl(active.baseUrl)}/v1/messages`
  if (active.kind === 'api' && new URL(url).protocol !== 'https:') throw new Error(`Refusing non-HTTPS API URL: ${url}`)
  if (active.kind === 'local' && !isLoopbackUrl(active.baseUrl)) throw new Error(`Local backend must be loopback, got: ${active.baseUrl}`)
  if (active.kind === 'api' && !active.key) throw new Error('No API key — set one with `jobdar init` (saved to data/credentials.env) or JOBDAR_API_KEY')

  const headers = { 'content-type': 'application/json' }
  if (active.key) {
    headers['x-api-key'] = active.key
    headers['anthropic-version'] = ANTHROPIC_VERSION
  }
  const body = { model: active.model || 'local', max_tokens: maxTokens, messages: [{ role: 'user', content: user }] }
  // 8a.8: prompt-cache the byte-stable rubric prefix on the api backend (~0.1× input price after the
  // first call, 5-min TTL a paced sequential queue keeps warm). Local winc takes a plain system string.
  if (system) body.system = cache && active.kind === 'api' ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : system

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal })
  } catch (e) {
    throw new Error(`${active.kind} backend unreachable at ${url}: ${e.message}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 300) } catch {}
    throw new Error(`${active.kind} backend HTTP ${res.status} at ${url}${detail ? ` — ${detail}` : ''}`)
  }
  const data = await res.json()
  // Messages API: content is an array of blocks; concatenate the text blocks.
  const text = Array.isArray(data.content)
    ? data.content.filter((b) => b && b.type === 'text').map((b) => b.text).join('')
    : typeof data.content === 'string' ? data.content : '' // never stringify an object to "[object Object]"
  return { text, usage: data.usage || null, model: data.model || active.model || '' }
}

// OpenAI chat-completions shim (8b.3) for Ollama / llamafile. Same loopback guard as the local
// Messages path; maps the OpenAI usage block back to the Messages shape so callers stay uniform.
export async function callOpenAI(active, { system, user, maxTokens = 1024, timeoutMs = 120000, responseFormat = null }) {
  if (!isLoopbackUrl(active.baseUrl)) throw new Error(`Local backend must be loopback, got: ${active.baseUrl}`)
  const url = `${trimUrl(active.baseUrl)}/v1/chat/completions`
  const headers = { 'content-type': 'application/json' }
  if (active.key) headers.authorization = `Bearer ${active.key}`
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: user })
  const body = { model: active.model || 'local', max_tokens: maxTokens, messages, stream: false }
  if (responseFormat) body.response_format = responseFormat // 8a.4a: guaranteed-JSON when the backend supports it (winc-jobdar.4)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal })
  } catch (e) {
    throw new Error(`${active.runtime || 'local'} backend unreachable at ${url}: ${e.message}`)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 300) } catch {}
    throw new Error(`${active.runtime || 'local'} backend HTTP ${res.status} at ${url}${detail ? ` — ${detail}` : ''}`)
  }
  const data = await res.json()
  const choice = data && Array.isArray(data.choices) ? data.choices[0] : null
  const text = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : ''
  const u = data && data.usage
  return { text, usage: u ? { input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0 } : null, model: (data && data.model) || active.model || '' }
}

// Dispatch to the right wire protocol for the active backend (winc/api → Messages, ollama/llamafile → OpenAI).
export function callBackend(active, opts) {
  return active && active.protocol === 'openai' ? callOpenAI(active, opts) : callMessages(active, opts)
}

// 8a.7: submit a Message Batches job (api backend only — 50% of standard price), poll to completion,
// and return the raw per-request results. Pair with eval_ops.buildBatchRequests / parseBatchResults.
export async function submitBatch(active, requests, { pollMs = 10000, maxWaitMs = 1800000, onPoll = null } = {}) {
  if (active.kind !== 'api') throw new Error('Batches require the api backend (BYO key)')
  if (!active.key) throw new Error('No API key for the Batches API')
  const base = trimUrl(active.baseUrl)
  const headers = { 'content-type': 'application/json', 'x-api-key': active.key, 'anthropic-version': ANTHROPIC_VERSION }
  const okJson = async (res, what) => {
    if (!res.ok) throw new Error(`Batch ${what} HTTP ${res.status}`)
    return res.json()
  }
  const create = await okJson(await fetch(`${base}/v1/messages/batches`, { method: 'POST', headers, body: JSON.stringify({ requests }) }), 'create')
  if (!create || !create.id) throw new Error(`Batch create failed: ${JSON.stringify(create).slice(0, 200)}`)
  const started = Date.now()
  let status = create
  while (status.processing_status !== 'ended') {
    if (Date.now() - started > maxWaitMs) throw new Error(`Batch ${create.id} did not finish within the wait window`)
    if (onPoll) onPoll(status)
    await new Promise((r) => setTimeout(r, pollMs))
    status = await okJson(await fetch(`${base}/v1/messages/batches/${create.id}`, { headers }), 'poll')
  }
  if (!status.results_url) throw new Error(`Batch ${create.id} ended with no results_url`)
  const rres = await fetch(status.results_url, { headers })
  if (!rres.ok) throw new Error(`Batch results HTTP ${rres.status}`)
  const body = await rres.text()
  return body.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
}

// Parse the modes/eval.md output format into a structured verdict. The model writes prose; code reads
// the score + (optional) band tag from the SAME "Fit score: N.N (Band)" line — never letting preamble
// or recommendation prose ("don't rule it out…", "research the salary then apply") hijack the band.
// A number outside 0–5 means the model drifted off the rubric → treat as unparsed (null), not a
// confidently-wrong clamp. When no tag is present, band is derived from the score via evaluations.band().
export function parseVerdict(text) {
  const s = String(text || '')
  const TAG = String.raw`\s*(?:\(\s*(apply|research|don['’]?t|dont)\s*\))?` // tolerate a curly apostrophe
  const m = s.match(new RegExp(`fit\\s*score\\s*[:=]?\\s*(\\d+(?:\\.\\d+)?)${TAG}`, 'i')) ||
            s.match(new RegExp(`\\bscore\\s*[:=]\\s*(\\d+(?:\\.\\d+)?)${TAG}`, 'i'))
  let score = null
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 0 && n <= 5) score = Math.round(n * 10) / 10
  }
  let bnd = m && m[2] ? m[2].toLowerCase().replace(/don['’]t/, 'dont') : ''
  if (!bnd && score != null) bnd = band(score)
  const recM = s.match(/recommendation\s*[:=]\s*(.+)/i)
  const recommendation = recM ? recM[1].trim().slice(0, 200) : ''
  return { score, band: bnd, recommendation }
}

// The eval system prompt — compact on purpose so small local models (2B/4B) stay on-format.
export const EVAL_SYSTEM =
  "You are Jobdar, scoring how well one job fits a candidate's résumé for a new grad / early-career " +
  'job seeker. Read the job description against the résumé and reply in EXACTLY this format, nothing else:\n' +
  'Fit score: <0.0-5.0> (<Apply|Research|Don\'t>)\n' +
  'Recommendation: <one line>\n\n' +
  'Bands: 4.0-5.0 = Apply, 3.5-3.9 = Research, below 3.5 = Don\'t. Be honest; never invent experience.'

// Run one evaluation end-to-end against the active backend. Returns the parsed verdict plus usage.
export async function evaluate({ active, jd, cv = '', today = '', maxTokens = 512, timeoutMs = 120000 }) {
  const user =
    (today ? `Today's date is ${today}.\n\n` : '') +
    `Candidate résumé:\n${String(cv || '(none provided)').slice(0, 6000)}\n\n` +
    `Job description:\n${String(jd || '').slice(0, 6000)}`
  const { text, usage, model } = await callBackend(active, { system: EVAL_SYSTEM, user, maxTokens, timeoutMs })
  return { ...parseVerdict(text), usage, model, backend: active.kind, runtime: active.runtime, raw: text }
}
