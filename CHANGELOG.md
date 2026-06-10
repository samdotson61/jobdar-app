# Changelog

All notable changes to Jobdar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Jobdar adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.13.0] — 2026-06-10

The build-order implementation guide: every remaining phase mapped step-by-step, eval-tuning
research in hand, and a slightly faster scan.

### Changed
- **Scan concurrency pool raised 3 → 4** (`scan.mjs`) — one more employer board overlapped per scan;
  per-provider politeness pacing is unchanged.
- **Default inference backend decided: local via winc.cpp, everywhere** (ROADMAP 8b.4; Open Decision 2
  resolved) — private, free, no key. BYO-key API becomes the opt-in accuracy upgrade.

### Added
- **ROADMAP: build-order implementation guide** covering everything unfinished — closed beta (7.6) →
  8a automated eval (+ new 8a.5 calibration set, 8a.6 fairness guards) → 8b winc.cpp-default backend →
  **new Phase 8c** (PDF résumé/JD understanding via deterministic extraction + model structuring),
  **new Phase 8d** (offer evaluation with shipped BLS wage context, `jobdar offer`), **new Phase 8e**
  (the headless engine contract — `lib/engine.mjs` + `jobdar serve` — that the web **and mobile** apps
  plug into) → 7.5 npm publish → Phase 9 (retitled web **and mobile** apps, new step 9.8).
- **Eval-tuning research notes** (`docs/eval-tuning-research.md`) — decomposed rubric design with
  weights and band thresholds, calibration-set practice, fairness guards for the no-degree path,
  offer-evaluation data sources, and the PDF-extraction library survey backing 8c.

## [1.12.1] — 2026-06-09

Privacy hotfix: personal config must never reach git or npm.

### Security
- **`config/profile.yml` and `config/portals.yml` are now gitignored and untracked** (plus any
  `profile.yml.*` backups). The profile carries PII — name, metro, target salary — and the portal list
  reveals your job-search targets; both are created locally by `jobdar init` (from your answers or an
  uploaded résumé) and stay on your machine. The repo ships PII-free **`config/profile.example.yml` /
  `config/portals.example.yml`** templates instead.
- **npm `files` no longer packs `config/` wholesale** — only `config/i18n/` + the two example templates
  ship, so a published tarball can never include a real profile.
- **Git history scrubbed**: all past commits of `config/profile.yml`, `config/portals.yml`, and a tracked
  profile backup were removed from history and the remote was force-updated — previously, real names,
  metros, and a salary target were visible on GitHub.
- Added a privacy regression test (gitignore coverage + npm whitelist + templates present).

## [1.12.0] — 2026-06-09

Phase 5.5 — provider expansion. Six scanner providers, one contract.

### Added
- **Lever provider** (`providers/lever.mjs`) — unauthenticated `api.lever.co` postings list + per-role
  detail (`descriptionPlain`) for eval; detects `jobs.lever.co/{site}` (and `jobs.eu.lever.co`).
  Live-verified: Spotify (147), Zoox (220), Octopus Energy (163), with JD text flowing.
- **Ashby provider** (`providers/ashby.mjs`) — unauthenticated `api.ashbyhq.com/posting-api/job-board/{org}`;
  detects `jobs.ashbyhq.com/{org}`; JD from the board's `descriptionHtml`. Live-verified: Ramp (110, 4.2k-char
  JD), Replo. Covers the small/midsize startup long tail alongside Lever.
- **Generic JSON-LD provider** (`providers/jsonld.mjs`, **explicit opt-in** via `provider: jsonld`) — reads
  schema.org JobPosting/ItemList embedded in any careers page, SSRF-pinned to that page's own host. The
  escape hatch for Phenom/SmashFly-style portals that server-render JSON-LD. (Tested: TriHealth's SmashFly
  listing is JS-only — no SSR JSON-LD — so the big Cincinnati systems still need a dedicated reader; see
  ROADMAP 5.5.5.)

### Notes
- Workday quirk tenants diagnosed: `allina`/`methodisthealthsystem` (HTTP 500) and `hca` (HTTP 422) reject
  the standard CXS POST **even with a browser User-Agent** — not UA-gating; needs deeper request
  replication. Tracked as ROADMAP 5.5.4; those portals fail visibly per-portal in a scan, nothing silent.
