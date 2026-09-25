// Jobdar Desktop (beta, 0.1.0) — the Electron shell. One process, three jobs:
//   1. Run the REAL `jobdar serve` engine in-process on a free loopback port (the same code the CLI
//      runs — nothing forked), with --gui pointing at the exported web app so GUI and API share one
//      origin (no CORS, no token needed on loopback).
//   2. Open a window on it, with ?serve=<that port> so the app pins its backend to this instance.
//   3. Data lives in the tester's ~/.jobdar (the engine's normal data home) — the packed app is
//      read-only and never holds personal data. Inference: winc on 127.0.0.1:8080, exactly like the
//      CLI; without it the app shows its backend-down banner (see docs/desktop-beta.md).
// `--smoke` runs a headless self-test: boot serve, load the GUI, probe the API through the same port,
// capture a real screenshot of the rendered window, print SMOKE OK, exit — CI-able verification.

const { app, BrowserWindow, shell, dialog, session } = require('electron')
const path = require('node:path')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')

const SMOKE = process.argv.includes('--smoke')

// Per-user state (renderer localStorage: onboarded flag, verdicts, thumbs) lives in Electron's userData,
// whose folder is named after the app. 0.3.1: (a) `--smoke` drives onboarding → Apply and must never
// read or write a tester's real state, so it gets a throwaway folder; (b) the July→September builds
// were named "jobfaro-desktop" — carry that folder over ONCE so an upgrading tester keeps their state
// (RELEASING.md's upgrade-safe promise). Both must run before app 'ready'.
if (SMOKE) {
  app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'jobdar-smoke-userdata-')))
} else {
  try {
    const cur = app.getPath('userData')
    const legacy = path.join(path.dirname(cur), 'jobfaro-desktop')
    const marker = (d) => fs.existsSync(path.join(d, 'Local Storage'))
    if (!marker(cur) && marker(legacy)) {
      fs.cpSync(legacy, cur, { recursive: true, force: false, errorOnExist: false })
      console.log(`[jobdar] carried over saved state from ${legacy}`)
    }
  } catch (e) {
    console.error('[jobdar] legacy state carry-over skipped:', (e && e.message) || e) // a fresh start is the honest fallback
  }
}
const GUI_DIR = path.join(__dirname, 'gui')
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

async function startEngine(port) {
  // Seed the API key from the data home the way bin/jobdar does, then start serve in-process.
  const { loadApiKey } = await import(path.join(ENGINE_ROOT, 'lib', 'config.mjs'))
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
      if (r.ok) return
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
  await startEngine(port)

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
    console.log(`SMOKE OK — api ${health.status}, report ${report.status}, gui "${String(title).slice(0, 60)}", onboard→apply ${cont}/${applied}, screenshots ${shot1} + ${shot2}`)
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
