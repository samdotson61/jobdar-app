# Security policy

## Reporting a vulnerability

Please email the maintainers privately rather than opening a public issue (a security contact lands
with the org in ROADMAP Step 0.2). We aim to respond within a few business days.

## Security posture

Jobdar is local-first. The scanners read only **public** job data; your résumé, profile and pipeline
stay on your machine. The network surface is small and each piece of it is locked down as follows.

### What leaves your machine, and when

| Traffic | When | Where to | What it carries |
|---|---|---|---|
| Scanner requests | `scan`, `prescreen`, `recheck`, `discover`, JD fetches | The job boards you configured (see allowlists below) | Nothing about you — URLs of public postings |
| USAJobs (opt-in) | Only with a key in `data/credentials.env` | `data.usajobs.gov` | Your API key and, per their terms, the email it was registered under (as the User-Agent) |
| On-device model (default) | `eval`, `tailor`, `outreach --draft` | `127.0.0.1` (winc.cpp / Ollama / llamafile) | JD + résumé — never off the machine |
| API backend (opt-in, BYO key) | Same verbs when `inference: api`/`auto` | The provider you chose (Anthropic by default; Batches API for `--all-pending`) | The minimal JD + CV slice, your key; zero-retention settings; never logged |
| Install/update | `install.sh` / `git pull` / `npm install` | GitHub, npm | Nothing about you |

**Zero telemetry.** Jobdar makes no analytics or phone-home calls.

### Scanner hardening (`lib/http.mjs`, every provider goes through it)

- **Per-provider host allowlists.** Greenhouse `boards-api.greenhouse.io` / `job-boards.greenhouse.io`,
  Workday `*.wd{N}.myworkdayjobs.com`, iCIMS `*.icims.com`, Lever `api.lever.co` / `jobs.lever.co`,
  Ashby `api.ashbyhq.com` / `jobs.ashbyhq.com`, USAJobs `data.usajobs.gov`. The opt-in JSON-LD reader's
  allowlist is the portal's **own** host, which is why the next two guards exist.
- **Private-range block, by name and by address.** IP literals in loopback, RFC 1918, link-local (incl.
  the cloud metadata address), CGNAT (`100.64.0.0/10`), multicast and IPv4-mapped IPv6 (dotted **and**
  hex) are refused. On Node (CLI, `jobdar serve`, the desktop app, the scanner proxy) the hostname is
  also **resolved first** and every address checked against the same list, so a name that points at
  `127.0.0.1` or `10.x` (DNS rebinding, an internal host) is refused before any request goes out.
  *Honest limit:* the native app cannot resolve names itself, so on the phone the guard is name-level
  only; and resolve-then-fetch is two lookups, so a rebinding with a sub-second TTL is narrowed, not
  eliminated (pinning the address would need a custom agent `fetch` does not expose).
- **HTTPS-only, no redirects, no embedded credentials**, a **15 s per-request timeout**, polite
  inter-page pacing, and per-host politeness lanes (sequential within a host).

### Local servers

- **`jobdar serve`** (the desktop app runs it in-process on `127.0.0.1:43210`; the CLI default is
  `127.0.0.1:4320`). Loopback binds are token-less **but answer only loopback `Host` values**
  (`127.0.0.1` / `localhost` / `::1`) — a page whose DNS flips to 127.0.0.1 sends its own hostname
  and gets `421`. A non-loopback bind (`--host 0.0.0.0`, for the phone companion mode) **requires a
  bearer token**, minted and printed at start if you do not pass one; auth is `Authorization: Bearer`
  only — tokens in the query string are not accepted (they land in logs and history). CORS is reflected
  only for loopback/LAN origins, request bodies are capped at 2 MB, and `POST /import` is confined to
  the data home. The GUI URL form `?serve=…&token=…` is how the web build learns the token; it sends it
  as a header afterwards.
- **`@jobdar/server`** (the PII-free scanner proxy for a future hosted web app) exposes only
  `/health`, `/fetch-jd`, `/scan`; its request bodies have no field for a résumé or a score. Body cap
  2 MB; lock CORS with `JOBDAR_APP_ORIGIN` when deploying.

### Secrets and data at rest

- Jobdar ships no keys. Your BYO keys live in the gitignored `data/credentials.env` (mode `0600`), or in
  `JOBDAR_API_KEY` / `USAJOBS_*` environment variables, which take precedence.
- `config/profile.yml`, `config/portals.yml`, `data/` and `output/` are gitignored and excluded from
  the npm package; internal `docs/reports/` is excluded too (CI checks the packed file list).
- The companion-mode bearer token the app persists (Settings) is stored in the app's ordinary storage,
  not a keychain — it grants access to your local serve only, on your LAN, and rotates every serve start.

These guarantees are exercised by tests in `test-all.mjs` (SSRF rejection by name and by resolved
address, HTTPS/credentials checks, the serve auth gate, the Host check, the body cap, CORS reflection).

## Supported versions

The latest release is supported. Pre-1.0 builds are best-effort.
