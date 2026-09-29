// Smoke-test the PACKAGED app without leaving an unpacked Jobdar.app on indexed disk: unzip the
// native-arch zip from dist-build into the temp dir (Spotlight doesn't index /var/folders), run the
// --smoke self-test there, and clean up. `npx electron . --smoke` covers the dev tree; this covers
// what testers actually receive.
// On Windows it does the same with the win-<arch> zip (bsdtar, built into Windows 10+, extracts zips)
// and Jobdar.exe — the packaged Windows app had never been run before this existed.
import { execSync } from 'node:child_process'
import { readdirSync, rmSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, 'dist-build')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const win = process.platform === 'win32'
const osTag = win ? 'win' : 'mac'
const zip = readdirSync(dist).find((f) => f.includes(`${osTag}-${arch}`) && f.endsWith('.zip'))
if (!zip) throw new Error(`no ${osTag}-${arch} zip in dist-build — run \`npm run dist:all\` first`)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'jobdar-smoke-'))
try {
  if (win) {
    // Windows' own bsdtar by full path — a Git-Bash GNU tar earlier on PATH can't read zips
    const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    execSync(`"${tar}" -xf "${path.join(dist, zip)}" -C "${tmp}"`)
    execSync(`"${path.join(tmp, 'Jobdar.exe')}" --smoke`, { stdio: 'inherit' })
  } else {
    execSync(`ditto -x -k "${path.join(dist, zip)}" "${tmp}"`)
    execSync(`"${path.join(tmp, 'Jobdar.app', 'Contents', 'MacOS', 'Jobdar')}" --smoke`, { stdio: 'inherit' })
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
