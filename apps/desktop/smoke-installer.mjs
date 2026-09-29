// Windows installer round trip (0.5.1): install the built .exe silently → run the INSTALLED app's --smoke →
// uninstall silently → prove nothing is left (files, uninstall entry). `smoke:packed` runs the zip and never
// touches the installer, which is how the first desktop-v0.5.0 upload shipped an uninstaller that failed
// NSIS's integrity check on real Windows. Run it on Windows before uploading any Windows installer.
//
//   node smoke-installer.mjs                  refuses if Jobdar is already installed for this user (it would
//                                             replace a real install)
//   node smoke-installer.mjs --over-existing  install OVER the existing one on purpose (the upgrade path),
//                                             then uninstall — for testing upgrades from an older version
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32') throw new Error('smoke-installer runs on Windows only')
const here = path.dirname(fileURLToPath(import.meta.url))
const version = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8')).version
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const exe = path.join(here, 'dist-build', `Jobdar-beta-${version}-win-${arch}.exe`)
if (!existsSync(exe)) throw new Error(`${path.basename(exe)} not built — run \`node dist-native.mjs\` first`)
const installDir = path.join(process.env.LOCALAPPDATA, 'Programs', 'jobdar-desktop')

// The current user's Jobdar uninstall entries, via PowerShell (reg.exe output is locale-dependent).
const entries = () => {
  const ps = "@(Get-ItemProperty 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -like 'Jobdar*' } | ForEach-Object { $_.DisplayVersion }) -join ','"
  return execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(',').filter(Boolean)
}
const fail = (msg) => { console.error(`INSTALLER SMOKE FAIL — ${msg}`); process.exit(1) }
const files = () => (existsSync(installDir) ? readdirSync(installDir, { recursive: true }).length : 0)

const before = entries()
if (before.length && !process.argv.includes('--over-existing')) {
  fail(`Jobdar ${before.join(', ')} is already installed for this user — this test would replace it. Uninstall it first, or pass --over-existing to test the upgrade on purpose.`)
}

const inst = spawnSync(exe, ['/S'], { stdio: 'inherit', timeout: 5 * 60 * 1000 })
if (inst.status !== 0) fail(`installer exited ${inst.status}${before.length ? ` (installing over ${before.join(', ')})` : ''}`)
const after = entries()
if (!after.includes(version)) fail(`after install the uninstall entry says ${after.join(', ') || 'nothing'}, expected ${version}`)

const app = path.join(installDir, 'Jobdar.exe')
const smoke = spawnSync(app, ['--smoke'], { encoding: 'utf8', timeout: 5 * 60 * 1000 })
const smokeLine = `${smoke.stdout || ''}${smoke.stderr || ''}`.split(/\r?\n/).find((l) => l.includes('SMOKE')) || '(no SMOKE line)'
if (smoke.status !== 0 || !smokeLine.includes('SMOKE OK')) fail(`installed app: ${smokeLine}`)

const un = spawnSync(path.join(installDir, 'Uninstall Jobdar.exe'), ['/S', '/currentuser'], { stdio: 'inherit', timeout: 5 * 60 * 1000 })
if (un.status !== 0) fail(`uninstaller exited ${un.status} — a broken uninstaller strands every user on this version`)
// The silent uninstaller relaunches itself from %TEMP% and returns early — wait for it to finish.
for (let i = 0; i < 60 && (files() > 0 || entries().length); i++) spawnSync('powershell.exe', ['-NoProfile', '-Command', 'Start-Sleep -Milliseconds 500'])
if (entries().length) fail(`uninstall entry still present: ${entries().join(', ')}`)
if (files() > 0) fail(`${files()} file(s) left in ${installDir}`)
if (existsSync(installDir)) rmSync(installDir, { recursive: true, force: true }) // NSIS can leave the empty folder

console.log(`INSTALLER SMOKE OK — ${path.basename(exe)}: installed ${version}${before.length ? ` over ${before.join(', ')}` : ''}, ${smokeLine.replace(/^.*SMOKE OK — /, 'app: ')}, uninstalled clean`)
