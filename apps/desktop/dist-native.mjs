// Build THIS machine's installers (0.5.1): Mac zips on a Mac, Windows installers + zips on Windows.
//
// Why not everything everywhere: electron-builder can't run Windows programs on a Mac, so a Mac-built
// Windows installer carries an uninstaller rebuilt by a JS reader (app-builder-lib's UninstallerReader) —
// and the first desktop-v0.5.0 upload's failed NSIS's own integrity check on real Windows ("Installer
// integrity check has failed"): Settings → Apps couldn't remove Jobdar, and no later installer could
// upgrade it. after-pack.cjs refuses that build outright; this script is the happy path around it.
// A release = the Mac's two zips + this PC's four Windows files, uploaded to the same tag (RELEASING.md).
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const builder = (args) => execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron-builder', ...args], { cwd: here, stdio: 'inherit', shell: process.platform === 'win32' })

if (process.platform === 'darwin') {
  builder(['--mac', 'zip', '--arm64'])
  builder(['--mac', 'zip', '--x64'])
} else if (process.platform === 'win32') {
  // One arch per run: a single run with both archs also emits a combined "…-win.exe" nobody downloads.
  builder(['--win', 'nsis', 'zip', '--x64'])
  builder(['--win', 'nsis', 'zip', '--arm64'])
} else {
  throw new Error(`no desktop targets are built on ${process.platform} — build the Mac zips on a Mac and the Windows installers on Windows`)
}

const dist = path.join(here, 'dist-build')
if (existsSync(dist)) for (const f of readdirSync(dist)) if (/-win\.exe(\.blockmap)?$/.test(f)) rmSync(path.join(dist, f))
console.log(`built ${process.platform === 'darwin' ? 'Mac zips (arm64 + x64)' : 'Windows installers + zips (x64 + arm64)'} → dist-build/`)
