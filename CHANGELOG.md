# Changelog

All notable changes to Jobdar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Jobdar adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-06-05

Phase 7 — quality, dashboard, and the 1.0 CLI. **First stable release of the Jobdar CLI.**

### Added
- **`jobdar dashboard`** — a zero-dependency localhost web view (bilingual) of your pipeline: active
  region + level(s) + language, the application tracker, and configured portals. Read-only; never
  phones home.
- **Security policy** (`SECURITY.md`) and a **legal / privacy / responsible-use** page (`docs/legal.md`).
- Security + dashboard tests; CI runs `doctor` + tests + a dry-run scan.

### Security
- Reviewed every provider: per-host SSRF allowlists (Greenhouse / Workday / iCIMS), HTTPS-only,
  `redirect:'error'`, no embedded credentials, per-request timeouts, polite sequential pacing.
  **Zero telemetry** — the only outbound requests are to the public job boards you configure.

### Release notes (EN)
Jobdar 1.0 is a bilingual (English / Español) US job-search CLI for new grads and people entering the
workforce — including no-degree paths. It scans Workday, iCIMS, and Greenhouse employers (live-verified),
filters by your level and region (Midwest by default), tracks applications, and onboards you in minutes
with `jobdar init`. Your résumé stays on your machine.

### Notas de la versión (ES)
Jobdar 1.0 es una CLI bilingüe (inglés / español) de búsqueda de empleo en EE. UU. para recién
graduados y personas que se incorporan al mundo laboral — incluida la vía sin título. Escanea
empleadores de Workday, iCIMS y Greenhouse (verificados en vivo), filtra por tu nivel y región (Medio
Oeste por defecto), registra solicitudes y te configura en minutos con `jobdar init`. Tu currículum se
queda en tu máquina.

### Pending (external)
- npm publish + Claude Code marketplace submission (needs the org from Step 0.2).
- Closed beta (Phase 7.6) with a new grad, a no-degree candidate, a career-changer, and a
  Spanish-preferring user.

## [0.7.0] — 2026-06-05

Phase 6 — effortless install & onboarding. Completes the MVP cut line.

