// Jobdar tests — levels, regions, the employer seed, portability, config safety, privacy, résumé parsing.
// Run with `npm test`; `npm test -- levels-regions-config` runs only this file.

import { test, ROOT } from './_harness.mjs'
import { ALL } from './_helpers.mjs'
import { strict as assert } from 'node:assert'
import { readdirSync, existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { tmpdir, homedir } from 'node:os'
import { paths, ROOT as PKG_ROOT, atomicWrite } from '../lib/config.mjs'
import greenhouse from '../providers/greenhouse.mjs'
import icims from '../providers/icims.mjs'
import { classifyTitle, levelDecision, filterByLevel } from '../lib/levels.mjs'
import { regionStateSet, locationMatches, filterByLocation } from '../lib/regions.mjs'
import { selectEmployers, toPortals } from '../lib/seed.mjs'
import { parseResumeText } from '../lib/resume.mjs'
import { band } from '../lib/evaluations.mjs'

test('levels: classifyTitle reads seniority signals (exec > senior > mid > entry)', () => {
  assert.equal(classifyTitle('Vice President, Product'), 'exec') // spelled-out — the title that scored 4.1
  assert.equal(classifyTitle('VP of Engineering'), 'exec')
  assert.equal(classifyTitle('Director of Product'), 'exec')
  assert.equal(classifyTitle('Head of Data'), 'exec')
  assert.equal(classifyTitle('Chief Product Officer'), 'exec')
  assert.equal(classifyTitle('Senior Engineer'), 'senior')
  assert.equal(classifyTitle('Staff Data Scientist'), 'senior')
  assert.equal(classifyTitle('Engineer II'), 'mid')
  assert.equal(classifyTitle('Data Specialist'), 'mid')
  assert.equal(classifyTitle('Analyst I'), 'entry')
  assert.equal(classifyTitle('Associate Software Engineer'), 'entry')
  assert.equal(classifyTitle('Product Manager'), 'unclear') // a target role — must NOT read as exec/senior
  assert.equal(classifyTitle('Maintenance Technician'), 'unclear')
  assert.equal(classifyTitle('Software Engineer'), 'unclear')
})

test('levels: entry default excludes Senior, surfaces Analyst I, passes ambiguous', () => {
  assert.equal(levelDecision('Senior Engineer', ['entry']).include, false) // gate: excluded
  assert.equal(levelDecision('Analyst I', ['entry']).include, true) // gate: surfaces
  assert.equal(levelDecision('Maintenance Technician', ['entry']).include, true) // ambiguous -> rubric
})

test('levels: adding mid admits Engineer II; senior opt-in ranks on merit (no penalty)', () => {
  assert.equal(levelDecision('Engineer II', ['entry']).include, false) // mid is above entry
  assert.equal(levelDecision('Engineer II', ['entry', 'mid']).include, true) // gate: admitted
  const s = levelDecision('Senior Engineer', ['entry', 'mid', 'senior'])
  assert.equal(s.include, true)
  assert.equal(s.flagged, false) // selected level -> merit, no penalty
})

test('levels: only roles above the highest selected level are out-of-band', () => {
  assert.equal(levelDecision('Senior Engineer', ['entry', 'mid']).reason, 'above-target')
  assert.equal(levelDecision('Senior Engineer', ['senior']).reason, 'on-target')
})

test('levels: executive titles are always above-target and filtered out', () => {
  assert.equal(levelDecision('Vice President, Product', ['entry', 'mid']).include, false)
  assert.equal(levelDecision('Director of Product', ['entry', 'mid']).include, false)
  assert.equal(levelDecision('Head of Growth', ['senior']).include, false) // even a senior target won't admit exec
  const { kept, excluded } = filterByLevel([{ title: 'Vice President, Product' }, { title: 'Product Manager' }], ['entry', 'mid'])
  assert.equal(excluded, 1) // the VP is dropped…
  assert.equal(kept[0].title, 'Product Manager') // …the attainable role passes
})

test('levels: filterByLevel keeps in-band jobs and annotates them', () => {
  const jobs = [{ title: 'Analyst I' }, { title: 'Senior Manager' }, { title: 'Data Engineer' }]
  const { kept, excluded, total } = filterByLevel(jobs, ['entry'])
  assert.equal(total, 3)
  assert.equal(excluded, 1) // Senior Manager filtered
  assert.equal(kept.length, 2)
  assert.ok(kept.every((j) => 'level' in j && 'flagged' in j))
})

test('regions: regionStateSet maps presets; nationwide is ALL', () => {
  const mw = regionStateSet(['midwest'])
  assert.ok(mw.has('OH') && mw.has('IL') && !mw.has('AZ'))
  assert.equal(regionStateSet(['nationwide']), 'ALL')
})

test('regions: location filter keeps in-region + remote-US, drops out-of-region + offshore', () => {
  assert.equal(locationMatches('Tempe, AZ', ['southwest']), true) // gate: Phoenix user gets AZ
  assert.equal(locationMatches('Tempe, AZ', ['midwest']), false)
  assert.equal(locationMatches('Columbus, OH', ['midwest']), true) // gate: Columbus user gets OH
  assert.equal(locationMatches('Columbus, OH', ['southwest']), false)
  assert.equal(locationMatches('Phoenix, Arizona, United States', ['southwest']), true) // full state name
  assert.equal(locationMatches('Bengaluru, India', ['midwest']), false) // offshore blocked
  assert.equal(locationMatches('Remote, USA', ['midwest']), true) // remote-US allowed anywhere
})

test('regions: nationwide keeps US + remote, drops offshore-only', () => {
  assert.equal(locationMatches('Detroit, MI', ['nationwide']), true)
  assert.equal(locationMatches('Austin, TX', ['nationwide']), true)
  assert.equal(locationMatches('Bengaluru, India', ['nationwide']), false)
})

test('regions: filterByLocation counts kept/excluded', () => {
  const jobs = [{ location: 'Chicago, IL' }, { location: 'Bengaluru, India' }, { location: 'Remote, USA' }]
  const { kept, excluded } = filterByLocation(jobs, ['midwest'])
  assert.equal(kept.length, 2)
  assert.equal(excluded, 1)
})

test('regions: handles each provider format (Workday country-first, Greenhouse metro, iCIMS US-ST-City)', () => {
  // Workday "country, state, city"
  assert.equal(locationMatches('US, Texas, Austin', ['southwest']), true)
  assert.equal(locationMatches('US, California, Santa Clara', ['west']), true)
  assert.equal(locationMatches('US, California, Santa Clara', ['midwest']), false)
  // Greenhouse: a bare metro resolves to its region; offshore is blocked
  assert.equal(locationMatches('Chicago', ['midwest']), true)
  assert.equal(locationMatches('Chicago', ['southwest']), false)
  assert.equal(locationMatches('Brno, Czechia', ['nationwide']), false)
  // iCIMS "US-{ST}-{City}"
  assert.equal(locationMatches('US-NJ-Denville', ['northeast']), true)
  assert.equal(locationMatches('US-NJ-Denville', ['midwest']), false)
  assert.equal(locationMatches('US-OH-Columbus', ['midwest']), true)
})

test('seed: region selection returns that region and swaps cleanly (gate)', () => {
  const mw = selectEmployers({ regions: ['midwest'] }).map((e) => e.company)
  const sw = selectEmployers({ regions: ['southwest'] }).map((e) => e.company)
  assert.ok(mw.includes('Enova') && mw.includes('Jamf'))
  assert.ok(sw.includes('Carvana') && sw.includes('Axon'))
  assert.equal(mw.some((c) => sw.includes(c)), false) // disjoint -> toggle swaps employers
  assert.ok(toPortals(selectEmployers({ regions: ['midwest'] })).every((p) => p.company && p.careers_url))
  // 1.63.2: the README has advertised Northeast and West since June; the catalog now actually has them
  // (every entry live-verified 2026-09-25), so the toggle can't land a user on an empty scan.
  const ne = selectEmployers({ regions: ['northeast'] })
  const we = selectEmployers({ regions: ['west'] })
  assert.ok(ne.length >= 15 && we.length >= 15, `northeast ${ne.length} / west ${we.length}`)
  assert.ok(ne.some((e) => e.company === 'Datadog') && we.some((e) => e.company === 'Stripe'))
  assert.ok(ne.every((e) => e.region === 'northeast') && we.every((e) => e.region === 'west'))
  const all = selectEmployers({ regions: ['nationwide'] })
  assert.equal(new Set(all.map((e) => e.company)).size, all.length, 'no duplicate companies across regions')
  assert.equal(new Set(all.map((e) => e.careers_url)).size, all.length, 'no duplicate careers_url across regions')
})

test('portability: package assets resolve from ROOT; user dirs follow JOBDAR_HOME', () => {
  // package assets are never coupled to the user config dir
  assert.equal(paths.i18nDir, path.join(PKG_ROOT, 'config', 'i18n'))
  assert.equal(paths.states, path.join(PKG_ROOT, 'templates', 'states.yml'))
  // a checkout WITH config/profile.yml is repo-local (a self-contained unit); profile.yml is
  // gitignored, so a fresh clone (and CI) must fall back to ~/.jobdar — assert the rule, not
  // one machine's state
  // (and a shell that has already relocated its home with JOBDAR_HOME is honoured, not failed — 1.67.5)
  const expectedHome = process.env.JOBDAR_HOME
    ? path.resolve(process.env.JOBDAR_HOME)
    : existsSync(path.join(PKG_ROOT, 'config', 'profile.yml'))
      ? PKG_ROOT
      : path.join(homedir(), '.jobdar')
  assert.equal(paths.home, expectedHome)
  // JOBDAR_HOME relocates every user dir (subprocess: paths resolve at import time)
  const home = path.join(tmpdir(), 'jobdar-portability-test')
  const out = execFileSync(process.execPath, ['-e', "import('./lib/config.mjs').then(m => console.log(JSON.stringify(m.paths)))"], {
    cwd: ROOT,
    env: { ...process.env, JOBDAR_HOME: home, JOBDAR_CONFIG_DIR: '', JOBDAR_DATA_DIR: '', JOBDAR_OUTPUT_DIR: '' },
    encoding: 'utf8',
  })
  const p = JSON.parse(out)
  assert.equal(p.home, home)
  assert.ok(p.configDir.startsWith(home) && p.dataDir.startsWith(home) && p.outputDir.startsWith(home))
  assert.ok(p.i18nDir.startsWith(PKG_ROOT)) // language tables stay with the package
})

test('portability: i18n renders real strings even when the user config dir is elsewhere', () => {
  // Regression: i18n used to load from CONFIG_DIR, so JOBDAR_CONFIG_DIR=<empty> degraded every
  // string to its raw key ("cli.usage"). Tables are a package asset now.
  const out = execFileSync(process.execPath, ['bin/jobdar', '--help'], {
    cwd: ROOT,
    env: { ...process.env, JOBDAR_HOME: path.join(tmpdir(), 'jobdar-empty-home-test') },
    encoding: 'utf8',
  })
  assert.ok(out.includes('Usage: jobdar <command>'), 'help must render real strings')
  assert.ok(!out.includes('cli.usage'), 'raw i18n keys must not leak')
})

test('safety: atomicWrite writes, overwrites in place, and leaves no orphan .tmp on success', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-atomic-'))
  const f = path.join(dir, 'store.tsv')
  atomicWrite(f, 'one\n')
  assert.equal(readFileSync(f, 'utf8'), 'one\n')
  atomicWrite(f, 'two\n') // overwrite an existing store — the crash-safe path must replace, not append
  assert.equal(readFileSync(f, 'utf8'), 'two\n')
  // crash-safety contract: the temp file is renamed onto the target, never left behind on a clean write
  assert.ok(!readdirSync(dir).some((n) => n.endsWith('.tmp')), 'no orphan .tmp after a successful write')
  rmSync(dir, { recursive: true, force: true })
})

