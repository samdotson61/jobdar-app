// Batch-fetch job descriptions for all unscored pipeline entries.
// Usage: node fetch-jds.mjs [--date YYYY-MM-DD]
// Output: JSON array of { company, role, url, location, description }

import { fetchJobDescription } from './providers/_contract.mjs'
import { readPipeline } from './lib/evaluations.mjs'

const argv = process.argv.slice(2)
const dateFlag = argv[argv.indexOf('--date') + 1] || new Date().toISOString().slice(0, 10)

const rows = readPipeline()
const targets = rows.filter(r => r.updated?.startsWith(dateFlag) && !r.score)

process.stderr.write(`Fetching ${targets.length} JDs for ${dateFlag}...\n`)

const results = []
for (const row of targets) {
  try {
    const jd = await fetchJobDescription(row.url)
    results.push({
      company: row.company,
      role: row.role,
      url: row.url,
      location: row.location?.trim(),
      description: jd?.description?.slice(0, 4000) || '',
    })
    process.stderr.write(`  ✓ ${row.company}: ${row.role.slice(0, 50)}\n`)
  } catch (e) {
    process.stderr.write(`  ✗ ${row.company}: ${row.role.slice(0, 40)} — ${e.message}\n`)
    results.push({
      company: row.company,
      role: row.role,
      url: row.url,
      location: row.location?.trim(),
      description: '',
    })
  }
}

console.log(JSON.stringify(results))
