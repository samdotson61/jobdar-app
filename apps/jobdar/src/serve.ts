// Typed backend client — the app's ONLY data source, with two interchangeable backends behind one
// contract (Phase 10):
//   'local' — the ON-DEVICE backend (src/local/backend.ts: real @jobdar/engine + llama.rn + file Store).
//             The NATIVE default: fully local, no Mac, no serve.
//   'serve' — a `jobdar serve` HTTP façade (the CLI + winc as the full stack). The WEB default; also the
//             native "companion mode" pointing at a Mac's LAN serve (`?serve=<base>&token=<t>` on web,
//             the Settings screen on native; persisted).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localCall } from './local/backend';

let BASE = 'http://127.0.0.1:4320';
let TOKEN = '';
export type BackendMode = 'local' | 'serve';
let MODE: BackendMode = Platform.OS === 'web' ? 'serve' : 'local';
// An explicit ?serve=<base> in the URL is authoritative for THIS load (1.56.0 — the desktop shell
// injects its in-process serve port this way): the async persisted-config load must not clobber it,
// or a stale Settings entry would point the desktop app at a dead port.
let URL_PINNED = false;
try {
  // @ts-ignore — web only
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    // @ts-ignore
    const q = new URLSearchParams(window.location.search);
    if (q.get('serve')) {
      BASE = q.get('serve') as string;
      MODE = 'serve'; // an explicit serve URL means serve mode, whatever was persisted
      URL_PINNED = true;
    }
    if (q.get('token')) TOKEN = q.get('token') as string;
  }
} catch {
  /* native / no window */
}
// Persisted override (Settings) — loads fast; the pre-hydration default is correct per-platform anyway.
// 1.25.1: the July→September builds persisted under `jobfaro-backend-config`; read it once if the new key is empty.
AsyncStorage.getItem('jobdar-backend-config').then((raw) => raw ?? AsyncStorage.getItem('jobfaro-backend-config')).then((raw) => {
  if (!raw) return;
  try {
    const c = JSON.parse(raw);
    if (!URL_PINNED && (c.mode === 'local' || c.mode === 'serve')) MODE = c.mode;
    if (!URL_PINNED && typeof c.base === 'string' && c.base) BASE = c.base;
    if (!URL_PINNED && typeof c.token === 'string') TOKEN = c.token;
  } catch { /* corrupt config → per-platform defaults */ }
}).catch(() => {});

export function configureServe(o: { base?: string; token?: string; mode?: BackendMode; persist?: boolean }) {
  if (o.base) BASE = o.base;
  if (o.token != null) TOKEN = o.token;
  if (o.mode === 'local' || o.mode === 'serve') MODE = o.mode;
  if (o.persist) AsyncStorage.setItem('jobdar-backend-config', JSON.stringify({ mode: MODE, base: BASE, token: TOKEN })).catch(() => {});
}
export function serveBase() {
  return BASE;
}
export function backendMode(): BackendMode {
  return MODE;
}

const headers = (): Record<string, string> => ({
  'content-type': 'application/json',
  ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
});

// Long-running verbs (batch score, scan) legitimately take minutes; a wedged serve must still surface as
// backend-down rather than a spinner forever. Hermes has no AbortSignal.timeout, so do it by hand.
const CALL_TIMEOUT_MS = 600000;
function parseBody(b: unknown): any {
  if (typeof b !== 'string') return undefined;
  try { return JSON.parse(b); } catch { return undefined; }
}
async function call(path: string, init?: RequestInit): Promise<any> {
  if (MODE === 'local') {
    return localCall(path, init && init.method === 'POST' ? 'POST' : 'GET', parseBody(init && init.body));
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS) : null;
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, { ...init, ...(ctrl ? { signal: ctrl.signal } : {}), headers: { ...headers(), ...((init && (init.headers as any)) || {}) } });
  } catch (e: any) {
    // Network failure / timeout → the same tagged shape a 503 produces, so the backend-down banner shows.
    return { ok: false, status: 0, error: e && e.name === 'AbortError' ? 'timeout' : String((e && e.message) || e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
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