test('safety: a malformed profile.yml raises a clean userFacing error, not a raw YAMLException', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'jobdar-badyaml-'))
  writeFileSync(path.join(dir, 'profile.yml'), 'name: ok\nname: dup\n') // duplicate mapping key → invalid YAML
  const out = execFileSync(
    process.execPath,
    ['-e', "import('./lib/config.mjs').then((m) => { try { m.loadProfile(); console.log('NO_THROW') } catch (e) { console.log(JSON.stringify({ userFacing: !!e.userFacing, msg: e.message })) } })"],
    { cwd: ROOT, env: { ...process.env, JOBDAR_CONFIG_DIR: dir }, encoding: 'utf8' },
  )
  const r = JSON.parse(out.trim())
  assert.equal(r.userFacing, true, 'malformed YAML must be flagged userFacing so the CLI prints a clean message')
  assert.ok(/not valid YAML/.test(r.msg), 'the message must explain the profile is invalid')
  assert.ok(!/YAMLException/.test(r.msg), 'the user message must not leak the raw exception class')
  rmSync(dir, { recursive: true, force: true })
})

test('privacy: personal config is gitignored and never shipped to npm', () => {
  const gi = readFileSync(path.join(ROOT, '.gitignore'), 'utf8')
  for (const p of ['config/profile.yml', 'config/portals.yml', 'data/*', '.env']) {
    assert.ok(gi.includes(p), `.gitignore must cover ${p}`)
  }
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(!pkg.files.includes('config/'), 'npm files must not pack config/ wholesale (profile.yml has PII)')
  assert.ok(pkg.files.includes('config/i18n/'), 'i18n tables must still ship')
  assert.ok(existsSync(path.join(ROOT, 'config', 'profile.example.yml'))) // PII-free template ships instead
  assert.ok(existsSync(path.join(ROOT, 'config', 'portals.example.yml')))
})

