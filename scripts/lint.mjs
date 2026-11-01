// Jobdar — `npm run lint` (1.70.1): a syntax pass over every .mjs the package and its scripts carry.
// The suite imports the engine, but not scripts/ or the one-off tools, so a stray edit there used to
// surface only when someone ran it. `node --check` parses each file without executing it. Zero deps.

import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SKIP = new Set(['node_modules', 'apps', 'packages', 'data', 'output', 'reports', 'dist', '.git', 'ai'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (name.endsWith('.mjs')) out.push(p)
  }
  return out
}

const files = walk(ROOT)
let bad = 0
for (const f of files) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
  if (r.status !== 0) {
    bad++
    console.log(`FAIL ${path.relative(ROOT, f)}\n${r.stderr.trim()}`)
  }
}
console.log(`${files.length - bad} of ${files.length} .mjs files parse${bad ? `, ${bad} failed` : ''}`)
process.exit(bad ? 1 : 0)
