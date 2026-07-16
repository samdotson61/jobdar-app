// @jobfaro/server — the PII-free scanner-proxy (Phase 9.1, local dev form).
//
// Reuses the REAL provider code unchanged (providers/*.mjs are pure Web-standard fetch). Two routes only;
// the request bodies have NO field for a résumé or a score — the proxy is structurally incapable of seeing
// PII. In production this same handler deploys to the always-on Node host (Fly/Render) with CORS locked
// to the app origin; here it runs on loopback for local testing. `jobfaro serve` is the power-user form.
import http from 'node:http';
import { fetchJobDescription, resolveProvider, providerIds } from '../../providers/_contract.mjs';

const PORT = Number(process.env.PORT || 4320);
const ORIGIN = process.env.JOBFARO_APP_ORIGIN || '*'; // lock to your app origin in production

const send = (res, code, obj) => {
  res.writeHead(code, {
    'content-type': 'application/json',
    'access-control-allow-origin': ORIGIN,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  });
  res.end(JSON.stringify(obj));
};
const body = (req) => new Promise((resolve) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, providers: providerIds() });

  // POST /fetch-jd { url } → { title, description } — public job data only, no PII in or out.
  if (req.method === 'POST' && req.url === '/fetch-jd') {
    const { url } = await body(req);
    if (!url || typeof url !== 'string') return send(res, 400, { error: 'url required' });
    try {
      const d = await fetchJobDescription(url);
      return send(res, 200, { title: d.title || '', description: d.description || '' });
    } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
  }

  // POST /scan { portal } → resolve a provider and list public roles. (Provider.fetch shape varies; this
  // is the seam the web/native apps call instead of fetching ATS endpoints directly — CORS blocks that.)
  if (req.method === 'POST' && req.url === '/scan') {
    const { portal } = await body(req);
    // resolveProvider returns { provider, match }; the fetch method lives on .provider and takes .match.
    const hit = portal && resolveProvider(portal);
    if (!hit) return send(res, 400, { error: 'unrecognized portal', providers: providerIds() });
    try {
      const jobs = await hit.provider.fetch(hit.match, {});
      return send(res, 200, { jobs: Array.isArray(jobs) ? jobs : [] });
    } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
  }

  return send(res, 404, { error: 'not found', routes: ['GET /health', 'POST /fetch-jd', 'POST /scan'] });
});

server.listen(PORT, '127.0.0.1', () => console.log(`jobfaro scanner-proxy on http://127.0.0.1:${PORT} (origin: ${ORIGIN})`));
