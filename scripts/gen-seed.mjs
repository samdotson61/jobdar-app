import yaml from 'js-yaml'
import { readFileSync, writeFileSync } from 'node:fs'
const data = yaml.load(readFileSync('data/seed/employers.yml', 'utf8'))
const body = '// GENERATED from data/seed/employers.yml — do not edit by hand. Regenerate with\n' +
  '//   node scripts/gen-seed.mjs\n' +
  '// when the yml changes (the seed-parity test in test-all.mjs guards drift).\n' +
  'export const SEED_EMPLOYERS = ' + JSON.stringify(data.employers || [], null, 1) + '\n'
writeFileSync('packages/engine/seed.mjs', body)
console.log('seed.mjs:', (data.employers || []).length, 'employers')
