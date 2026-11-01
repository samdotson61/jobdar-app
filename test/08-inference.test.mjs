// Jobdar tests — Phase 8b: inference backend (winc.cpp local + api), all offline via a loopback mock server.
// Run with `npm test`; `npm test -- inference` runs only this file.

import { test } from './_harness.mjs'
import { mockBackend, mockOpenAI } from './_helpers.mjs'
import { strict as assert } from 'node:assert'
import path from 'node:path'
import http from 'node:http'
import { resolveBackend, isLoopbackUrl, selectActive, backendHealth, callMessages, callOpenAI, callBackend, WINC_DEFAULT_URL, LOCAL_RUNTIMES } from '../lib/inference.mjs'
import * as inferenceModule from '../lib/inference.mjs'

// --- Phase 8b: inference backend (winc.cpp local + api), all offline via a loopback mock server ---

test('inference: resolveBackend defaults to local winc, honors profile + env overrides', () => {
  const d = resolveBackend({}, {})
  assert.equal(d.mode, 'local')
  assert.equal(d.localUrl, WINC_DEFAULT_URL)
  assert.ok(d.apiModel && d.apiUrl.startsWith('https://'))
  assert.equal(resolveBackend({ inference: 'api' }, {}).mode, 'api')
  assert.equal(resolveBackend({ inference: 'bogus' }, {}).mode, 'local') // unknown → local
  assert.equal(resolveBackend({ inference_url: 'http://127.0.0.1:9000/' }, {}).localUrl, 'http://127.0.0.1:9000') // trailing slash trimmed
  assert.equal(resolveBackend({}, { JOBDAR_INFERENCE_URL: 'http://localhost:1234' }).localUrl, 'http://localhost:1234')
})

test('inference: isLoopbackUrl gates the no-TLS local path', () => {
  for (const u of ['http://127.0.0.1:8080', 'http://localhost:8080', 'http://[::1]:8080']) assert.ok(isLoopbackUrl(u), u)
  for (const u of ['https://api.anthropic.com', 'http://evil.example.com', 'not a url']) assert.ok(!isLoopbackUrl(u), u)
})

test('inference: the legacy holistic eval path stays removed (1.52.0)', () => {
  // parseVerdict/EVAL_SYSTEM/evaluate let the model emit the number directly — no gates, no clamp, no
  // PII strip, résumé defaulting to '(none provided)'. Every eval must go through lib/eval_engine.mjs;
  // this guard keeps the footgun from quietly coming back.
  assert.equal(inferenceModule.parseVerdict, undefined)
  assert.equal(inferenceModule.EVAL_SYSTEM, undefined)
  assert.equal(inferenceModule.evaluate, undefined)
})

test('inference: backendHealth — loopback up is true, closed port false, non-loopback false', async () => {
  const m = await mockBackend()
  assert.equal(await backendHealth(m.url), true)
  await m.close()
  assert.equal(await backendHealth(m.url, { timeoutMs: 500 }), false) // server closed
  assert.equal(await backendHealth('https://api.anthropic.com'), false) // not loopback → not probed
})

test('inference: selectActive resolves local/api/auto; auto falls back to api when winc is down', async () => {
  const m = await mockBackend()
  const localProfile = { inference: 'local', inference_url: m.url }
  const up = await selectActive(localProfile)
  assert.equal(up.kind, 'local')
  assert.equal(up.up, true)
  assert.equal(up.jsonEval, true) // local backends serve guaranteed-JSON evals
  const prevKey = process.env.JOBDAR_API_KEY
  process.env.JOBDAR_API_KEY = 'sk-test'
  try {
    const api = await selectActive({ inference: 'api' })
    assert.equal(api.kind, 'api')
    assert.equal(api.up, true)
    assert.equal(api.jsonEval, false) // Anthropic api is Messages-only (no /v1/chat/completions)
    const auto = await selectActive({ inference: 'auto', inference_url: m.url })
    assert.equal(auto.kind, 'local') // winc up → auto picks local
    await m.close()
    const autoDown = await selectActive({ inference: 'auto', inference_url: m.url })
    assert.equal(autoDown.kind, 'api') // winc down + key → auto picks api
  } finally {
    if (prevKey === undefined) delete process.env.JOBDAR_API_KEY
    else process.env.JOBDAR_API_KEY = prevKey
  }
})

test('inference: callMessages completes a round-trip against a mock backend', async () => {
  const m = await mockBackend()
  const active = { kind: 'local', baseUrl: m.url, key: '', model: '' }
  const r = await callMessages(active, { system: 'sys', user: 'hi', maxTokens: 64 })
  assert.ok(r.text.includes('Fit score'))
  assert.deepEqual(r.usage, { input_tokens: 40, output_tokens: 12 })
  await m.close()
})

