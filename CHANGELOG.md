# Changelog

All notable changes to Jobdar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Jobdar adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] — 2026-06-05

Phase 3 — iCIMS provider. Covers the second big US enterprise ATS (health systems, insurers,
manufacturers). iCIMS has no public JSON API, so the default path parses public career pages.

### Added
- `providers/icims.mjs` (`{ id, detect, fetch }`): detects `*.icims.com`, fetches the public
  `/jobs/search` HTML and parses **JobPosting JSON-LD first** (reliable), with a best-effort DOM
  job-row fallback; paginates via `pr`, dedupes by URL, resolves relative URLs, decodes entities.
  SSRF-guarded (`*.icims.com`, HTTPS) and politely paced.
- Opt-in **Playwright** render path for JS-rendered iCIMS widgets (`jobdar scan --playwright` or
  `JOBDAR_PLAYWRIGHT=1`), sequential and lazy-imported so the default install stays light.
- Documented (off-by-default) OAuth2 Job Portal API stub for users with employer credentials.
- `lib/html.mjs` (JSON-LD extraction, entity decode, tag strip) + iCIMS fixture tests.

### Notes
- iCIMS is best-effort by nature; coverage varies per employer. JSON-LD tenants work zero-token;
  JS-rendered tenants need `--playwright`. The parser is fixture-verified — validate live against
  a specific employer. (Workday remains live-verified.)

## [0.3.0] — 2026-06-05

Phase 2 — Workday provider. Jobdar can now scan the single most common US enterprise ATS,
zero-token, through the public Workday CXS API.

### Added
- `providers/workday.mjs` (`{ id, detect, fetch }`): detects `*.wd{N}.myworkdayjobs.com`, parses
  tenant/shard/site (explicit `site:` wins, else probes common names), POST-paginates
  `/wday/cxs/{tenant}/{site}/jobs`, and normalizes postings to the shared Job shape with absolute
  URLs. SSRF-guarded (HTTPS, host allowlist, `redirect:'error'`) and politely paced between pages.
- `scan --company <name>` filter to scan a single configured employer.
- Workday fixture tests (detect, SSRF host-allowlist rejection, POST pagination + normalize) and
  a documented Workday portal format in `config/portals.yml` (`provider: workday`, `site:`).

### Verified
- Live smoke test against a real public Workday tenant returns correctly normalized postings.

## [0.2.0] — 2026-06-05

Phase 1 — American-English-first bilingual core. English is canonical; Spanish is a full,
first-class peer; no display strings are hardcoded in code.

### Added
- Authored the agent **brain**: `modes/_shared.md` (rubric, 0–100 scoring bands, level-fit and
  no-degree principles, the rules that never bend) plus `scan`, `eval`, `apply`, `outreach`, and
  `pipeline` modes — in canonical American English.
- **Full Spanish parity** for every base mode under `modes/es/` (natural US Spanish, localized
  output section headers), enforced by a modes-parity test.
- Canonical application **state IDs** in English with Spanish + variant input aliases
  (`lib/states.mjs` + `templates/states.yml`); the tracker now stores IDs and shows localized labels.
- Bilingual docs: `README.es.md` (full parity) + a 🇺🇸/🇲🇽 language switcher on both READMEs.

### Changed
- Bumped to 0.2.0; the AGENTS.md mode table reflects the authored modes.

### Notes
- Generated artifacts (cover letters, outreach, reports) follow the user's `language` via the
  parallel EN/ES mode files. The prose itself is produced by the configured inference backend
  (your AI CLI/API today; the on-device model lands in Phase 8).

## [0.1.0] — 2026-06-05

Phase 0 — Foundation & branding. The repo installs, passes `doctor`, and runs a dry-run
scan; Jobdar-branded throughout; scope locked to EN/ES with a Midwest-default region and an
entry-default level.

### Added
- Two-layer scaffold: a deterministic Node.js layer (`scan.mjs` + `providers/`, `doctor.mjs`,
  tracker) and the Markdown agent brain (`AGENTS.md`, `CLAUDE.md`, `modes/`).
- `jobdar` CLI entrypoint (`bin/jobdar`) with a subcommand router; `scan`, `doctor`, and
  `tracker` implemented; `init`/`eval`/`pipeline`/`pdf`/`dashboard`/`update` are honest stubs
  that name the phase delivering them.
- Greenhouse scanner provider (reference implementation), the `{ id, detect, fetch }`
  provider contract + registry, and an SSRF-guarded HTTP helper (`lib/http.mjs`).
- Bilingual i18n string tables (`config/i18n/{en,es}.yml`) — no hardcoded display strings;
  a test enforces EN/ES key parity.
- Default config: `config/profile.yml` (Midwest region, entry level, English; no PII) and a
  stub `config/portals.yml`; canonical application states in `templates/states.yml`.
- `doctor` treats PDF and Playwright as **optional** (warn, never fail).
- Claude Code plugin manifest (`.claude-plugin/`), the `/jobdar` slash command, and the
  `.agents/skills/` placeholder.
- Repo hygiene: Apache-2.0 `LICENSE` + `NOTICE`, `.gitignore`, a GitHub CI workflow, and
  issue/PR templates. Zero-dependency test runner (`test-all.mjs`).

### Notes
- The GitHub org/repo (`getjobdar/jobdar`) and the npm name are placeholders pending Step 0.2
  (formal trademark search + domain/org grab).
- The plugin manifest should be validated against the current Claude Code plugin spec before
  publishing (Phase 7.5).
