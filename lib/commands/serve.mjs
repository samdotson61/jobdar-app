// Jobdar — `jobdar serve` (Phase 8e.2). The local HTTP façade over the engine contract (lib/engine.mjs):
// the same verbs as JSON endpoints on localhost, so a dev web front-end — or a phone on the LAN — talks
// to one socket. CORS locked to localhost; no secrets in responses; loopback bind only.

import http from 'node:http'
import { loadProfile, loadCv } from '../config.mjs'
import { getT } from '../i18n.mjs'
import { parseFlags, resolveLang } from '../cli.mjs'
import { selectActive, evaluate, importDocument, ENGINE_VERSION } from '../engine.mjs'
import { color, heading } from '../ui.mjs'

export async function runServe(argv = []) {
  const { flags } = parseFlags(argv)
  const profile = loadProfile()
  const t = getT(resolveLang(flags, profile))
  const port = Number(flags.port) > 0 ? Number(flags.port) : 4320
  const host = '127.0.0.1'
  heading(t('serve.title'))

  const send = (res, code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': `http://localhost:${port}`, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' })
    res.end(JSON.stringify(obj))
  }
  const readBody = (req) =>
    new Promise((resolve) => {
      let b = ''
      req.on('data', (d) => (b += d))
      req.on('end', () => {
        try {
          resolve(JSON.parse(b || '{}'))
        } catch {
          resolve({})
        }
      })
    })

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204, {})
      const today = new Date().toISOString().slice(0, 10)
      if (req.url === '/health') {
        const a = await selectActive(profile)
        return send(res, 200, { ok: true, engine: ENGINE_VERSION, backend: { kind: a.kind, runtime: a.runtime, up: a.up } })
      }
      if (req.method === 'POST' && req.url === '/evaluate') {
        const p = await readBody(req)
        const a = await selectActive(profile)
        if (!a.up) return send(res, 503, { error: 'backend not ready', reason: a.reason })
        const v = await evaluate({ active: a, jd: p.jd || '', cv: p.cv || loadCv(), profile, today, confirm: Boolean(p.confirm) })
        return send(res, 200, v)
      }
      if (req.method === 'POST' && req.url === '/import') {
        const p = await readBody(req)
        const a = await selectActive(profile)
        const r = await importDocument(p.file, { active: a })
        return send(res, r.ok ? 200 : 400, r)
      }
      return send(res, 404, { error: 'not found' })
    } catch (e) {
      send(res, 500, { error: e.message })
    }
  })
  // Keep the process alive (the CLI router exits once runServe resolves) — resolve only on error.
  await new Promise((_, reject) => {
    server.on('error', reject)
    server.listen(port, host, () => {
      console.log(t('serve.up', { url: `http://${host}:${port}` }))
      console.log(color.dim('  ' + t('serve.endpoints')))
      console.log(color.dim('  ' + t('serve.stop')))
    })
  })
}
