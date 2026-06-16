// Typed client for `jobdar serve` — the app's ONLY data source. The CLI + winc engine are the full
// stack (Sam's locked architecture); this app is a thin GUI that fetches from serve. Defaults to a local
// serve on loopback. On web you can override at runtime with `?serve=<base>&token=<t>` so a phone can
// point at the Mac's LAN IP + bearer token (from `jobdar serve --host 0.0.0.0`) without a rebuild.
let BASE = 'http://127.0.0.1:4320';
let TOKEN = '';
try {
  // @ts-ignore — web only
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    // @ts-ignore
    const q = new URLSearchParams(window.location.search);
    if (q.get('serve')) BASE = q.get('serve') as string;
    if (q.get('token')) TOKEN = q.get('token') as string;
  }
} catch {
  /* native / no window */
}

export function configureServe(o: { base?: string; token?: string }) {
  if (o.base) BASE = o.base;
  if (o.token != null) TOKEN = o.token;
}
export function serveBase() {
  return BASE;
}

const headers = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
});

async function call(path: string, init?: RequestInit): Promise<any> {
  const r = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers(), ...((init && (init.headers as any)) || {}) } });
  const body = await r.json().catch(() => ({}));
  // Non-2xx (incl. 503 backend-down) returns a tagged object rather than throwing — callers branch on it.
  return r.ok ? body : { ok: false, status: r.status, ...body };
}

export const serveGet = (path: string) => call(path);
export const servePost = (path: string, body?: any) => call(path, { method: 'POST', body: JSON.stringify(body || {}) });

export async function serveHealth(): Promise<{ ok: boolean; backend?: any }> {
  try {
    const j = await serveGet('/health');
    return { ok: j.ok === true, backend: j.backend };
  } catch {
    return { ok: false };
  }
}
