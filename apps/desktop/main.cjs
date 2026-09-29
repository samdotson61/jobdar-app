// Jobdar Desktop (beta) — the Electron shell. One process, four jobs:
//   1. Run the REAL `jobdar serve` engine in-process on a free loopback port (the same code the CLI
//      runs — nothing forked), with --gui pointing at the exported web app so GUI and API share one
//      origin (no CORS, no token needed on loopback).
//   2. Open a window on it, with ?serve=<that port> so the app pins its backend to this instance.
//   3. Data lives in the tester's ~/.jobdar (the engine's normal data home) — the packed app is
//      read-only and never holds personal data.
//   4. The private AI (0.4.0): the app BUNDLES the winc-jobdar binary (Resources/winc, built by
//      prepare-winc.mjs) and manages it — the GUI's one-click "Set up the AI" downloads the engine +
//      model into ~/.jobdar/ai (lib/winc_manager.mjs), the AI starts with the app once downloaded and
//      stops with it. No terminal. A winc the user already runs on :8080 (or an inference_url they
//      configured) is used as-is instead — the app never fights an existing setup.
// `--smoke` runs a headless self-test: boot serve, load the GUI, probe the API through the same port,
// capture a real screenshot of the rendered window, print SMOKE OK, exit — CI-able verification.

const { app, BrowserWindow, shell, dialog, session } = require('electron')
const path = require('node:path')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')

const SMOKE = process.argv.includes('--smoke')

// Per-user state (renderer localStorage: onboarded flag, verdicts, thumbs) lives in Electron's userData,
// whose folder is named after the app. `--smoke` drives onboarding → Apply and must never read or write a
// tester's real state, so it gets a throwaway folder (before app 'ready'). (0.3.1's one-time copy of a
// Jobfaro-era "jobfaro-desktop" folder was removed in 0.4.0 / engine 1.64.0, as announced.)
if (SMOKE) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'jobdar-smoke-userdata-')))
}
const GUI_DIR = path.join(__dirname, 'gui')
// The bundled winc for this OS/arch: Resources/winc when packaged, winc-bin/<os>-<arch> in a dev tree.
const WINC_EXE = process.platform === 'win32' ? 'winc.exe' : 'winc'
const BUNDLED_WINC = app.isPackaged
  ? path.join(process.resourcesPath, 'winc', WINC_EXE)
  : path.join(__dirname, 'winc-bin', `${process.platform === 'win32' ? 'win' : 'mac'}-${process.arch}`, WINC_EXE)
// The engine ships as the real npm-packed `jobdar` dependency; resolve its checkout root.
const ENGINE_ROOT = path.dirname(require.resolve('jobdar/package.json'))

// A STABLE port (0.1.2): the renderer's localStorage — onboarded flag, verdicts, thumbs highlights —
// is scoped to the page ORIGIN, so a random port per launch made every restart look like a first run
// (caught live in the restart test). Prefer one fixed port; fall back to a free one only if it's
// taken (second instance, port squatter) — losing per-origin state then is the honest lesser evil.
const PREFERRED_PORT = 43210

function tryPort(port) {
  return new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(null))
    s.listen(port, '127.0.0.1', () => {
      const p = s.address().port
      s.close(() => resolve(p))
    })
  })
}

async function pickPort() {
  return (await tryPort(PREFERRED_PORT)) ?? (await tryPort(0))
}

// Decide who owns the AI BEFORE serve starts (serve reads these env vars once). Manage the bundled winc
// only when the user hasn't pointed Jobdar elsewhere and nothing already answers on the default :8080.
async function chooseAi(loadProfile) {
  if (!fs.existsSync(BUNDLED_WINC)) return 'none (no bundled winc in this build)'
  let profile = {}
  try { profile = loadProfile() || {} } catch { /* fresh home */ }
  if (process.env.JOBDAR_INFERENCE_URL || profile.inference_url || profile.inference === 'api') return 'user-configured'
  try {
    const r = await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(1500) })
    if (r.ok) return 'existing :8080'
  } catch { /* nothing there — manage our own */ }
  process.env.JOBDAR_WINC_BIN = BUNDLED_WINC
  // --smoke must never touch a tester's real AI folder.
  if (SMOKE) process.env.JOBDAR_WINC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'jobdar-smoke-ai-'))
  // A zip downloaded from the internet quarantines every file in it; the user approves the APP once,
  // but the helper it launches keeps its own flag. Clear it on our own bundled binary (best-effort —
  // a translocated, read-only copy just keeps it).
  if (process.platform === 'darwin') {
    try { require('node:child_process').execFileSync('xattr', ['-d', 'com.apple.quarantine', BUNDLED_WINC], { stdio: 'ignore' }) } catch { /* not quarantined */ }
  }
  return 'managed'
}

