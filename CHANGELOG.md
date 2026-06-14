# Changelog

All notable changes to Jobdar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Jobdar adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.21.0] — 2026-06-14

**Phase 8c — document understanding — + the light AI pre-confirm (the Search-tab queue thinner).**
Verified end-to-end on-device (winc / Qwen3.5-4B) with two real résumés.

### Added
- **`lib/docparse.mjs` (8c.1):** deterministic text extraction — DOCX via the system `unzip`
  (word/document.xml, macOS `textutil` fallback), PDF via `pdftotext` when present (else an honest
  DOCX/text hint), `.txt`/`.md` passthrough; near-empty/image PDFs fail honestly (8c.4). No new npm
  deps; the web/serverless path swaps unpdf/mammoth in behind `extractText()`.
- **`jobdar import <file>` (8c.2):** extract locally → the inference backend structures the PROFILE
  (name / metro / level / skills) → writes `data/cv.md` (the real extracted text — the model NEVER
  rewrites the résumé) + a prefilled `config/profile.yml`; confirm summary, saves on `--write`. Falls
  back to a deterministic heuristic with no backend. `jobdar eval <file.pdf|docx>` (8c.3) reads a local JD too.
- **Light AI pre-confirm (`eval --auto --confirm`):** a cheap on-device yes/maybe/no triage between the
  zero-token `prescreen` and the heavy decomposed `eval` — skips clearly-wrong roles (with a quoted
  reason, never silently) to cut full-eval passes. This is the Phase 9 Search-tab thinner, shared by CLI + app.
- 4 new offline tests (91 → 95). EN/ES parity maintained.