test('inference: 8b.3 runtime resolution — winc (Messages) default, ollama/llamafile (OpenAI) shims', () => {
  assert.deepEqual(LOCAL_RUNTIMES, ['winc', 'ollama', 'llamafile'])
  const w = resolveBackend({}, {})
  assert.equal(w.runtime, 'winc'); assert.equal(w.protocol, 'messages'); assert.equal(w.healthPath, '/health')
  const o = resolveBackend({ inference_runtime: 'ollama' }, {})
  assert.equal(o.protocol, 'openai'); assert.equal(o.localUrl, 'http://127.0.0.1:11434'); assert.equal(o.healthPath, '/api/tags')
  assert.equal(resolveBackend({ inference_runtime: 'llamafile' }, {}).localUrl, 'http://127.0.0.1:8080')
  assert.equal(resolveBackend({ inference_runtime: 'bogus' }, {}).runtime, 'winc') // unknown → winc
  assert.equal(resolveBackend({ local_model: 'qwen2.5' }, {}).localModel, 'qwen2.5')
})

test('inference: 8b.3 OpenAI-compat shim — health, selectActive, and an eval round-trip (mock ollama)', async () => {
  const m = await mockOpenAI()
  const profile = { inference: 'local', inference_runtime: 'ollama', inference_url: m.url, local_model: 'qwen2.5' }
  assert.equal(await backendHealth(m.url, { path: '/api/tags' }), true)
  const active = await selectActive(profile)
  assert.equal(active.protocol, 'openai'); assert.equal(active.up, true); assert.equal(active.model, 'qwen2.5')
  const r = await callOpenAI(active, { system: 's', user: 'u' })
  assert.ok(r.text.includes('Fit score'))
  assert.deepEqual(r.usage, { input_tokens: 30, output_tokens: 9 }) // OpenAI usage mapped to the Messages shape
  await m.close()
})

test('inference: 8b.3 callBackend routes by protocol; callOpenAI enforces the loopback guard', async () => {
  await assert.rejects(callOpenAI({ runtime: 'ollama', baseUrl: 'https://evil.example.com', key: 'k' }, { user: 'x' }), /loopback/)
  const mm = await mockBackend() // answers ONLY /v1/messages (+/health)
  const mo = await mockOpenAI() //  answers ONLY /v1/chat/completions (+/api/tags)
  const viaMessages = await callBackend({ kind: 'local', protocol: 'messages', baseUrl: mm.url }, { user: 'u' })
  assert.ok(viaMessages.text.includes('Fit score')) // routed to /v1/messages (would 404→throw if misrouted)
  const viaOpenAI = await callBackend({ kind: 'local', protocol: 'openai', runtime: 'ollama', baseUrl: mo.url, model: 'm' }, { user: 'u' })
  assert.ok(viaOpenAI.text.includes('Fit score')) // routed to /v1/chat/completions
  // low-end tuning: a responseFormat (guaranteed-JSON) call routes to /v1/chat/completions even on a
  // Messages backend (the winc JSON-eval path) — mo answers ONLY chat/completions, so a misroute 404→throws.
  const viaJson = await callBackend({ kind: 'local', protocol: 'messages', baseUrl: mo.url, model: 'm' }, { user: 'u', responseFormat: { type: 'json_schema', json_schema: { name: 'x', schema: {} } } })
  assert.ok(viaJson.text.includes('Fit score'))
  await mm.close(); await mo.close()
})

test('inference: selectActive marks an OpenAI runtime with no model NOT ready (ollama /api/tags 200s regardless)', async () => {
  const m = await mockOpenAI()
  const noModel = await selectActive({ inference: 'local', inference_runtime: 'ollama', inference_url: m.url }) // local_model blank
  assert.equal(noModel.up, false) // daemon up but no model → not ready
  assert.match(noModel.reason, /no model/)
  const withModel = await selectActive({ inference: 'local', inference_runtime: 'ollama', inference_url: m.url, local_model: 'qwen2.5' })
  assert.equal(withModel.up, true)
  await m.close()
})

test('inference: callMessages guards — api requires HTTPS + key; local requires loopback', async () => {
  await assert.rejects(callMessages({ kind: 'api', baseUrl: 'http://127.0.0.1:1', key: 'k' }, { user: 'x' }), /non-HTTPS/)
  await assert.rejects(callMessages({ kind: 'api', baseUrl: 'https://api.anthropic.com', key: '' }, { user: 'x' }), /No API key/)
  await assert.rejects(callMessages({ kind: 'local', baseUrl: 'http://evil.example.com', key: '' }, { user: 'x' }), /loopback/)
})
