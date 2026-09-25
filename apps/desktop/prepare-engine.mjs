// Vendor the engine: `npm pack` the repo root (exactly what an npm install would ship — the package.json
// `files` set, no repo node_modules, no personal config/data) and install the tarball as the `jobdar`
// dependency. A file: SYMLINK doesn't survive electron-builder (it traverses the whole repo), and the
// tarball also makes the packed app resolve its data home the way a tester's machine will (~/.jobdar).
//
// IDEMPOTENT + PORTABLE (0.2.0): the tarball is renamed to the STABLE path vendor/jobdar-engine.tgz, so
// the dependency string in package.json never changes across engine version bumps — re-running this
// script always converges to the same state, and a fresh clone bootstraps with exactly one command:
//   node prepare-engine.mjs   (regenerates the tarball AND installs every dependency)
import { execSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync, renameSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const vendor = path.join(here, 'vendor')
rmSync(vendor, { recursive: true, force: true })
mkdirSync(vendor, { recursive: true })
execSync(`npm pack "${root}" --pack-destination "${vendor}"`, { stdio: 'inherit' })
const tgz = readdirSync(vendor).find((f) => f.startsWith('jobdar-') && f.endsWith('.tgz'))
if (!tgz) throw new Error('npm pack produced no tarball')
const stable = path.join(vendor, 'jobdar-engine.tgz')
renameSync(path.join(vendor, tgz), stable)
execSync(`npm install --no-audit --no-fund "${stable}"`, { cwd: here, stdio: 'inherit' })
console.log(`engine vendored: ${tgz} → vendor/jobdar-engine.tgz`)