### Verified on-device
Imported `Dotson_Samuel_Project_Manager.docx` and `Jacob_Homer_HR_Resume.docx` on winc — each parsed to a
distinct structured profile. On a Creative & Design Operations Lead role: Sam's PM résumé scored 2.1
(Don't); Jacob's HR résumé was pre-confirm-skipped ("HR vs Ops/Design mismatch") with no wasted eval —
the queue-thinning working as designed. Zero external network on the eval path.

Remaining Phase 8: 8a.9 (escalation, optional), 8d (offer + keyless BLS pay), 8e (engine contract).

## [1.20.0] — 2026-06-14

**Phase 8a — automated evaluation (the daily-use unlock); Phase 8 is now feature-complete (8a + 8b).**
Jobdar scores roles itself: the MODEL judges fit on a decomposed rubric while CODE owns the number and
the gates. Live-verified against `winc serve --eval` (Qwen3.5-4B) — the model returned conformant
decomposed JSON and the §3 pipeline clamped a non-matching role to Don't.

### Added
- **`lib/eval_engine.mjs` — the §3 eval pipeline:** normalizeDates → extract (prescreen) → gate (screen)
  → judge (model, fit-only) → clamp (+merge pay) → verdict. The model rates 5 weighted sub-criteria
  (skills 35 / experience 25 / level-fit 20 / logistics 10 / education 10) strong/partial/none with quoted
  evidence and fills a requirements-check block FIRST (8a.4b) against facts prescreen already extracted;
  CODE computes the 0–5 (`scoreFromJudgments`) and applies the shipped band thresholds (8a.4). A hard gate
  or unmet requirement clamps to Don't — reusing `prescreen` + `levels` (no new `gate.mjs`); the eval JSON
  never contains a salary number — pay is merged post-model from `lib/salary.mjs`. Robust JSON parse with
  optional `response_format` guaranteed-JSON (8a.4a). Fairness (8a.6): the CV slice is PII-stripped and a
  degree requirement never auto-zeros under `no_degree`.
- **`jobdar eval --auto [<url> | --next | --all-pending]` (8a.1–8a.3)** — scores roles against the
  configured backend and records each verdict via the existing `--save` path; walks the prescreen-ranked
  queue, one JD per request; minimal-slice (JD + PII-stripped CV excerpt only).
- **`jobdar calibrate` (8a.5)** — opt-in live scorer over a hand-banded set (`data/calibration.json`),
  reporting per-tier band agreement; every clamp override is logged to a gitignored `data/clamp-log.jsonl`
  (no CV text). The pure agreement/scoring functions are unit-tested; the live scorer is a command, never `npm test`.
- **Batch economics (8a.7) + prompt caching (8a.8):** `eval --auto --all-pending --batch` submits one
  Message Batches job on the api backend (50% price) instead of N live calls; the byte-stable rubric prefix
  is marked `cache_control` on the api path. (`lib/eval_ops.mjs` + `inference.submitBatch`.)
- 19 new offline tests (74 → 93) via loopback mocks — scorer, clamp/gate, pay-merge, no-degree fairness,
  JSON parse, batch wire-format, agreement. Still fully offline; EN/ES parity maintained.

### Fixed
- Hardening from an adversarial review (15 findings triaged): the CV PII-strip no longer eats résumé date
  ranges like `2019-2023` (it matched them as phone numbers, corrupting the experience/level-fit signal);
  `eval --auto <url>` now scores the named URL (the value-less flag had swallowed it into `flags.auto`);
  `clampVerdict`/`buildEvalUser` are null-safe on partial gate objects and `clampVerdict` accepts stringy
  negatives; `parseEvalJson` falls back to a balanced-brace scan past trailing prose; the batch path counts
  JD-fetch failures and attributes the model; `submitBatch` checks every HTTP status; `bandAgreement`
  ignores out-of-tier expected bands; and stale "next: Phase 8a" framing was cleared from AGENTS.md + the
  ROADMAP banner.

Deferred: 8a.9 (targeted escalation ladder) — the roadmap marks it optional; a follow-up. The grammar-JSON
path (8a.4a) is wired but defaults to robust prompt-parse on backends without `response_format` (this
machine's winc.cpp jobdar.3).

## [1.19.0] — 2026-06-13

**Phase 8b — on-device inference via winc.cpp (the new default backend).** The model becomes a swappable
backend: the same evaluation brain runs against a fully local model with no key and no cost. Verified
end-to-end on macOS against a live `winc serve --eval` (Qwen3.5-4B) — `/health` + a real eval round-trip
scoring a canary role, zero external network.

### Added
- **`lib/inference.mjs` — one Messages-API client for both backends.** winc.cpp serves `/v1/messages`
  natively on localhost, so a single tiny client covers local and api (BYO key) — only the base URL and
  auth header differ. `resolveBackend`/`selectActive` resolve `inference: local | api | auto` (auto =
  local when winc is up, else api when a key exists); `backendHealth` probes `GET /health`; `evaluate`
  runs one role and `parseVerdict` reads the modes/eval.md score/band/recommendation; the Messages-API
  `usage` block is captured for per-eval token transparency. Loopback-only for the no-TLS local path;
  HTTPS + key enforced for api.
- **`jobdar backend` command (EN/ES)** — `backend` (status: backend, URL, live-or-not), `backend --check`
  (the verification gate: `/health` + one real eval round-trip, printing score/band/model/tokens), and
  `backend --install` (delegates the model pull + serve to winc; jobdar orchestrates + verifies, and
  prints the exact install path when winc is absent).
- **8b.3 — alternate local runtimes (Ollama / llamafile).** `inference_runtime: winc | ollama | llamafile`
  behind the same interface: winc speaks the Messages API; Ollama/llamafile speak OpenAI chat-completions,
  so a `callOpenAI` shim (with the usage block mapped back to the Messages shape) covers them. Per-runtime
  default URL + liveness path (Ollama has no `/health` → `/api/tags`); new `local_model` field for the
  runtimes that need a model id (winc `--eval` auto-picks). winc stays the documented happy path. 10 new
  offline tests via loopback mock servers (74 → 85 passing, still no network).

### Changed
- **Default backend flipped to `local` (winc.cpp)** in `PROFILE_DEFAULTS` and the `jobdar init` wizard
  (local is now listed first and is the default; api is the opt-in accuracy upgrade) — private, no key,
  no cost out of the box. New `inference_url` profile field (blank → winc default `http://127.0.0.1:8080`).

### Fixed
- Hardening from an adversarial review (21 findings triaged): `parseVerdict` now reads the band from the
  score line's tag only (preamble prose like "don't rule it out…" can't hijack it) and rejects
  off-rubric numbers (a `10`/`50` from a drifting model is unparsed, not a truncated wrong score);
  `resolveBackend` threads the injected env to the API key (true pure function); `callMessages` never
  stringifies an odd content shape to `[object Object]`; the `--check` canary points at `winc serve
  --eval` when a healthy server replies empty (the bare-`winc serve` trap); and stale "Phase 8 / arrives
  in Phase 8" framing was cleared from `init`, `AGENTS.md`, `SECURITY.md`, `docs/legal.md`, and ROADMAP 6.4.

Scope notes: 8b.5 (confidential-cloud) remains future (documented-only); the full
`eval --auto` batch UX is Phase 8a, which reuses this exact client with a different base URL. winc.cpp
itself ships from its own repo (the `winc-jobdar` branch) — these are the Jobdar-side integration pieces.

## [1.18.1] — 2026-06-13

Patch: harden Phase 7.8 against 7 findings from an adversarial multi-agent self-review — all latent at
shipped defaults (none broke the 1.18.0 tests), now covered by new regression assertions.

### Fixed
- **`lib/html.mjs decodeEntities` is single-pass** — no double-decode of `&amp;#x…;` (stays `&#x…;`),
  and capital-`X` hex entities (`&#X2014;`) decode correctly.
- **`lib/dates.mjs normalizeResumeDates` fires only in a true range context** (right after a dash, or a
  4-digit year + connector), so résumé prose like "promoted to present role", "to current standards",
  or "present-day" is no longer rewritten to a date. `monthYear` rejects an out-of-range month (`2026-13`)
  instead of clamping it.
- **`lib/prescreen.mjs blendSalary` floors the blend at 1** — a high `score_weights.salary` can no longer
  push a non-screened, below-target role to score 0 (where 0 means "screened"). The 4.5-honesty
  invariant — pay nudges rank but never screens a role out — now holds at any weight.

## [1.18.0] — 2026-06-13

**Phase 7.8 — deterministic data quality (salary, dates, dedup).** The zero-token cleanup pass before
the Phase 8 inference work: it makes the pipeline's pay, dates, and rows trustworthy without a model.
Validated against a 100-JD corpus fetched live from 17 Greenhouse boards on macOS (committed as the
acceptance set), then adversarially verified — 95% extraction precision after the fixes below.

### Added
- **`lib/salary.mjs` — deterministic STATED-pay extraction (7.8.1, rec-spec §1).** `extractPay(jd)`
  reads pay via five ordered rules (hourly range ×2080, single hourly, annual range with K-suffix +
  20k–600k sanity bound, single annual, location-tiered non-HCOL selection for a Midwest/SE
  candidate); the model never produces a number. `bandVsTarget(pay, target)` scores fit against
  `target_salary` with a **lenient `near` band** — a role whose top pay is within `SALARY_TOLERANCE`
  (5%) under target is caught (not rejected) at a slightly reduced score, ramping linearly to 0 at
  `SALARY_FLOOR` (15%) under. Bands: **above / within / near / below**. Wires the previously-dormant
  `target_salary` + `score_weights.salary`. **Never a gate** — pay only nudges the prescreen rank.
- **`lib/dates.mjs` — résumé date normalization (7.8.2, rec-spec §3a).** `normalizeResumeDates(text,
  today)` resolves an open-ended "Present"/"Current" in a date range to today's month-year (prose
  untouched), so an eval can't misread "Mar 2025 – Present" as future employment. `jobdar eval` now
  prints the current date; `modes/eval.md` instructs the model to use it.
- **Near-duplicate dedup (7.8.3, rec-spec §5).** `mergeScanned` now collapses a second posting of the
  same role (normalized company + title + canonical metro, via the new `regions.mjs canonicalLocation`)
  into an **alias on the survivor** (tracked > evaluated > earliest first-seen) instead of a duplicate
  row; `recordEval`/`recordPrescreen`/`setStatus` resolve an alias URL to its survivor before writing,
  and `prune` keeps a survivor whose alias is still live. New `pay` + `aliases` pipeline columns.
- **Committed salary acceptance corpus** at `test/fixtures/salary-corpus.json` (100 live JDs) + 13 new
  offline tests covering the five rules, leniency, false-positive guards, entity/USD ranges, dedup,
  dates, and `canonicalLocation`. `npm test`: 74 passing, 0 failing, still fully offline.

### Fixed
- **`lib/html.mjs decodeEntities` now decodes `&mdash;`/`&ndash;` (and `&rsquo;`/`&ldquo;`/`&rdquo;`/
  `&hellip;`/`&bull;`/`&deg;`/… + hex `&#x…;`).** Greenhouse encodes salary ranges as
  `$73,125&mdash;$117,000`; leaving the dash entity undecoded made a range parse as its floor only —
  it silently truncated 34% of extractions in testing. The fix helps every JD consumer, not just pay.
- Salary extraction is robust to a `USD`/`US$` suffix between a figure and the separator
  (`$143,000 USD - $177,000 USD`), rejects OTE/on-target-earnings ranges as base pay, rejects bare
  numeric ranges (percentages, year-counts, headcounts), and skips foreign-currency figures.

### Changed
- **`modes/_shared.md` (+ Spanish peer): removed the stale `lib/scoring.mjs` pre-score reference
  (7.8.4)** — that module was already deleted; over-experience screening is the zero-token prescreen
  (`YEARS_CEILING`), and the model does the nuanced read. Documented the new STATED-pay band there and
  in `modes/eval.md`. `target_salary`/`score_weights.salary` are now live (no longer dead config).

## [1.17.1] — 2026-06-13

Roadmap: resolve the two open build-blocking decisions so Phase 7.8/8 implementation starts unblocked.
Planning only — no code.

### Changed
- **Eval bands DECIDED:** the eval verdict uses the **shipped** `lib/evaluations.mjs` `BANDS`
  (Apply ≥ 4.0 / Research ≥ 3.5 / else Don't). The 8a.4 draft's ≥3.5/≥2.0 is dropped; the reconcile
  warning is removed.
- **BLS data source DECIDED — keyless OEWS bulk download, no key, no account.** Verified that the BLS
  v2 API requires per-user registration (not out-of-the-box) and keyless v1 caps at ~10 requests/day,
  while OEWS data is a keyless direct download (XLSX/TXT at `download.bls.gov` / `bls.gov/oes`). So 8d.2
  ships a national-by-SOC seed floor + grows `data/cache/wages.yml` from keyless bulk downloads sliced
  locally; 8d.2b's `lib/bls.mjs` drops all API-key/registration logic; SECURITY.md outbound hosts become
  `download.bls.gov` / `www.bls.gov`. Open Decision #8 resolved; the 8d Risk row narrows to bulk-file
  size/format/cadence.
- **New governing principle — "out of the box with winc":** no feature may require an external account
  or manual key generation to work; prefer the keyless path even at the cost of more code. Operationalized
  by 8b.0 (auto-install), 8b.4 (local inference default), and 8d.2 (keyless wages).

## [1.17.0] — 2026-06-13

Roadmap: reconcile with the updated `rec-spec.md` + winc-jobdar `1.21.3-jobdar.4`. Planning only — no
code. Brings the measured §3 eval-pipeline refinements (a 72-eval A/B/C/D study) and the now-shipped
winc grammar path into the Phase 8 plan so implementation can begin against a flush roadmap.

### Added
- **8a.4a — grammar-constrained structured output:** the eval call uses winc's
  `POST /v1/chat/completions` with `response_format=json_schema` (the 8a.4 schema) for guaranteed valid
  JSON. **Winc side is already shipped** (winc-jobdar 1.21.3-jobdar.4: the eval profile advertises the
  endpoint on ready; the router preserves `response_format` across both paths, regression-tested). Other
  jobdar calls stay on `/v1/messages`.
- **8a.4b — in-band requirements-check (measured win):** the eval schema adds a `required` block
  (`{min_years, certs[], degree, candidate_meets_all}`) filled FIRST; best form passes prescreen's
  quote-backed requirements into the prompt and has the model fill only `candidate_meets_all`. Measured
  +reqcheck: Qwen-4B 4/6→6/6, gemma 2/3→3/3, Qwen-2B 1/3→2/3 gating (~+90 tokens). Few-shot examples
  **rejected** (backfired — leniency + JSON corruption 6/6→4/6).
- **8a.9 — targeted escalation ladder (optional):** run gemma on every role, re-score only borderline/
  negative verdicts on Qwen-4B — recovers the small model's over-strict misses without paying 4B latency
  everywhere.
- **8a.4 cert gate:** extend `lib/prescreen.mjs extractLicense` to promote a stated-**required** cert
  (e.g. "PMP required") from flag → hard gate for users who lack it.

### Changed
- **winc dependency pinned to `1.21.3-jobdar.4`** (was jobdar.3) and the 8b contract note now documents
  **two surfaces** — `/v1/messages` (general) + the guaranteed-JSON `/v1/chat/completions` eval path.
- Milestone-table eval-tuning range widened `8a.4–8a.8` → `8a.4–8a.9`.
- `rec-spec.md` now carries a STATUS header marking it absorbed into the roadmap (roadmap is
  authoritative; the doc remains the measured evidence + the winc-side contract).

## [1.16.0] — 2026-06-13

Roadmap: fold in the 2026-06-13 eval + pay-data study (`rec-spec.md`) and pin the winc dependency to
the `winc-jobdar` branch. Planning only — no code yet; every item is a roadmap step for the phases
below. Verified against the live code + the newest winc-jobdar (`1.21.3-jobdar.3`) by a 7-track
cross-analysis.

### Added
- **NEW Phase 7.8 — Deterministic eval-precision primitives (zero-token, NEXT BUILD, before Phase 8):**
  `lib/salary.mjs` (deterministic pay extraction + `bandVsTarget`; the model never produces a number),
  `lib/dates.mjs` (résumé date normalization — fixes the "Mar 2025–Present read as future" defect),
  near-duplicate dedup in `mergeScanned` (company+title+canonical-location, alias-on-survivor), a
  config/rubric cleanup of the removed-`lib/scoring.mjs` residue, and the Windows test-fixture
  migration. Drawn from the study's measured defects; reuses the shipped prescreen conventions.
- **Phase 8b — new step 8b.0:** `jobdar backend --install` one-command bootstrap (winc setup → tiered
  model pull → `winc serve --eval` → `/health` canary), target fully-featured < 10 min; the Phase 9
  first-run prototype. Plus the cross-repo ask for prebuilt `-jobdar.N` releases.
- **Phase 8d — new sub-steps 8d.2a/8d.2b:** `lib/pay.mjs` three-layer `resolvePay` (stated → comparable
  → BLS, mandatory source label) and `lib/bls.mjs` on-demand fetcher with a national-adjusted fallback;
  the §2c hard split (model routes SOC/seniority, software owns every number).
- **New Open Decision (#8):** BLS API-key model (recommend ship-no-key + national seed floor +
  user-paste on init). **New Risk row:** BLS live-API-vs-annual-bulk + rate-limit + new outbound host.

### Changed
- **Phase 8 reordered earlier still:** Phase 7.8 (zero-token) now precedes the 8b winc build; the
  milestone table renumbers around it.
- **8b dependency pinned to the `winc-jobdar` branch** (`1.21.3-jobdar.3`) + `winc serve --eval`; the
  stale "origin/master v1.4.5 / `winc serve`" note is replaced (master is now v1.21.2, and bare `serve`
  runs reasoning ON → empty content). 8b.2 liveness = `GET /health`; model choice delegated to winc's
  tiering (gemma4-e2b < 5 GiB / qwen3.5-4b ≥ 5 GiB; qwen3.5-2b floor-only). 8b.1 surfaces Messages-API
  `usage` as a per-eval cost; 8b.4 flips `PROFILE_DEFAULTS.inference` `api`→`local` (Open Decision 2).
- **REVISE 8a.4:** lock the eval JSON to exclude `salary_fit` (band merged post-model); the requirement
  gate/clamp **reuses the shipped `lib/prescreen.mjs` extractors — no new `lib/gate.mjs`**; reconcile the
  draft band thresholds (Apply ≥3.5) against the shipped scale (`BANDS`: Apply ≥4.0 / Research ≥3.5).
- **REVISE 8a.5:** add the clamp-override log + per-tier agreement; move the live-backend scorer out of
  `npm test` into an opt-in `jobdar calibrate` (preserves the offline-test invariant).
- **REWRITE 8d.2:** from a static shipped `data/seed/wages.yml` to an on-demand growing
  `data/cache/wages.yml` (+ a small national-by-SOC seed floor); preserve the metro COL index 8d.3/8d.4
  depend on.

## [1.15.0] — 2026-06-12

Phase 7.7 — apply-likelihood. Stop evaluating jobs you were never going to get; start warming up
the ones you might. Built from real beta pain (evals wasted on hard-gated roles).

### Added
- **`jobdar prescreen`** (`lib/prescreen.mjs`, `lib/commands/prescreen.mjs`) — the zero-token gate
  between scan and eval. Fetches each pending role's JD politely (sequential, 800 ms pacing) and:
  - **screens hard gates with a QUOTED reason** — years-required vs your level(s) (entry >2 /
    mid >5 / senior >10; the lowest stated floor counts; "10 years of innovation" never matches),
    an ACTIVE security clearance (TS/SCI etc.), and degree gates (`yes/no/unclear`, with
    "or equivalent experience" downgrading to unclear). Under `no_degree` a degree ask flags a
    stretch and **never** screens (the 4.5 rule); `include_degree_required_roles: false` makes it
    a screen. Soft signals (obtainable clearance, no-sponsorship, license/cert) only flag.
  - **ranks the rest 0–100** by skill overlap (cv.md ∩ JD vocabulary, identical extraction on both
    sides) + posting freshness (`posted`/`first_seen`) + headroom minus soft flags. An unreachable
    JD scores neutral and is never screened.
  - Nothing is hidden silently: screened rows keep `screen_reason` on the pipeline (new
    `prescreen` + `screen_reason` columns; old pipeline files read fine), print with their quoted
    reason, and `eval --next --include-screened` re-admits them.
- **`eval --next` now serves the prescreen-ranked queue** (likelihood desc, then freshness) and
  skips screened + human-tracked rows by default; tells you how many are screened out and why.
- **`jobdar outreach`** (`lib/outreach.mjs`, `lib/commands/outreach.mjs`) — the referral lever,
  polite by construction:
  - **people-finder**: deterministic LinkedIn people-search LINKS (recruiters/TA; likely hiring
    manager via a level-stripped role title; company people). The user browses and picks —
    **Jobdar never scrapes LinkedIn and never sends a message.**
  - **cadence enforced in code**: a gitignored ledger (`data/outreach.tsv` — name/title/channel/
    date only) caps contacts at 2 per role, one thread per person, ONE follow-up ripe after ≥5
    business days (`--due` says when), hard stop after — no override flag exists for the stop.
  - **draft lint** (`--lint <file|->`): rejects >300-char LinkedIn notes, leftover
    `{placeholders}`, and drafts missing the recipient's name. Refusals exit non-zero.
- **modes/outreach.md + modes/es/outreach.md** — full paste-to-personalize flow: the user pastes a
  person's public headline; it feeds ONE draft and is never written to disk (on the winc.cpp
  default backend it never leaves the device at all). Cadence + lint steps spelled out for the
  model; EN/ES parity maintained, 47 new i18n strings per language.
- 11 new tests (62 total): gate extraction, screen decisions, scoring, queue ordering, pipeline
  columns, people-finder links, business-day math, cadence enforcement, draft lint.

### Changed
- **ROADMAP restructured: Phase 8b (winc.cpp on-device inference) is now the NEXT build**, ahead
  of 8a — it's the default backend everywhere and the engine the Phase 9 web + iOS/Android apps
  embed. 8a follows as the opt-in accuracy upgrade and gains two steps: **8a.7** bulk evals via
  the Message Batches API (one role per request — never multi-JD prompts — at 50% price) and
  **8a.8** prompt-caching the byte-stable rubric+CV prefix. New Phase 7.7 section records this
  release.

### Fixed
- `bin/jobdar` now respects a command's `process.exitCode` — refusals (outreach cadence, tracker
  `--set` misuse) previously printed an error but exited 0.

