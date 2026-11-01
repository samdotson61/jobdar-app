// Jobdar tests — 1.64.0: the managed local AI (desktop one-click setup).
// Run with `npm test`; `npm test -- winc-manager` runs only this file.

import { test } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import { getT } from '../lib/i18n.mjs'
import { SUPPORTED_LANGUAGES, ROOT as PKG_ROOT } from '../lib/config.mjs'
import { lintDraft, buildOutreachUser } from '../lib/outreach.mjs'
import http from 'node:http'
import { expandQueryTerms, relevanceScore } from '../lib/search.mjs'

// ── 1.64.0: the managed local AI (desktop one-click setup) ────────────────────────────────────────────
test('winc manager: config is opt-in via JOBDAR_WINC_BIN; port/home defaults and overrides', async () => {
  const { managedWincConfig, DEFAULT_MANAGED_PORT } = await import('../lib/winc_manager.mjs')
  assert.equal(managedWincConfig({}, '/h'), null) // plain `jobdar serve` manages nothing
  const d = managedWincConfig({ JOBDAR_WINC_BIN: '/app/winc' }, '/h')
  assert.equal(d.port, DEFAULT_MANAGED_PORT)
  assert.equal(d.home, path.join('/h', 'ai'))
  assert.equal(d.url, `http://127.0.0.1:${DEFAULT_MANAGED_PORT}`)
  const o = managedWincConfig({ JOBDAR_WINC_BIN: '/app/winc', JOBDAR_WINC_PORT: '5555', JOBDAR_WINC_HOME: '/x/ai' }, '/h')
  assert.equal(o.port, 5555)
  assert.equal(o.home, path.resolve('/x/ai'))
})

test('winc manager: parses winc download bars (known + unknown size, ANSI) and winc.toml [general] port', async () => {
  const { parseWincProgress, wincTomlPort } = await import('../lib/winc_manager.mjs')
  const p = parseWincProgress('\x1b[1m  [############----------------]  42%  1.15/2.74 GB  38.2 MB/s  ETA 01:41   ')
  assert.deepEqual(p, { pct: 42, doneGB: 1.15, totalGB: 2.74, mbps: 38.2, etaSec: 101 })
  assert.deepEqual(parseWincProgress('  0.12 GB  38.2 MB/s   '), { pct: null, doneGB: 0.12, totalGB: null, mbps: 38.2, etaSec: null })
  assert.equal(parseWincProgress('fetching llama.cpp (metal backend)...'), null)
  assert.equal(wincTomlPort('[general]\ndefault_app = "claude"\nhost = "127.0.0.1"\nport = 8080\n\n[multi]\nport = 9999\n'), 8080)
  assert.equal(wincTomlPort('# x\n[general]\nport = 43211\n'), 43211)
  assert.equal(wincTomlPort('[multi]\nport = 9999\n'), null)
})

// A fake winc: records spawns, lets the test drive stdout lines and exits.
function fakeWinc(home, { onDownload, onServe } = {}) {
  const calls = []
  const spawn = (bin, args, opts) => {
    const proc = new EventEmitter()
    proc.stdout = new EventEmitter()
    proc.stderr = new EventEmitter()
    proc.killed = null
    proc.kill = (sig) => { proc.killed = sig || 'SIGTERM'; setImmediate(() => proc.emit('exit', 0)) }
    proc.once = proc.once.bind(proc)
    calls.push({ bin, args, env: opts.env, proc })
    const say = (l) => proc.stdout.emit('data', Buffer.from(l))
    setImmediate(() => (args[0] === '-d' ? onDownload : onServe)?.(say, proc))
    return proc
  }
  return { spawn, calls }
}