### Added
- **`jobdar init`** — a bilingual interactive setup wizard (`lib/commands/init.mjs` + a zero-dep
  prompt helper that buffers piped input so it's scriptable). Asks language / metro / region / level /
  tuning / inference, then writes `profile.yml` AND materializes `portals.yml` from the region seed
  catalog — no YAML editing. Non-interactive `--defaults`/`--yes` + flag overrides (`--region`,
  `--levels`, `--name`, …) for installers and the agent layer.
- **Zero-config first scan:** after `init`, `jobdar scan` works immediately (seeded portals;
  Playwright/PDF stay optional).
- **One-command install:** `install.sh` (macOS/Linux), `install.ps1` (Windows), and a `.devcontainer/`.
- **Résumé bootstrap** (`lib/resume.mjs`): a pasted/text résumé → `data/cv.md` + prefilled name/metro
  (never invents); PDF/DOCX deferred to the agent layer.
- **Onboard mode** (`modes/onboard.md`, EN + ES) — conversational guided first run.
- **Getting Started** docs (EN + ES) + a troubleshooting page under `docs/`.

### Verified
- The wizard ran end-to-end via scripted input in **both languages** → wrote a valid profile and 5
  seeded Midwest portals, and `jobdar scan` worked immediately. No YAML editing on the non-dev path.

## [0.6.0] — 2026-06-05

Phase 5 — region toggle (Midwest default) + region-aware employer seeds + geo location filtering.

### Added
- `lib/regions.mjs`: US region taxonomy (midwest default; northeast, southeast, southwest, west,
  nationwide, custom) → states + metros, and a deterministic **location filter** that keeps roles in
  the selected region(s) plus remote-US and drops out-of-region / offshore roles (coarse; ambiguous
  locations pass through). `scan` applies it; `scan --regions southwest` overrides per run.
- `data/seed/employers.yml`: a region-tagged employer catalog, **Midwest seeded first** (Enova,
  project44, Hudl, StockX, Jamf — Chicago / Lincoln / Detroit / Minneapolis) plus a partial Southwest
  set — all live-verified to return public postings.
- `jobdar seed [--region <r>] [--metro <m>] [--write]` (`lib/seed.mjs` + `lib/commands/seed.mjs`):
  previews or materializes matching employers into `config/portals.yml` — no hand-editing.
- Region + seed tests covering the gate (Phoenix→AZ, Columbus→OH, offshore blocked, remote-US kept,
  nationwide, midwest↔southwest swap).

### Verified
- Live: `seed --region midwest --write` → scanning the five real Greenhouse boards kept 78 Midwest +
  remote-US roles and filtered out 87 out-of-region/offshore roles. Toggling to `southwest` swaps to
  Carvana / Axon / Self Financial.
- The location filter was checked against **every provider's** real format (Greenhouse, Workday, iCIMS).

### Fixed
- Cross-provider location parsing so region filtering works regardless of which ATS a role came from:
  Workday country-first ("US, Texas, Austin"), Greenhouse bare metros ("Chicago" → IL) plus a broader
  offshore list (e.g. Czechia), and iCIMS `US-{ST}-{City}` — previously empty, so iCIMS roles bypassed
  the region filter; now 50/50 live iCIMS rows resolve a location.

### Changed
- `.gitignore` now ships `data/seed/` while still ignoring runtime `data/`.

## [0.5.0] — 2026-06-05

Phase 4 — level toggle (entry default, mid first-class, senior opt-in) + no-degree tuning.

### Added
- `lib/levels.mjs`: a coarse, deterministic **title pre-filter** derived from `target_levels`.
  Classifies a title (entry / mid / senior / unclear), drops clear out-of-band titles, and passes
  ambiguous titles through to the rubric. `scan` now filters by level and reports what it dropped;
  `scan --levels entry,mid` overrides per run.
- Rubric (modes/_shared.md, EN + ES): level-fit ranking (selected levels rank on merit; only
  above-target leakage is flagged, never hidden), **level archetypes & strategy** (entry/mid/senior,
  incl. skilled-trades/apprentice for no-degree & career-changers), **candidate tuning profiles**
  (new_grad / early_career / no_degree / career_changer), the **no-degree variant** (degree as a soft
  signal; surface "or equivalent experience"; never hide degree-gated roles), and **compensation**
  tuned per level + regional cost of living.
- Eval report now emits `degree_required: yes | no | unclear`; `include_degree_required_roles`
  (default on) keeps degree-gated roles visible (flagged).
- Level tests covering the gate: entry excludes "Senior Engineer" and surfaces "Analyst I",
  `[entry,mid]` admits "Engineer II", `senior` ranks on merit, only above-top is out-of-band.

### Fixed
- **Workday job URLs** were missing the required `/{site}` segment and returned 404. They now build
  `{base}/{site}{externalPath}`. Caught by full live testing and verified against real tenants
  (Intel, Cadence, NVIDIA). `fetch()` also gained an optional `maxPages` bound.

## [0.4.0] — 2026-06-05

Phase 3 — iCIMS provider. Covers the second big US enterprise ATS (health systems, insurers,
manufacturers). iCIMS has no public JSON API, so the default path parses public career pages.

### Added
- `providers/icims.mjs` (`{ id, detect, fetch }`): detects `*.icims.com`, fetches the public
  `/jobs/search` HTML and parses **JobPosting JSON-LD first**, with a DOM job-card fallback that
  parses real iCIMS `iCIMS_JobCardItem` rows (h3 title, query-stripped URLs); paginates via `pr`,
  dedupes by URL, resolves relative URLs, decodes entities.
  SSRF-guarded (`*.icims.com`, HTTPS) and politely paced.
- Opt-in **Playwright** render path for JS-rendered iCIMS widgets (`jobdar scan --playwright` or
  `JOBDAR_PLAYWRIGHT=1`), sequential and lazy-imported so the default install stays light.
- Documented (off-by-default) OAuth2 Job Portal API stub for users with employer credentials.
- `lib/html.mjs` (JSON-LD extraction, entity decode, tag strip) + iCIMS fixture tests.

### Verified
- Live against three real iCIMS hospital tenants (Covenant Health, Prime Healthcare, Northside
  Hospital): 20–50 postings each parsed, normalized, and deduped from server-rendered HTML.

### Notes
- iCIMS is best-effort by nature; coverage varies per employer. In practice the iframe search
  pages are server-rendered HTML (the DOM job-card path handles them, zero-token); JSON-LD tends
  to live on detail pages. Truly JS-rendered tenants need `--playwright` (implemented, not yet
  live-exercised). Location is best-effort and often absent in iCIMS search rows.

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
- Live smoke test against a real public Workday tenant (NVIDIA) returned postings. (A job-URL bug —
  the missing `/{site}` segment — was later caught and fixed via fuller live testing; see Unreleased.)

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