async function startEngine(port) {
  // Seed the API key from the data home the way bin/jobdar does, then start serve in-process.
  const { loadApiKey, loadProfile } = await import(path.join(ENGINE_ROOT, 'lib', 'config.mjs'))
  const aiMode = await chooseAi(loadProfile)
  let ai = null
  if (aiMode === 'managed') {
    const { getManagedWinc } = await import(path.join(ENGINE_ROOT, 'lib', 'winc_manager.mjs'))
    ai = getManagedWinc()
    process.env.JOBDAR_INFERENCE_URL = ai.prepare() // winc.toml written → the port the engine should call
  }
  console.log(`[jobdar] AI: ${aiMode}${ai ? ` → ${ai.config.url} (home ${ai.config.home})` : ''}`)
  if (!process.env.JOBDAR_API_KEY) {
    try {
      const k = loadApiKey()
      if (k) process.env.JOBDAR_API_KEY = k
    } catch {
      /* no key — local winc is the default backend anyway */
    }
  }
  const { runServe } = await import(path.join(ENGINE_ROOT, 'lib', 'commands', 'serve.mjs'))
  // runServe resolves only on server error — run it un-awaited and poll the port for readiness.
  runServe(['--port', String(port), '--gui', GUI_DIR]).catch((e) => {
    dialog.showErrorBox('Jobdar engine failed', String((e && e.stack) || e))
    app.exit(1)
  })
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/pipeline`, { signal: AbortSignal.timeout(10000) })
      if (r.ok) return ai
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error('engine did not come up within 15s')
}

async function main() {
  // In-page downloads (the "Export beta report" button hands the browser a blob) need an explicit
  // save path in Electron (0.1.1 — without this the bytes landed as a hidden temp file and never got
  // their filename). Save straight to the OS Downloads folder and reveal the finished file, so the
  // tester never wonders where their report went.
  session.defaultSession.on('will-download', (_e, item) => {
    const target = path.join(app.getPath('downloads'), item.getFilename() || 'jobdar-download')
    item.setSavePath(target)
    item.once('done', (_ev, state) => {
      if (state === 'completed' && !SMOKE) shell.showItemInFolder(target)
    })
  })

  const port = await pickPort()
  const ai = await startEngine(port)
  // Already downloaded → start the AI with the app (no download, so no consent needed). Not in --smoke.
  if (ai && !SMOKE && ai.status().modelPresent) ai.setup()
  // Stop the AI with the app: it holds ~3 GB of memory, and a leftover would squat its port.
  if (ai) {
    let stopping = false
    app.on('before-quit', (e) => {
      if (stopping || !ai.running) return
      e.preventDefault()
      stopping = true
      ai.stop().finally(() => app.quit())
    })
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    show: !SMOKE,
    title: 'Jobdar (beta)',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  win.removeMenu?.()
  // Job links (and anything non-local) open in the tester's real browser, never inside the shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      shell.openExternal(url)
      return { action: 'deny' }
    }
    return { action: 'allow' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`)) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  await win.loadURL(`http://127.0.0.1:${port}/?serve=${encodeURIComponent(`http://127.0.0.1:${port}`)}`)

  if (SMOKE) {
    // Self-test: API reachable through the same origin + the GUI actually rendered.
    const health = await fetch(`http://127.0.0.1:${port}/pipeline`, { signal: AbortSignal.timeout(10000) })
    // 0.4.0: the bundled AI runtime ships and runs, and serve reports the one-click setup to the GUI.
    let wincV = 'absent'
    try { wincV = require('node:child_process').execFileSync(BUNDLED_WINC, ['-v'], { encoding: 'utf8', timeout: 10000 }).trim() } catch (e) { wincV = `FAILED (${(e && e.message) || e})` }
    const hj = await (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(10000) })).json()
    const setupPhase = hj.backend && hj.backend.setup ? hj.backend.setup.phase : 'unmanaged'
    const report = await fetch(`http://127.0.0.1:${port}/report`, { signal: AbortSignal.timeout(10000) })
    const title = await win.webContents.executeJavaScript('document.title || document.body.innerText.slice(0,80)')
    await new Promise((r) => setTimeout(r, 1500)) // let the app paint
    const snap = async (name) => {
      const image = await win.webContents.capturePage()
      // __dirname is inside the read-only asar when packaged — screenshots go next to the app dir in
      // dev, to the temp dir when packaged.
      const shot = path.join(app.isPackaged ? require('node:os').tmpdir() : __dirname, name)
      fs.writeFileSync(shot, image.toPNG())
      return shot
    }
    const shot1 = await snap('smoke.png')
    // Click through onboarding → Apply tab so the verdict cards (thumbs, pills, export) render too.
    const clickText = (txt) =>
      win.webContents.executeJavaScript(
        `(() => { const el = [...document.querySelectorAll('div,span')].find((e) => e.childElementCount === 0 && e.textContent.trim().startsWith(${JSON.stringify(txt)})); if (el) { el.closest('[tabindex],[role="button"]')?.click?.(); el.click(); return true } return false })()`
      )
    const cont = await clickText('Continue as')
    await new Promise((r) => setTimeout(r, 1200))
    const applied = await clickText('Apply')
    await new Promise((r) => setTimeout(r, 8000)) // hydration + first cards
    const shot2 = await snap('smoke-apply.png')
    if (!/^winc \S+-jobdar\.\d+/.test(wincV)) throw new Error(`bundled winc not runnable: ${wincV}`)
    console.log(`SMOKE OK — api ${health.status}, report ${report.status}, ${wincV}, AI setup ${setupPhase}, gui "${String(title).slice(0, 60)}", onboard→apply ${cont}/${applied}, screenshots ${shot1} + ${shot2}`)
    app.exit(0)
    return
  }
}

app.whenReady().then(() => {
  main().catch((e) => {
    if (SMOKE) {
      console.error('SMOKE FAIL —', String((e && e.stack) || e))
      app.exit(1)
      return
    }
    dialog.showErrorBox('Jobdar failed to start', String((e && e.stack) || e))
    app.exit(1)
  })
})
app.on('window-all-closed', () => app.quit())