## [1.14.1] — 2026-06-10

Docs: the roadmap now shows at a glance what's shipped — plus the pending portability-test fix.

### Changed
- **ROADMAP completion marks** — every phase now carries an explicit status line (✅ shipped /
  🔶 partial / ⬜ not started), and the two mixed phases mark per step: 0.2 is 🔶 (name locked;
  the trademark/domain/GitHub-org externals stay open — the sole 7.5 blocker), and Phase 7 reads
  7.1–7.4 ✅ / 7.5 🔶 blocked / 7.6 ⬜ ready-to-start. Not-yet-started phases (8a–8e, 9) point at
  their milestone row in the build-order guide. No code changes.

### Fixed
- **Portability test no longer assumes a personal `config/profile.yml` exists** — that file is
  gitignored, so on a fresh clone (and CI) the 1.14.0 test failed even though the code was correct.
  The test now asserts the resolution *rule*: profile present → repo-local home; absent → `~/.jobdar`.

## [1.14.0] — 2026-06-10

Portability: one relocatable user-data home; no path coupling to the install dir.

### Added
- **`JOBDAR_HOME`** — one variable relocates ALL user data (config + data + output). Resolution:
  `JOBDAR_HOME` → repo-local mode (a checkout with its own `config/profile.yml` stays a self-contained,
  movable unit) → **`~/.jobdar`** (the default for global installs, so user data never lives inside
  `node_modules` where an update would wipe it). Per-dir `JOBDAR_CONFIG_DIR`/`JOBDAR_DATA_DIR`/
  `JOBDAR_OUTPUT_DIR` overrides still win. Moving devices = copying one folder — verified end-to-end
  (fresh init → scan → copy home → doctor/tui read everything on the "new device").
- `jobdar doctor` now prints the active user-data home.

### Fixed
- **i18n tables decoupled from the user config dir** — they're a package asset and now always load from
  the install root. Previously, pointing `JOBDAR_CONFIG_DIR` (or running with a fresh home) degraded
  every UI string to its raw key (`cli.usage`). Regression-tested via subprocess.
- `jobdar init` / `jobdar seed --write` create the config dir if missing (first run against a fresh
  `JOBDAR_HOME` / `~/.jobdar` no longer assumes the repo's `config/` exists).
- `jobdar pdf` prints output paths relative to your cwd instead of the install dir.
- Version lockstep: `.claude-plugin/plugin.json` and the doc banners caught up (the 1.13.0 release bumped
  `package.json` only).

### Notes
- Audit found **zero hardcoded absolute paths/usernames** in code or installers; ports are
  flag-overridable. The flaws were all *install-dir coupling*, now removed.

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
