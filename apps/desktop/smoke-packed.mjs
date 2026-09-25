// Smoke-test the PACKAGED app without leaving an unpacked Jobdar.app on indexed disk: unzip the
// native-arch zip from dist-build into the temp dir (Spotlight doesn't index /var/folders), run the
// --smoke self-test there, and clean up. `npx electron . --smoke` covers the dev tree; this covers
// what testers actually receive.
import { execSync } from 'node:child_process'
import { readdirSync, rmSync, mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(here, 'dist-build')
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const zip = readdirSync(dist).find((f) => f.includes(`mac-${arch}`) && f.endsWith('.zip'))
if (!zip) throw new Error(`no mac-${arch} zip in dist-build — run \`npm run dist:all\` first`)
const tmp = mkdtempSync(path.join(os.tmpdir(), 'jobdar-smoke-'))
try {
  execSync(`ditto -x -k "${path.join(dist, zip)}" "${tmp}"`)
  execSync(`"${path.join(tmp, 'Jobdar.app', 'Contents', 'MacOS', 'Jobdar')}" --smoke`, { stdio: 'inherit' })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
