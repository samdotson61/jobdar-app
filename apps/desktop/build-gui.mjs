// Build the desktop GUI: export the Expo app for web (apps/jobdar) and copy the bundle into ./gui,
// which the in-process serve hosts (same origin as the API). Run before `npm run dist`.
import { execSync } from 'node:child_process'
import { rmSync, cpSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const appDir = path.resolve(here, '..', 'jobdar')
console.log('exporting web bundle from', appDir)
execSync('npx expo export --platform web --clear', { cwd: appDir, stdio: 'inherit' })
const dist = path.join(appDir, 'dist')
if (!existsSync(path.join(dist, 'index.html'))) throw new Error('expo export produced no index.html')
rmSync(path.join(here, 'gui'), { recursive: true, force: true })
cpSync(dist, path.join(here, 'gui'), { recursive: true })
console.log('gui/ ready')
