// Bundle the local AI runtime (0.4.0): cross-compile winc from the `winc-jobdar` branch — the ONLY build
// that has `winc serve --eval`, Jobdar's eval profile (master and its release binaries do not) — for every
// platform the desktop app ships, into winc-bin/<os>-<arch>/, which electron-builder copies into the app's
// Resources/winc/ (see package.json build.extraResources). The app then runs it with WINC_HOME pointed at
// the user's data home, so a tester never opens a terminal: the one-click "Set up the AI" button downloads
// the engine + model through this binary (lib/winc_manager.mjs).
//
// winc is pure Go (llama.cpp is fetched at runtime by `winc` itself), so cross-compiling needs only Go.
// Source: $WINC_SRC, else ~/winc.cpp, else a fresh clone of the branch into .winc-src/. The source must be
// on winc-jobdar with a -jobdar.N version — refusing anything else is the guard against the durable
// hazard where a master build silently can't serve --eval.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const REPO = 'https://github.com/samdotson61/winc.cpp'
const BRANCH = 'winc-jobdar'
// <electron-builder ${os}-${arch}> → Go target
const TARGETS = [
  ['mac-arm64', 'darwin', 'arm64', 'winc'],
  ['mac-x64', 'darwin', 'amd64', 'winc'],
  ['win-x64', 'windows', 'amd64', 'winc.exe'],
  ['win-arm64', 'windows', 'arm64', 'winc.exe'],
]

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], ...opts }).trim()

let src = process.env.WINC_SRC || path.join(os.homedir(), 'winc.cpp')
if (!existsSync(path.join(src, 'go.mod'))) {
  src = path.join(here, '.winc-src')
  rmSync(src, { recursive: true, force: true })
  console.log(`cloning ${REPO} (${BRANCH}) → .winc-src/`)
  execFileSync('git', ['clone', '--depth', '1', '-b', BRANCH, REPO, src], { stdio: 'inherit' })
}
const branch = run('git', ['-C', src, 'rev-parse', '--abbrev-ref', 'HEAD'])
const commit = run('git', ['-C', src, 'rev-parse', '--short', 'HEAD'])
const m = readFileSync(path.join(src, 'internal', 'cli', 'version.go'), 'utf8').match(/var Version = "([^"]+)"/)
const version = m ? m[1] : ''
if (branch !== BRANCH || !/-jobdar\.\d+$/.test(version)) {
  throw new Error(`${src} is on ${branch} (version ${version || '?'}) — the desktop app needs the ${BRANCH} branch (a -jobdar.N build: only it has \`serve --eval\`). Check it out or set WINC_SRC.`)
}
const dirty = run('git', ['-C', src, 'status', '--porcelain', '--untracked-files=no'])
if (dirty) console.warn(`warning: ${src} has uncommitted changes — the bundled winc will include them:\n${dirty}`)

for (const [dir, goos, goarch, bin] of TARGETS) {
  const out = path.join(here, 'winc-bin', dir)
  mkdirSync(out, { recursive: true })
  execFileSync('go', ['build', '-trimpath', '-ldflags', `-s -w -X winc/internal/cli.Version=${version}`, '-o', path.join(out, bin), './cmd/winc'], {
    cwd: src,
    stdio: 'inherit',
    env: { ...process.env, GOOS: goos, GOARCH: goarch, CGO_ENABLED: '0' },
  })
  console.log(`winc ${version} (${commit}) → winc-bin/${dir}/${bin}`)
}