- ROADMAP restructured per review: new **Phase 5.5** (this release), **Phase 8 split into 8a** (BYO-key
  automated eval — the key `init` stores finally gets used) **and 8b** (on-device via
  **[winc.cpp](https://github.com/samdotson61/winc.cpp)** as the PRIMARY local backend — its
  `llama-server` speaks the Anthropic Messages API natively on localhost, so 8a's client serves both;
  planning tracks the **GitHub repo**, verified against origin/master v1.4.5); 7.5 marked blocked on
  Step 0.2 only; 7.6 beta can start pre-npm.

## [1.11.0] — 2026-06-09

The TUI becomes a workspace, the tracker becomes real, and the pipeline learns freshness.

### Added
- **TUI scrolling overhaul** — mouse-wheel support (alternate-scroll mode `?1007h`), PgUp/PgDn,
  Home/End, `g`/`G`, a **cursor row** (inverse-video) with **⏎/`o` = open the posting in your browser**
  and **`a` = mark applied**, plus a `from–to of N` position indicator. Scroll/cursor clamp against the
  *filtered* view (no more scrolling into blank space under a band filter).
- **Tracker unified with the pipeline** — `applied` (and any canonical state: interviewing, offer, …) is
  now a pipeline **status**: set it from the TUI (`a`) or `jobdar tracker --set <url> <state>` (ES aliases
  accepted). `jobdar tracker` and the dashboard's tracker card + funnel "Applied" stage read straight from
  the pipeline — the dead never-written `tracker.tsv` is gone, and an eval refresh never demotes a
  human-tracked status.
- **Freshness** — the pipeline persists each role's **`posted`** (board date) and **`first_seen`** (when
  scan found it); `scan --prune` drops stale `scanned` rows that left every board (your evaluated/applied
  rows are never pruned; ignored under `--company` scans where it would over-prune).
- **`jobdar eval --next`** — pops the freshest pending role (posted desc, then first_seen) and prints its
  JD, so the model loop is "next → score → save" with no URL copying.
- **Dashboard**: each pipeline row's role now links to the live posting.

### Changed
- `scan` runs portals through a polite ×3 concurrency pool (per-provider page pacing unchanged) — a
  38-board healthcare scan no longer crawls one employer at a time.
- Pipeline columns: + `posted`, `first_seen` (header-based reads keep old files compatible; the next scan
  rewrites the file in the new shape).

## [1.10.0] — 2026-06-05

Dashboard polish: sortable columns + sector & location breakdowns.

### Added
- **Click-to-sort columns** on the dashboard pipeline table (score · band · role · company · location) —
  a tiny inline vanilla-JS sorter (no libraries), with a ▲/▼ indicator, persisted in `sessionStorage` so
  the sort survives the page's auto-refresh. Score sorts numerically, band by rank, the rest alphabetically.
