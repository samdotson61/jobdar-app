# Security policy

## Reporting a vulnerability

Please email the maintainers privately rather than opening a public issue (a security contact lands
with the org in ROADMAP Step 0.2). We aim to respond within a few business days.

## Security posture

Jobfaro is local-first and reads only public job data. The network surface is small and locked down:

- **SSRF allowlists.** Every provider restricts requests to its own host(s) via a regex allowlist —
  Greenhouse `boards-api.greenhouse.io`, Workday `*.wd{N}.myworkdayjobs.com`, iCIMS `*.icims.com`.
  Requests to any other host are refused.
- **HTTPS-only, no redirects.** `lib/http.mjs` enforces `https:`, rejects URLs with embedded
  credentials, and sets `redirect: 'error'` so a response can't bounce the scanner to another host.
- **Per-request timeouts** and polite inter-page pacing; the scanner runs sequentially, never in parallel.
- **No secrets in code or logs.** Jobfaro ships no API keys. The default backend is on-device
  (winc.cpp) — no key, nothing sent off the machine. If you opt into the `api` backend, only the
  minimal JD + CV excerpt is sent to the provider you chose, with zero-retention settings — never logged.
- **Zero telemetry.** Jobfaro makes no analytics or phone-home calls. The only outbound requests are to
  the public job boards you configure (plus `npm`/`git` at install time).
- **Your data stays local.** Résumé and history live on your machine; the scanner never uploads them.

These guarantees are exercised by tests in `test-all.mjs` (SSRF rejection, HTTPS/credentials checks).

## Supported versions

The latest release is supported. Pre-1.0 builds are best-effort.
