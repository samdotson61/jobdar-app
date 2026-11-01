// Jobdar tests — the registration harness every test/*.test.mjs file shares. `test(name, fn)` queues a
// case; test-all.mjs imports the files in name order and runs the queue, so registration order is run
// order. ROOT is the repository root (the test files live one level down).

import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const tests = []
export const test = (name, fn) => tests.push({ name, fn })