test('winc manager: download needs an explicit yes, reports real progress, then serves until ready; stop() uses SIGINT', async () => {
  const { createWincManager, MANAGED_MODEL_FILE } = await import('../lib/winc_manager.mjs')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-ai-'))
  let up = false
  const seen = []
  const { spawn, calls } = fakeWinc(home, {
    onDownload: (say, proc) => {
      say('  [######------]  50%  1.37/2.74 GB  40.0 MB/s  ETA 00:34   \r')
      setTimeout(() => {
        mkdirSync(path.join(home, 'models'), { recursive: true })
        writeFileSync(path.join(home, 'models', MANAGED_MODEL_FILE), 'gguf')
        proc.emit('exit', 0)
      }, 30)
    },
    onServe: (say) => {
      say('fetching llama.cpp (metal backend)...\n')
      say('  [###-----]  30%  0.01/0.03 GB  5.0 MB/s  ETA 00:04   \r')
      setTimeout(() => { say('llama.cpp ready (metal backend)\n'); up = true }, 30)
    },
  })
  const mgr = createWincManager({ bin: '/app/winc', home, port: 43299, url: 'http://127.0.0.1:43299' }, { spawn, health: async () => up, statfs: () => ({ bavail: 100e9, bsize: 1 }), platform: 'linux' }) // the SIGINT path; win32 hard-kills
  const gate = mgr.setup()
  assert.equal(gate.needsConfirm, true) // never a multi-GB download without a yes
  assert.equal(calls.length, 0)
  mgr.setup({ confirm: true })
  const t0 = Date.now()
  while (mgr.status().phase !== 'ready' && Date.now() - t0 < 8000) {
    seen.push(JSON.stringify([mgr.status().phase, mgr.status().pct]))
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.equal(mgr.status().phase, 'ready')
  assert.ok(seen.includes(JSON.stringify(['downloading', 50])), 'download progress surfaced')
  assert.ok(seen.includes(JSON.stringify(['engine', 30])), 'engine fetch surfaced')
  // --eval: the model only, no heads/projector (1.64.2)
  assert.deepEqual(calls.map((c) => c.args.join(' ')), ['-d qwen3.5-4b --eval', 'serve --eval qwen3.5-4b'])
  assert.equal(calls[0].env.WINC_HOME, home)
  assert.match(readFileSync(path.join(home, 'winc.toml'), 'utf8'), /\[general\][\s\S]*port = 43299/)
  await mgr.stop()
  assert.equal(calls[1].proc.killed, 'SIGINT') // winc's Ctrl-C path stops llama-server too
  assert.equal(mgr.status().phase, 'idle')
  rmSync(home, { recursive: true, force: true })
})

test('winc manager: refuses to start a download on a nearly-full disk (honest error, no spawn); adopts an already-running server', async () => {
  const { createWincManager, MANAGED_MODEL_FILE } = await import('../lib/winc_manager.mjs')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-ai-'))
  const { spawn, calls } = fakeWinc(home)
  const full = createWincManager({ bin: '/app/winc', home, port: 43298, url: 'http://127.0.0.1:43298' }, { spawn, health: async () => false, statfs: () => ({ bavail: 1e9, bsize: 1 }) })
  full.setup({ confirm: true })
  for (let i = 0; i < 100 && full.status().phase !== 'error'; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(full.status().phase, 'error')
  assert.equal(full.status().code, 'disk')
  assert.match(full.status().error, /1\.0 GB free/)
  assert.equal(calls.length, 0)
  // Model on disk + something already healthy on our port → adopt, spawn nothing, and stop() leaves it be.
  mkdirSync(path.join(home, 'models'), { recursive: true })
  writeFileSync(path.join(home, 'models', MANAGED_MODEL_FILE), 'gguf')
  const live = createWincManager({ bin: '/app/winc', home, port: 43298, url: 'http://127.0.0.1:43298' }, { spawn, health: async () => true })
  assert.equal(live.setup().needsConfirm, undefined) // no download needed → no confirm gate
  for (let i = 0; i < 100 && live.status().phase !== 'ready'; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(live.status().phase, 'ready')
  assert.equal(calls.length, 0)
  await live.stop()
  rmSync(home, { recursive: true, force: true })
})

test('winc manager: an unexpected server exit becomes an error with winc\'s own words', async () => {
  const { createWincManager, MANAGED_MODEL_FILE } = await import('../lib/winc_manager.mjs')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-ai-'))
  mkdirSync(path.join(home, 'models'), { recursive: true })
  writeFileSync(path.join(home, 'models', MANAGED_MODEL_FILE), 'gguf')
  const { spawn } = fakeWinc(home, { onServe: (say, proc) => { say('could not start the engine; see llama-server.log\n'); proc.emit('exit', 1) } })
  const mgr = createWincManager({ bin: '/app/winc', home, port: 43297, url: 'http://127.0.0.1:43297' }, { spawn, health: async () => false })
  mgr.setup()
  for (let i = 0; i < 200 && mgr.status().phase !== 'error'; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(mgr.status().phase, 'error')
  assert.match(mgr.status().error, /could not start the engine/)
  rmSync(home, { recursive: true, force: true })
})

test('prescreen: every screen reason and flag kind the gates emit has an EN + ES label (1.64.0 — two showed raw keys in the app)', () => {
  const src = readFileSync(path.join(PKG_ROOT, 'lib', 'prescreen.mjs'), 'utf8')
  const reasonKinds = [...src.matchAll(/reasons\.push\(\{ kind: '([a-z_]+)'/g)].map((m) => m[1])
  const flagKinds = [...src.matchAll(/flags\.push\(\{ kind: '([a-z_]+)'/g)].map((m) => m[1])
  assert.ok(reasonKinds.length >= 5 && flagKinds.length >= 3, 'the scan found the gate kinds')
  for (const lang of SUPPORTED_LANGUAGES) {
    const t = getT(lang)
    for (const k of new Set(reasonKinds)) assert.notEqual(t(`prescreen.reason_${k}`), `prescreen.reason_${k}`, `${lang}: prescreen.reason_${k} missing`)
    for (const k of new Set(flagKinds)) assert.notEqual(t(`prescreen.flag_${k}`), `prescreen.flag_${k}`, `${lang}: prescreen.flag_${k} missing`)
  }
})

test('resume: noCollegeDegree — explicit statement or diploma/GED-only → true; any named degree → false; unsure → null', async () => {
  const { noCollegeDegree } = await import('../lib/resume.mjs')
  assert.equal(noCollegeDegree('Forklift certified. No college degree — I learn fast on the job.\nReynoldsburg High School — High School Diploma, 2019'), true)
  assert.equal(noCollegeDegree('Education: GED, 2015'), true)
  assert.equal(noCollegeDegree('Columbus High School — High School Diploma, 2020'), true)
  for (const deg of ['University of Cincinnati — B.B.A. in Marketing, May 2026', 'B.S. in Biology, Ohio State', 'B.A., English', 'Bachelor of Science in Nursing', 'MBA, 2019', 'Associate of Applied Science; High School Diploma', 'BSN, RN', 'Ph.D. Chemistry']) {
    assert.equal(noCollegeDegree(deg), false, deg)
  }
  assert.equal(noCollegeDegree('Some college coursework in accounting'), null) // unsure → leave the profile alone
  assert.equal(noCollegeDegree('Shift lead at Kroger. BA Airlines lounge attendant.'), null) // "BA" without dots is not a degree
})

test('serve: POST /profile persists levels + tuning_profile and rejects unknown tunings (1.64.0; the handler then reloads the in-memory profile the evaluator reads)', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-serve-profile-'))
  const port = 43000 + Math.floor(Math.random() * 500)
  const child = spawn(process.execPath, ['bin/jobdar', 'serve', '--port', String(port)], { cwd: PKG_ROOT, env: { ...process.env, JOBDAR_HOME: home, JOBDAR_INFERENCE_URL: 'http://127.0.0.1:9' }, stdio: 'ignore' })
  try {
    let up = false
    for (let i = 0; i < 100 && !up; i++) { try { up = (await fetch(`http://127.0.0.1:${port}/health`)).ok } catch { await new Promise((r) => setTimeout(r, 100)) } }
    assert.ok(up, 'serve came up')
    const post = (body) => fetch(`http://127.0.0.1:${port}/profile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json())
    const r = await post({ target_levels: ['entry', 'mid'], tuning_profile: 'no_degree' })
    assert.equal(r.saved.tuning_profile, 'no_degree')
    assert.deepEqual(r.saved.target_levels, ['entry', 'mid'])
    const bad = await post({ tuning_profile: 'wizard' })
    assert.equal(bad.saved.tuning_profile, 'no_degree', 'unknown tuning values are ignored')
    const g = await (await fetch(`http://127.0.0.1:${port}/profile`)).json()
    assert.equal(g.tuning_profile, 'no_degree')
    assert.deepEqual(g.target_levels, ['entry', 'mid'])
  } finally {
    child.kill()
    rmSync(home, { recursive: true, force: true })
  }
})

test('outreach: a draft that greets the SENDER by name fails lint, and a nameless draft is told to open with "Hi there," (1.64.0)', async () => {
  const { lintDraft, buildOutreachUser } = await import('../lib/outreach_pure.mjs')
  assert.deepEqual(lintDraft('Hi Derek, I am applying for the Seasonal Operations role at StockX.', { sender: 'Derek Wallace' }).problems.map((p) => p.kind), ['self_greeting'])
  assert.equal(lintDraft('Hi there, I am applying for the Seasonal Operations role at StockX.', { sender: 'Derek Wallace' }).ok, true)
  assert.equal(lintDraft('Hi Jamie, I am applying for the role. — Derek', { person: 'Jamie Ruiz', sender: 'Derek Wallace' }).ok, true) // signing your own name is fine
  assert.equal(lintDraft('Dear Derek, …', { person: 'Derek Hill', sender: 'Derek Wallace' }).ok, true) // same first name as the recipient is not a self-greeting
  assert.match(buildOutreachUser({ role: 'X' }), /RECIPIENT: not named — open with "Hi there,"/)
  assert.match(buildOutreachUser({ role: 'X', person: 'Jamie Ruiz' }), /RECIPIENT: Jamie Ruiz\n/)
})

test('search: intent keywords drop place names and requirement filler — WHERE is the region filter\'s job (1.64.0)', async () => {
  const { expandQueryTerms, relevanceScore } = await import('../lib/search.mjs')
  const k = expandQueryTerms('warehouse lead, inventory control or logistics coordinator, no degree required, Columbus Ohio area').keywords
  for (const noise of ['columbus', 'ohio', 'no', 'degree', 'required']) assert.ok(!k.includes(noise), `${noise} leaked into keywords`)
  for (const kept of ['warehouse', 'inventory', 'logistics', 'coordinator']) assert.ok(k.includes(kept), `${kept} missing`)
  const terms = { keywords: k, titles: [], exclude: [] }
  assert.equal(relevanceScore('Mechanical Engineer Path Robotics Columbus, Ohio', terms), 0, 'a Columbus location alone is not relevance')
  assert.ok(relevanceScore('Warehouse Associate Acme Columbus, Ohio', terms) > 0)
})

test('docparse: .docx is read with a built-in zip reader (no `unzip` binary — Windows has none); stored + deflated members (1.64.0)', async () => {
  const { zipEntry, extractTextAsync } = await import('../lib/docparse.mjs')
  const { deflateRawSync, crc32 } = await import('node:zlib')
  // Minimal zip writer: one local header + data per entry, a central directory, and the EOCD record.
  const zip = (entries) => {
    const locals = [], centrals = []
    let off = 0
    for (const { name, data, method } of entries) {
      const body = method === 8 ? deflateRawSync(data) : data
      const n = Buffer.from(name)
      const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(crc32(data), 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(n.length, 26)
      const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(crc32(data), 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42)
      locals.push(lh, n, body); centrals.push(ch, n)
      off += 30 + n.length + body.length
    }
    const cd = Buffer.concat(centrals)
    const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(off, 16)
    return Buffer.concat([...locals, cd, eocd])
  }
  const xml = '<w:document><w:body><w:p><w:r><w:t>Derek Wallace</w:t></w:r></w:p><w:p><w:r><w:t>Shift Lead &amp; forklift certified — Columbus, OH</w:t></w:r></w:p></w:body></w:document>'
  const buf = zip([{ name: '[Content_Types].xml', data: Buffer.from('<Types/>'), method: 0 }, { name: 'word/document.xml', data: Buffer.from(xml), method: 8 }])
  assert.equal(zipEntry(buf, 'word/document.xml').toString('utf8'), xml)
  assert.equal(zipEntry(buf, '[Content_Types].xml').toString('utf8'), '<Types/>')
  assert.equal(zipEntry(buf, 'missing.xml'), null)
  assert.equal(zipEntry(Buffer.from('not a zip at all'), 'word/document.xml'), null)
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-docx-'))
  writeFileSync(path.join(dir, 'r.docx'), buf)
  const r = await extractTextAsync(path.join(dir, 'r.docx'))
  assert.equal(r.error, undefined)
  assert.equal(r.text, 'Derek Wallace\nShift Lead & forklift certified — Columbus, OH')
  rmSync(dir, { recursive: true, force: true })
})

test('winc manager: quitting mid-download stops the download (SIGINT, .part resumes later) and never starts the server', async () => {
  const { createWincManager } = await import('../lib/winc_manager.mjs')
  const home = mkdtempSync(path.join(tmpdir(), 'jobdar-ai-'))
  const { spawn, calls } = fakeWinc(home, { onDownload: (say) => say('  [##----]  12%  0.33/2.74 GB  20.0 MB/s  ETA 02:00   \r') })
  const mgr = createWincManager({ bin: '/app/winc', home, port: 43296, url: 'http://127.0.0.1:43296' }, { spawn, health: async () => false, statfs: () => ({ bavail: 100e9, bsize: 1 }), platform: 'linux' }) // the SIGINT path; win32 hard-kills
  mgr.setup({ confirm: true })
  for (let i = 0; i < 200 && mgr.status().pct !== 12; i++) await new Promise((r) => setTimeout(r, 5))
  assert.equal(mgr.running, true, 'an in-flight download counts as running, so the app waits for it on quit')
  await mgr.stop()
  await new Promise((r) => setTimeout(r, 30))
  assert.equal(calls[0].proc.killed, 'SIGINT')
  assert.equal(calls.length, 1, 'no serve after an interrupted download')
  assert.equal(mgr.running, false)
  assert.notEqual(mgr.status().phase, 'error', 'quitting is not an error')
  rmSync(home, { recursive: true, force: true })
})