test('seed: metro is a contains-match, sector filters, and the catalog spans all 3 providers', () => {
  const cincy = selectEmployers({ regions: ['nationwide'], metros: ['Cincinnati'] }).map((e) => e.company)
  assert.ok(cincy.includes('84.51°') && cincy.includes('Bon Secours Mercy Health')) // "Cincinnati" ⊂ "Cincinnati, OH"
  const mwHealth = selectEmployers({ regions: ['midwest'], sectors: ['healthcare'] })
  assert.ok(mwHealth.length >= 10 && mwHealth.every((e) => e.sector === 'healthcare'))
  const se = selectEmployers({ regions: ['southeast'] })
  assert.ok(se.length >= 10 && se.some((e) => e.company === 'Vanderbilt University Medical Center'))
  const urls = selectEmployers({ regions: ['nationwide'] }).map((e) => e.careers_url).join(' ')
  assert.ok(urls.includes('greenhouse.io') && urls.includes('myworkdayjobs.com') && urls.includes('icims.com'))
})

test('resume: parseResumeText pulls name/email/metro and invents nothing', () => {
  const r = parseResumeText('Jane Doe\njane.doe@example.com\nIndianapolis, IN\nSkills: JS, SQL')
  assert.equal(r.name, 'Jane Doe')
  assert.equal(r.email, 'jane.doe@example.com')
  assert.equal(r.location, 'Indianapolis, IN')
  const empty = parseResumeText('')
  assert.equal(empty.name, '')
  assert.equal(empty.email, '')
  assert.equal(empty.location, '')
})
