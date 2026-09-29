// Jobdar — the managed local AI (1.64.0). One-click setup + lifecycle for a winc binary the HOST ships —
// today the desktop app, which bundles the winc-jobdar build in its Resources. The host opts in by setting
//   JOBDAR_WINC_BIN   path to that winc binary (required — without it nothing here is active)
//   JOBDAR_WINC_HOME  where winc keeps its engine, model and winc.toml (default: <data home>/ai)
//   JOBDAR_WINC_PORT  the port its eval server binds (default 43211 — clear of the usual :8080, so a
//                     layman's other dev tools can't collide with it)
// and pointing JOBDAR_INFERENCE_URL at that port. `jobdar serve` then exposes the setup to the GUI:
// GET /health → backend.setup (phase + honest progress), POST /backend/start {confirm} → setup().
//
// We DELEGATE to winc, exactly like `jobdar backend --install`: `winc -d <model>` downloads (resumable,
// sha256-verified), `winc serve --eval <model>` fetches the llama.cpp engine on first start and serves the
// eval profile. We only orchestrate: spawn, read its progress lines, report them truthfully, and stop it
// cleanly (SIGINT on macOS/Linux — winc stops its llama-server child on Ctrl-C; on Windows a hard kill is
// fine because winc puts llama-server in a kill-on-close Job Object).
import { spawn as nodeSpawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statfsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { paths } from './config.mjs'

// The shipped eval model (docs/eval-model-alternatives.md: qwen3.5-4b stays) and the file winc saves it as.
export const MANAGED_MODEL = 'qwen3.5-4b'
export const MANAGED_MODEL_FILE = 'Qwen3.5-4B-Q4_K_M.gguf'
export const MANAGED_MODEL_GB = 2.74
// Free space we ask for before starting: the model plus the engine (up to ~0.5 GB for a GPU build on
// Windows) plus headroom so the download can't fill the disk to the brim.
export const MANAGED_MIN_FREE_GB = 4
export const DEFAULT_MANAGED_PORT = 43211

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g

// Host opt-in → config, or null when no winc binary is provided (plain `jobdar serve`, the CLI).
export function managedWincConfig(env = process.env, dataHome = paths.home) {
  const bin = env.JOBDAR_WINC_BIN
  if (!bin) return null
  const port = Number(env.JOBDAR_WINC_PORT) > 0 ? Number(env.JOBDAR_WINC_PORT) : DEFAULT_MANAGED_PORT
  const home = env.JOBDAR_WINC_HOME ? path.resolve(env.JOBDAR_WINC_HOME) : path.join(dataHome, 'ai')
  return { bin, home, port, url: `http://127.0.0.1:${port}` }
}

// One line of winc output → a progress fact, or null. winc's download bar (internal/download/progress.go):
//   "\r  [#######-----] 42%  1.15/2.74 GB  38.2 MB/s  ETA 00:41   "   (size known)
//   "\r  0.12 GB  38.2 MB/s   "                                         (size unknown)
export function parseWincProgress(line) {
  const s = String(line || '').replace(ANSI, '')
  let m = s.match(/(\d{1,3})%\s+([\d.]+)\/([\d.]+)\s*GB\s+([\d.]+)\s*MB\/s(?:\s+ETA\s+([\d:]+))?/)
  if (m) {
    const eta = m[5] ? m[5].split(':').reduce((a, v) => a * 60 + Number(v), 0) : null
    return { pct: Math.min(100, Number(m[1])), doneGB: Number(m[2]), totalGB: Number(m[3]), mbps: Number(m[4]), etaSec: eta }
  }
  m = s.match(/^\s*([\d.]+)\s*GB\s+([\d.]+)\s*MB\/s\s*$/)
  if (m) return { pct: null, doneGB: Number(m[1]), totalGB: null, mbps: Number(m[2]), etaSec: null }
  return null
}

// The [general] port in a winc.toml (winc binds its router there), or null.
export function wincTomlPort(text) {
  const sec = String(text || '').split(/^\s*\[/m).find((b) => /^general\]/.test(b))
  const m = sec && sec.match(/^\s*port\s*=\s*(\d+)/m)
  return m ? Number(m[1]) : null
}

export function managedModelPresent(home) {
  const f = path.join(home, 'models', MANAGED_MODEL_FILE)
  return existsSync(f) && !existsSync(f + '.part')
}

// Free GB on the volume holding `dir` (its nearest existing ancestor), or null when unknown.
export function freeGB(dir, statfs = statfsSync) {
  let d = dir
  while (d && !existsSync(d)) {
    const up = path.dirname(d)
    if (up === d) break
    d = up
  }
  try {
    const s = statfs(d)
    return (Number(s.bavail) * Number(s.bsize)) / 1e9
  } catch {
    return null
  }
}

// A manager bound to one config. Every side effect has a seam (spawn, health probe, statfs, fs writes)
// so the state machine is testable without a real multi-GB download.
export function createWincManager(cfg, { spawn = nodeSpawn, health, statfs = statfsSync, platform = process.platform } = {}) {
  const probe = health || (async (url) => {
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2500) })
      return r.ok
    } catch {
      return false
    }
  })
  // phase: idle → downloading → starting → ready ; error from any step. `engine` = first-start engine fetch.
  const st = { phase: 'idle', pct: null, doneGB: null, totalGB: null, etaSec: null, error: null, startedAt: null }
  let child = null
  let dlChild = null // the `winc -d` download in flight — stopped on quit (the .part resumes next time)
  let tail = [] // last lines of winc output, for an honest error message
  let busy = null // the in-flight setup promise (one at a time)

  const env = () => ({ ...process.env, WINC_HOME: cfg.home })
  const set = (patch) => Object.assign(st, patch)
  const clearProgress = () => set({ pct: null, doneGB: null, totalGB: null, etaSec: null })

  // winc.toml: winc writes its full default on first run (port 8080). Write OUR port first so the managed
  // server never fights whatever else lives on 8080; an existing file is left alone and its port is used.
  function ensureConfig() {
    mkdirSync(cfg.home, { recursive: true })
    const toml = path.join(cfg.home, 'winc.toml')
    if (!existsSync(toml)) {
      writeFileSync(toml, `# Written by Jobdar Desktop — the app's private AI server.\n[general]\nhost = "127.0.0.1"\nport = ${cfg.port}\n`)
    } else {
      const p = wincTomlPort(readFileSync(toml, 'utf8'))
      if (p && p !== cfg.port) {
        cfg.port = p
        cfg.url = `http://127.0.0.1:${p}`
      }
    }
  }

  function watch(proc, onLine) {
    let buf = ''
    const feed = (chunk) => {
      buf += chunk.toString()
      const parts = buf.split(/[\r\n]/)
      buf = parts.pop()
      for (const raw of parts) {
        const line = raw.replace(ANSI, '').trim()
        if (!line) continue
        const prog = parseWincProgress(line)
        if (prog) onLine(line, prog)
        else {
          tail.push(line)
          if (tail.length > 12) tail.shift()
          onLine(line, null)
        }
      }
    }
    proc.stdout && proc.stdout.on('data', feed)
    proc.stderr && proc.stderr.on('data', feed)
  }

  const run = (args, onLine) =>
    new Promise((resolve) => {
      let proc
      try {
        proc = spawn(cfg.bin, args, { env: env(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
      } catch (e) {
        return resolve({ code: -1, error: e.message })
      }
      dlChild = proc
      watch(proc, onLine)
      proc.on('error', (e) => { dlChild = null; resolve({ code: -1, error: e.message }) })
      proc.on('exit', (code) => { dlChild = null; resolve({ code }) })
    })

  const lastError = (fallback) => tail.slice().reverse().find((l) => /error|fail|could not|cannot|denied|no space/i.test(l)) || tail[tail.length - 1] || fallback

  async function download() {
    const free = freeGB(cfg.home, statfs)
    if (free != null && free < MANAGED_MIN_FREE_GB) {
      set({ phase: 'error', error: `not enough disk space: ${free.toFixed(1)} GB free, the AI needs about ${MANAGED_MIN_FREE_GB} GB`, code: 'disk', freeGB: free })
      return false
    }
    tail = []
    set({ phase: 'downloading', error: null, code: null, pct: 0, doneGB: 0, totalGB: MANAGED_MODEL_GB, etaSec: null })
    const r = await run(['-d', MANAGED_MODEL], (_line, prog) => {
      if (prog) set({ pct: prog.pct ?? st.pct, doneGB: prog.doneGB, totalGB: prog.totalGB ?? st.totalGB, etaSec: prog.etaSec })
    })
    if (st.phase === 'stopping') { clearProgress(); return false } // quit mid-download — not an error
    if (r.code !== 0 || !managedModelPresent(cfg.home)) {
      clearProgress()
      set({ phase: 'error', error: r.error || lastError('the model download did not finish'), code: 'download' })
      return false
    }
    clearProgress()
    return true
  }

  async function serve() {
    tail = []
    set({ phase: 'starting', error: null, code: null, startedAt: Date.now() })
    clearProgress()
    let proc
    try {
      proc = spawn(cfg.bin, ['serve', '--eval', MANAGED_MODEL], { env: env(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    } catch (e) {
      set({ phase: 'error', error: e.message, code: 'spawn' })
      return false
    }
    child = proc
    watch(proc, (line, prog) => {
      // First start fetches the llama.cpp engine: "fetching llama.cpp (metal backend)..." then a bar.
      if (/fetching llama\.cpp/i.test(line)) set({ phase: 'engine', pct: 0 })
      if (prog && st.phase === 'engine') set({ pct: prog.pct, doneGB: prog.doneGB, totalGB: prog.totalGB, etaSec: prog.etaSec })
      if (/llama\.cpp ready/i.test(line)) { clearProgress(); set({ phase: 'starting' }) }
    })
    const exited = new Promise((resolve) => {
      proc.on('error', (e) => resolve({ code: -1, error: e.message }))
      proc.on('exit', (code) => resolve({ code }))
    })
    exited.then((r) => {
      if (child === proc) child = null
      // An exit we didn't ask for is an error the user should see (a stop() sets phase first).
      if (st.phase !== 'stopping' && st.phase !== 'idle') {
        clearProgress()
        set({ phase: 'error', error: r.error || lastError(`the AI stopped (exit ${r.code})`), code: 'exit' })
      } else set({ phase: 'idle' })
    })
    // Ready = winc's router answers /health 200 (it proxies llama-server's, so 200 only once loaded).
    // First start may include the engine download; a slow disk/CPU loads a 2.7 GB model in ~1 min.
    const deadline = Date.now() + 15 * 60 * 1000
    while (Date.now() < deadline) {
      const done = await Promise.race([exited.then(() => 'exit'), new Promise((r) => setTimeout(() => r('tick'), 1000))])
      if (done === 'exit') return false
      if (await probe(cfg.url)) {
        clearProgress()
        set({ phase: 'ready', error: null, code: null })
        return true
      }
    }
    await stop()
    set({ phase: 'error', error: 'the AI did not become ready within 15 minutes', code: 'timeout' })
    return false
  }

  // Start the AI. Downloads the model first only with an explicit confirm (it is a multi-GB download).
  // Returns the status right away; progress is read through status().
  function setup({ confirm = false } = {}) {
    if (busy || st.phase === 'ready') return status()
    const have = managedModelPresent(cfg.home)
    if (!have && confirm !== true) return { ...status(), needsConfirm: true }
    busy = (async () => {
      try {
        ensureConfig()
        // Already serving on our port (e.g. a previous app session that didn't shut down) — adopt it.
        if (await probe(cfg.url)) {
          set({ phase: 'ready', error: null, code: null, adopted: true })
          return
        }
        if (!have && !(await download())) return
        await serve()
      } catch (e) {
        set({ phase: 'error', error: e.message, code: 'internal' })
      } finally {
        busy = null
      }
    })()
    return status()
  }

  // Stop what we started — an in-flight download and/or the server (never one we merely adopted).
  // Resolves once each has exited (≤ 10 s). An interrupted download keeps its .part and resumes next time.
  async function stop() {
    if (dlChild) {
      const d = dlChild
      set({ phase: 'stopping' })
      const gone = new Promise((r) => d.once('exit', r))
      try { platform === 'win32' ? d.kill() : d.kill('SIGINT') } catch { /* gone */ }
      if ((await Promise.race([gone.then(() => 'ok'), new Promise((r) => setTimeout(() => r('late'), 5000))])) === 'late') {
        try { d.kill('SIGKILL') } catch { /* gone */ }
      }
      dlChild = null
    }
    const proc = child
    if (!proc) {
      if (st.phase !== 'error') set({ phase: 'idle' })
      return
    }
    set({ phase: 'stopping' })
    const gone = new Promise((r) => proc.once('exit', r))
    try {
      if (platform === 'win32') proc.kill()
      else proc.kill('SIGINT') // winc's Ctrl-C path stops llama-server with it; SIGTERM would orphan it
    } catch { /* already gone */ }
    const t = await Promise.race([gone.then(() => 'ok'), new Promise((r) => setTimeout(() => r('late'), 8000))])
    if (t === 'late') {
      try { proc.kill('SIGKILL') } catch { /* gone */ }
      await Promise.race([gone, new Promise((r) => setTimeout(r, 2000))])
    }
    child = null
    set({ phase: 'idle' })
  }

  function status() {
    return {
      managed: true,
      phase: st.phase,
      pct: st.pct,
      doneGB: st.doneGB,
      totalGB: st.totalGB,
      etaSec: st.etaSec,
      error: st.error,
      code: st.code || null,
      freeGB: st.code === 'disk' ? st.freeGB : null,
      needGB: MANAGED_MIN_FREE_GB,
      modelPresent: managedModelPresent(cfg.home),
      sizeGB: MANAGED_MODEL_GB,
      url: cfg.url,
    }
  }

  // prepare(): write/read winc.toml now so cfg.url is final before the host points the engine at it.
  const prepare = () => { ensureConfig(); return cfg.url }
  return { setup, stop, status, prepare, config: cfg, get running() { return Boolean(child || dlChild) } }
}

// Process-wide instance (serve + the desktop shell share it through the ESM module cache).
let shared
export function getManagedWinc(env = process.env) {
  if (shared === undefined) {
    const cfg = managedWincConfig(env)
    shared = cfg ? createWincManager(cfg) : null
  }
  return shared
}
