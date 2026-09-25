// After packaging, remove ALL unpacked bundle directories — dist-build holds distributables only
// (zips/exes). ANY Jobdar.app left on indexed disk shows up as a second app in Spotlight/Launchpad
// beside /Applications/Jobdar.app (caught live 2026-08-28, twice: first the Intel+Windows dirs, then
// the mac-arm64 one kept "for smoke"). Packaged smoke-testing now unzips into the temp dir instead
// (`npm run smoke:packed`) — Spotlight doesn't index /var/folders.
import { readdirSync, rmSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist-build')
if (existsSync(dist)) {
  for (const d of readdirSync(dist, { withFileTypes: true })) {
    if (d.isDirectory()) {
      rmSync(path.join(dist, d.name), { recursive: true, force: true })
      console.log('pruned', d.name + '/')
    }
  }
}
