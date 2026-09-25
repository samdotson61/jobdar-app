// Jobdar — Node-only wiring for lib/http.mjs: DNS-resolution check against the private-range blocklist.
//
// lib/http.mjs is pure Web-standard (fetch/AbortController) so the SAME provider code runs inside the
// native app under Metro, which cannot bundle `node:dns`. The CLI, `jobdar serve`, the desktop shell and
// the scanner proxy import THIS module once (side effect) to plug a real resolver in. Without it, the guard
// still blocks IP literals; with it, a hostname that resolves to a loopback/private/link-local/CGNAT
// address (DNS rebinding, a typo'd internal host) is refused BEFORE the request is sent.
import dns from 'node:dns/promises'
import { setHostResolver } from './http.mjs'

setHostResolver(async (hostname) => {
  const rows = await dns.lookup(hostname, { all: true, verbatim: true })
  return rows.map((r) => r.address)
})
