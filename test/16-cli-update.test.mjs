// Jobdar tests — 1.70.1: `jobdar update` and the help surface (no planned stubs listed).
// Run with `npm test`; `npm test -- cli-update` runs only this file.

import { test, ROOT } from './_harness.mjs'
import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { detectInstall, updateSteps, checkLatest, PACKAGE } from '../lib/commands/update.mjs'

test('update: detectInstall tells a git checkout from an npm install from a packaged copy', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-update-'))
  try {
    assert.equal(detectInstall(dir), 'other')
    assert.equal(detectInstall(path.join(dir, 'node_modules', 'jobdar')), 'npm')
    assert.equal(detectInstall(`C:\\Users\\sam\\AppData\\Roaming\\npm\\node_modules\\jobdar`), 'npm')
    mkdirSync(path.join(dir, '.git'))
    assert.equal(detectInstall(dir), 'git')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  assert.equal(detectInstall(ROOT), 'git') // this very repo
})

test('update: the plan is pull --ff-only + npm install for a checkout, npm i -g for the package, nothing for anything else', () => {
  const git = updateSteps('git', '/x/jobdar')
  assert.deepEqual(git.map((s) => s.args), [['-C', '/x/jobdar', 'pull', '--ff-only'], ['install', '--no-audit', '--no-fund']])
  assert.equal(git[1].cwd, '/x/jobdar')
  const npm = updateSteps('npm', '/usr/lib/node_modules/jobdar')
  assert.equal(npm.length, 1)
  assert.deepEqual(npm[0].args, ['install', '-g', `${PACKAGE}@latest`])
  assert.deepEqual(updateSteps('other', '/Applications/Jobdar.app'), [])
  assert.deepEqual(checkLatest('other', '/Applications/Jobdar.app'), { unknown: true, reason: 'other' })
})

test('cli: --help lists update as a real command and no longer lists the unbuilt pipeline; `jobdar pipeline` still answers honestly', () => {
  const env = { ...process.env, JOBDAR_HOME: path.join(tmpdir(), 'jobdar-empty-home-test') }
  const help = execFileSync(process.execPath, ['bin/jobdar', '--help'], { cwd: ROOT, env, encoding: 'utf8' })
  assert.ok(/^\s+update\s+/m.test(help), 'update is listed')
  assert.ok(!/planned/i.test(help), 'no command is described as planned')
  assert.ok(!/^\s+pipeline\s+/m.test(help), 'pipeline is not listed until it exists')
  const planned = execFileSync(process.execPath, ['bin/jobdar', 'pipeline'], { cwd: ROOT, env, encoding: 'utf8' })
  assert.ok(planned.includes("isn't built yet"), planned)
  const usage = execFileSync(process.execPath, ['bin/jobdar', 'update', '--help'], { cwd: ROOT, env, encoding: 'utf8' })
  assert.ok(usage.includes('--check'))
})
