// Jobdar — tiny interactive prompt helper (zero deps, node:readline). Used by `jobdar init`.
// Buffers input lines in a queue so it works for BOTH a human typing at a TTY and piped/scripted
// input (where every line arrives at once — a naive one-listener-per-question approach drops them).

import { createInterface } from 'node:readline'

let rl
const queue = [] // lines received before an ask() was waiting
const waiters = [] // ask() calls waiting for the next line

function ensure() {
  if (rl) return
  rl = createInterface({ input: process.stdin })
  rl.on('line', (line) => {
    if (waiters.length) waiters.shift()(line)
    else queue.push(line)
  })
  rl.on('close', () => {
    while (waiters.length) waiters.shift()(null) // EOF → pending asks fall back to defaults
  })
}

function nextLine() {
  ensure()
  if (queue.length) return Promise.resolve(queue.shift())
  return new Promise((resolve) => waiters.push(resolve))
}

// Free-text question; returns the trimmed answer or the default on empty / EOF.
export async function ask(question, def = '') {
  process.stdout.write(def ? `${question} [${def}] ` : `${question} `)
  const line = await nextLine()
  const a = (line == null ? '' : line).trim()
  return a || def
}

// Numbered choice. Accepts the number, the option value typed directly, or Enter for the default.
export async function askChoice(question, options, def) {
  console.log(question)
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}`))
  const a = (await ask('>', '')).toLowerCase()
  if (!a) return def
  const n = Number(a)
  if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1].value
  const match = options.find((o) => String(o.value).toLowerCase() === a)
  return match ? match.value : def
}

export function closePrompt() {
  if (rl) {
    rl.close()
    rl = null
  }
}