- **Two analytics charts** — **By sector** (joins pipeline companies to the seed catalog's sector metadata)
  and **By location** (buckets each role's location into state / Remote / Intl / Other). Both stacked by
  band, server-rendered inline SVG like the rest — still no JS libraries, nothing leaves your machine.

### Changed
- `analyze()` / `renderDashboard()` accept the employer `catalog` to power the sector breakdown;
  `runDashboard` passes `loadEmployers()`.

## [1.9.0] — 2026-06-05

`jobdar dashboard` now mirrors the TUI and adds an analytics section with charts.

### Added
- The web dashboard surfaces the **scored pipeline** (TUI parity): every role with its fit score, band,
  role, company, and location; **Apply / Research / Don't / Pending count cards** that double as band
  filters (click → `?band=…`, refresh-safe); pending roles read "pending eval" until the model scores them.
- An **Analytics** section with four server-rendered **inline-SVG charts** — no JS libraries, no CDN,
  nothing leaves your machine: **band distribution**, **score histogram** (0–5), **top companies** stacked
  by band, and a discover → evaluate → apply-tier → applied **funnel** — plus an "X of Y evaluated · avg
  fit Z" summary.

### Changed
- `renderDashboard` now takes `{ pipeline, tracker, view }` (was a single `rows` = tracker). The
  application-tracker and portals cards remain; the page still auto-refreshes and never phones home.

## [1.8.0] — 2026-06-05

Real Midwest & Southern employers via Workday + iCIMS. Greenhouse skews startup/tech, so the regional
economy — especially **healthcare** — was missing. Added 35 live-verified health systems & large employers.

### Added
- **35 live-verified employers** in `data/seed/employers.yml`, on Workday + iCIMS (the ATSs that run
  hospitals, insurers, manufacturers, retail):
  - **Midwest +21** (catalog 17 → 38): Cleveland Clinic, OhioHealth, Nationwide Children's, Bon Secours
    Mercy (Cincinnati), Corewell, Trinity, Advocate, Sanford, Gundersen, ThedaCare, Kettering, Carle, OSU
    Physicians, The Methodist Hospitals, Children's Mercy KC, Ascension WI, Aspire Indiana, Benedictine +
    Nationwide (insurance), Caterpillar (manufacturing), Kohl's (retail).
  - **Southeast (new region coverage) +11**: Vanderbilt UMC, Ochsner, Baptist Health (KY / Jacksonville /
    Montgomery), AdventHealth, Methodist Le Bonheur, Prisma, Piedmont, Bayfront + Lowe's.
  - **Southwest +3**: Cook Children's, USAA, Banner Health.
- Each was verified live **against Jobdar's own Workday/iCIMS providers** (not just curl) and its identity
  confirmed by job location — excluding token traps (e.g. an HCA tenant serving only UK roles, Aurora-NJ
  vs Aurora-WI) and JS-only/empty boards the zero-token path can't read.

### Fixed
- **`jobdar seed` curation filters**: `--sector` is now honored, and `--metro` matches case-insensitively as
  a *contains* (so `--metro Cincinnati` finds "Cincinnati, OH"), with `;` separating multiple metros
  (a metro is itself "City, ST", so the old comma-split was wrong).

### Notes
- These are large employers — a full multi-region scan now fetches a lot. Curate with
  `jobdar seed --region <r> [--sector healthcare] [--metro "Cincinnati"] --write`, or scan one via
  `jobdar scan --company "<name>"`. Some systems run Taleo/Phenom/Oracle (not Workday/iCIMS) and were
  excluded; a couple of iCIMS tenants are JS-only and need `--playwright`.

## [1.7.0] — 2026-06-05

Expanded the Midwest seed catalog with smaller & midsize employers — markets where applicant
competition is lighter (the career-ops "apply local/smaller first" strategy).

### Added
- **12 live-verified Midwest employers** in `data/seed/employers.yml` (catalog goes from 5 → 17):
  **84.51°** (Cincinnati), **Path Robotics** (Columbus), **May Mobility / Censys / Workit Health**
  (Ann Arbor), **Greenlight Guru** (Indianapolis), and **SpotHero / Amount / Sprout Social /
  Civis Analytics / Cameo / Kalderos** (Chicago).
- Each was verified live against the Greenhouse API and its identity confirmed by job location, so token
  collisions (e.g. `relativity` → Relativity **Space** in California) and offshore-only boards (Sezzle,
  Nerdy) were excluded rather than added blind.

### Notes
- `jobdar seed --region midwest --write` materializes all 17 into `config/portals.yml`. A live scan
  discovered **~120** entry/mid Midwest + remote-US roles across them (up from ~48) — much of the new
  volume from less-fierce metros (Columbus, Ann Arbor, Indianapolis).

## [1.6.0] — 2026-06-05

Provider parity: Greenhouse, Workday, and iCIMS now share one contract — uniform discovery + an
eval-time JD fetch — so evaluation works the same regardless of which ATS a role came from.

### Added
- **`fetchJob(url)` on every provider** — pulls one role's full job description for the model's `eval`:
  Greenhouse via the board detail API, Workday via the CXS `…/job{externalPath}` detail endpoint, iCIMS
  via the role page's JSON-LD (in the `?in_iframe=1` view, where the JobPosting actually lives). A new
  `fetchJobDescription(url)` registry helper routes any job URL to the right provider.
- **`jobdar eval <url>` now fetches the JD for you** and prints it, so the model can score it without its
  own fetch tool (and the API / on-device backends in Phase 8 get the JD uniformly). Verified live:
  Greenhouse ~5.5k, Workday (Salesforce) ~7.5k, iCIMS (Covenant Health) ~4.1k chars.

### Changed
- **Discovery is now uniform across all three providers** — `fetch()` returns the same lightweight shape
  (`title · url · company · location · postedOn`, no JD). Greenhouse no longer pulls full descriptions in
  its bulk list (dropped `?content=true`), so scans are lighter; the JD is fetched per-role at eval time.
- `decodeEntities` now also handles `&nbsp;`, so stripped JD text reads cleanly.

### Notes
- iCIMS JD coverage is best-effort (JSON-LD in the iframe view); JS-only tenants still need `--playwright`.
  Workday and Greenhouse JDs come straight from their JSON endpoints.

## [1.5.0] — 2026-06-05

Scan-vs-score split (career-ops architecture): the deterministic tool only **discovers** roles — the
**model** scores them. No score appears anywhere until an actual `eval` has run.

### Changed
- **`scan` no longer scores.** It discovers + filters roles (by level — including the executive drop — and
  region) and writes them to the pipeline as `status: scanned` with **no fit score**. The old
  "Scored N → Apply/Research/Don't" summary is gone; scan now points you to `eval`.
- **`jobdar tui` shows discovered roles as "pending eval"** — no band/score until the model has scored
  them. Evaluated roles show the model's score + Apply/Research/Don't band, color-coded; a new `p` key
  filters to pending. (The web `dashboard` only ever showed the application tracker — unchanged.)
- The eval rubric (`modes/_shared.md` + `modes/eval.md`, EN + ES) now scores on the **0.0–5.0** scale with
  **Apply / Research / Don't** bands (was 0–100 / Strong-Good-Stretch-Skip), matching the pipeline + TUI.

### Added
- **`jobdar eval` is no longer a stub.** Evaluation is model-backed (run it via your AI CLI); the model
  records its verdict with **`jobdar eval --save --url <u> --score <0.0–5.0> [--band …] [--company …]
  [--role …] [--note …]`**, flipping the row to `status: evaluated`. Discovery stays authoritative for
  company/role/location, and a re-scan never clobbers a recorded verdict.
- Pipeline store reshaped to `company · role · url · location · score · band · recommendation · status ·
  updated`, read by header name (tolerant of older files).

### Removed
- The **deterministic fit scorer** (`lib/scoring.mjs`) and its résumé/location/salary/seniority composite.
  Level-fit is still enforced as a **filter** (executive / above-target titles are dropped during `scan`),
  but judging fit is the model's job now. Recoverable from git if a deterministic pre-rank is wanted later.

### Notes
- Delete or re-scan `data/pipeline.tsv` to move to the new shape; `scan` regenerates it.

## [1.4.0] — 2026-06-05

Scoring tuning — surface only the roles your résumé could realistically land. Fixes a case where a
**Vice President, Product** role scored **4.1 (Apply)** under an entry/mid target, and where a broad
résumé matched almost every role equally.

### Added
- **Executive tier in level classification** (`lib/levels.mjs`): VP / SVP / EVP / "Vice President" /
  President / Chief / C-suite / "Head of" / Director / GM / Founder now read as `exec` — always above the
  highest selectable level, so they're filtered out of an entry/mid (or even senior) scan. The old
  `SENIOR` rule only matched the abbreviation `vp`, so a spelled-out "Vice President" slipped through as
  "unclear" and could ride a keyword match into Apply.
- **Level-fit gate in scoring** (`lib/scoring.mjs` → `levelCap`): a role above your top selected level is
  hard-capped into the **Don't** band (one level over → 2.5; two+ → 1.0), so seniority is a real gate —
  not one weighted term a high keyword overlap can outvote.

### Changed
- **Résumé fit now drives the score and actually discriminates.** Greenhouse postings carry the full JD
  through to scoring — the provider requested `?content=true` but was *dropping* `content`, so fit was
  computed on the **title alone** and saturated at 5.0 for every role. The fit score is now
  **title-dominant and de-boilerplated** (generic JD language like "stakeholder / cross-functional /
  strategy" no longer inflates a match), with lenient stem matching so "architect" lines up with
  "architected". Default `score_weights` rebalanced to **résumé 0.7 / location 0.15 / seniority 0.1 /
  salary 0.05** — after the level + region filters run, location and seniority are near-constant, so fit
  should lead the ranking.
- **Unknown salary drops out** of the composite (renormalized) instead of injecting a flat 3.0 that
  inflated every score; the above-target seniority penalty is steeper; an unclear title scores a cautious
  3.0 (was a near-pass 3.5).

### Notes
- The deterministic fit score is a **coarse first-pass filter**, not the final word: it ranks true fits to
  the top (product / data / engineering) and sinks off-domain roles (marketing / legal / sales / finance),
  but a few keyword coincidences can still reach Apply. Run **`jobdar eval <url>`** for the model's
  semantic fit — the real "would this résumé land it?" read (on-device model arrives in Phase 8).
- Re-run `jobdar scan` to re-score your pipeline under the new tuning.

## [1.3.1] — 2026-06-05

### Fixed
- Stale **"Status:" banners** at the tops of `README.md`, `README.es.md`, `AGENTS.md`, `CLAUDE.md`,
  `commands/jobdar.md`, and `.agents/skills/README.md` still read "Phase 0 scaffold" / "Phase 1" — they
  now reflect **Phases 0–7 complete (1.3.x)**. Notably, `commands/jobdar.md` no longer claims the `modes/`
  brain is "skeletons until Phase 1"; it's fully authored (EN + ES). Docs-only — no code change.

## [1.3.0] — 2026-06-05

Résumé build (career-ops "Customize" stage) — completes the pipeline shape: **scan → score → build**.

### Added
- **`jobdar pdf [company]`** — renders your `cv.md` into a clean, **ATS-friendly HTML résumé** (single
  column, standard fonts, semantic headings, no tables/images) under `output/`, tailored/flagged to a
  pipeline role (`--company` / `--url` / positional). Renders to **PDF when Playwright is installed**
  (lazy-imported, opt-in — the heavy dep stays optional); otherwise writes the HTML to print yourself.
- `lib/cv_render.mjs` (zero-dependency markdown → ATS-HTML + role keyword matching). Deep content
  tailoring stays the model's job (the `apply` mode); this stage renders it. `jobdar pdf` is no longer
  a stub.

## [1.2.0] — 2026-06-05

Scan → **score** pipeline (career-ops method): scanned roles are scored 0.0–5.0 and surfaced in the TUI.

### Added
- **Scoring engine** (`lib/scoring.mjs`): a 0.0–5.0 weighted composite from four dimensions — résumé,
  location, salary, seniority — mapped to **Apply (≥4.0) / Research (3.5–3.9) / Don't (<3.5)** bands,
  used as a filter. Location/seniority/salary are deterministic; the résumé dimension is a keyword
  *estimate* (flagged) until a model eval replaces it. Weights are editable in `profile.yml`.
- **Salary** in `jobdar init` + `profile.yml` (`target_salary`, `score_weights`).
- **Scored pipeline store** (`lib/evaluations.mjs` → `data/pipeline.tsv`): one row per job (url · 4
  sub-scores · composite · band · status), deduped by URL, status preserved on re-scan.
- `jobdar scan` now scores every kept role and writes the pipeline, reporting Apply/Research/Don't counts.
- `jobdar tui` now surfaces the scored pipeline: color-coded by band, sort (score / company / band) and
  filters (1/2/3 band · 0 all · c company), with band counts.

### Notes
- Without a `cv.md` and a `target_salary`, those two dimensions read neutral (3.0), so roles cap around
  3.9 (Research) — add them (or run a model eval) to surface Apply-tier roles.

## [1.1.0] — 2026-06-05

### Added
- **`jobdar tui`** — an interactive, zero-dependency terminal dashboard: region/level/language, a
  scrollable application tracker, and the configured portals. Keys: `r` refresh, `q` quit, ↑/↓ scroll.
- The **web dashboard** now lists each portal (company · provider · clickable career link), shows a
  name pill, and auto-refreshes.
- The dashboard link is surfaced everywhere — after `init`/`scan` and in the agent layer (AGENTS.md +
  scan mode): `jobdar tui` or `jobdar dashboard` (http://localhost:4319).

### Fixed
- `jobdar init` no longer skips prompts at a real terminal (stray type-ahead was consumed by the next
  question, blanking the name). Selecting "My own API key" now prompts for the key and stores it in a
  **gitignored** `data/credentials.env` — never in the tracked `profile.yml`.

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
