// Jobdar — test runner (zero dependencies). Run with `npm test`.
// The cases live in test/*.test.mjs, one file per area, loaded in file-name order (the numeric prefix
// keeps the historical run order). `npm test -- prescreen ledger` runs only the files whose name
// contains one of the words; `--list` prints the files and exits.

import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tests } from './test/_harness.mjs'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'test')
const args = process.argv.slice(2)
const words = args.filter((a) => !a.startsWith('-'))
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .filter((f) => !words.length || words.some((w) => f.includes(w)))

if (args.includes('--list')) {
  for (const f of files) console.log(f)
  process.exit(0)
}
if (!files.length) {
  console.error(`no test file matches: ${words.join(' ')} (try --list)`)
  process.exit(1)
}

for (const f of files) await import(pathToFileURL(path.join(dir, f)).href)

let passed = 0
let failed = 0
for (const { name, fn } of tests) {
  try {
    await fn()
    passed++
    console.log(`ok   ${name}`)
  } catch (err) {
    failed++
    console.log(`FAIL ${name}\n     ${err.message}`)
  }
}
console.log(`\n${passed} passed, ${failed} failed${words.length ? `  (${files.length} of ${readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).length} files)` : ''}`)
process.exit(failed > 0 ? 1 : 0)
