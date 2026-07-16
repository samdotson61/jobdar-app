// Typed backend client — the app's ONLY data source, with two interchangeable backends behind one
// contract (Phase 10):
//   'local' — the ON-DEVICE backend (src/local/backend.ts: real @jobfaro/engine + llama.rn + file Store).
//             The NATIVE default: fully local, no Mac, no serve.
//   'serve' — a `jobfaro serve` HTTP façade (the CLI + winc as the full stack). The WEB default; also the
//             native "companion mode" pointing at a Mac's LAN serve (`?serve=<base>&token=<t>` on web,
//             the Settings screen on native; persisted).
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localCall } from './local/backend';

let BASE = 'http://127.0.0.1:4320';
let TOKEN = '';
export type BackendMode = 'local' | 'serve';
let MODE: BackendMode = Platform.OS === 'web' ? 'serve' : 'local';
// Persisted override (Settings) — loads fast; the pre-hydration default is correct per-platform anyway.
AsyncStorage.getItem('jobfaro-backend-config').then((raw) => {
  if (!raw) return;
  try {
    const c = JSON.parse(raw);
    if (c.mode === 'local' || c.mode === 'serve') MODE = c.mode;
    if (typeof c.base === 'string' && c.base) BASE = c.base;
    if (typeof c.token === 'string') TOKEN = c.token;
  } catch { /* corrupt config → per-platform defaults */ }
}).catch(() => {});
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

export function configureServe(o: { base?: string; token?: string; mode?: BackendMode; persist?: boolean }) {
  if (o.base) BASE = o.base;
  if (o.token != null) TOKEN = o.token;
  if (o.mode === 'local' || o.mode === 'serve') MODE = o.mode;
  if (o.persist) AsyncStorage.setItem('jobfaro-backend-config', JSON.stringify({ mode: MODE, base: BASE, token: TOKEN })).catch(() => {});
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

async function call(path: string, init?: RequestInit): Promise<any> {
  if (MODE === 'local') {
    return localCall(path, init && init.method === 'POST' ? 'POST' : 'GET', init && typeof init.body === 'string' ? JSON.parse(init.body) : undefined);
  }
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
