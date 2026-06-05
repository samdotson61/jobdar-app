# Jobdar — Phase-and-Step Roadmap

> A bilingual (American English / Español) US job-search command center for **new grads and people
> breaking into the workforce** — including those without a college degree. **Region-adaptable** (Midwest
> by default; toggle to South, Southwest, Northeast, West, or nationwide) and **entry-level by default**
> (toggle to mid-level, and senior when you choose it). It **scans** company career pages, **evaluates**
> fit against your résumé, **tailors** an ATS-friendly CV/cover letter, and **tracks** every application —
> with your data kept **local**, processed by a **private on-device model by default** or your own cloud API.
>
> **Status:** Phases 0–6 **complete** (`0.7.0`) — the **MVP cut line is done**. Foundation + branding,
> bilingual core, both marquee scanners (Workday + iCIMS, live-verified), level + no-degree tuning,
> region toggle + Midwest seeds + geo filter, and the **bilingual setup wizard** (`jobdar init`, with
> a zero-config first scan). Next: **Phase 7 — quality, dashboard, polish, 1.0**; then Phase 8
> (on-device model) and Phase 9 (web app). See [CHANGELOG.md](CHANGELOG.md).
> **Date:** 2026-06-05 (Phases 0–6 built 2026-06-05)

---

## 0. What we're building, and who it's for

**Jobdar** is a privacy-preserving job-search pipeline: it **scans** company career pages, **evaluates** fit
against your résumé, **tailors** an ATS-friendly CV/cover letter per role, and **tracks** every application.

Jobdar is built first and foremost for two groups of people:

1. **New grads** — college graduates in their 20s landing their first professional role.
2. **People breaking into the workforce** — including those **without a college degree**, career-changers,
   and first-time job-seekers.

**Level of work is toggle-able.** Entry-level is the default focus; a built-in selector adds **mid-level**
as a first-class option, and **senior** is **opt-in** — off by default, but a full first-class target that
ranks on merit (no penalty) the moment you choose it. The only thing ever de-prioritized is a role *above*
the levels you selected.

**Region is toggle-able too.** Jobdar is US-focused and **defaults to the Midwest**, but a built-in region
selector adapts the company seeds, location filters, and search to wherever you are — **Midwest, Northeast,
Southeast, Southwest, West, or nationwide** (plus custom). Midwest is seeded first; other regions fill in
over time.

**Local data, pluggable processing.** Your résumé and history stay **local at rest** — on your machine
(CLI) or in your browser (web app). The model that does the thinking is **swappable**: a lightweight
**on-device model by default** (private, no API key, no cost) for non-technical users; an **API plugin**
(bring your own key — cloud, higher quality, zero-retention) for technical users and anyone who wants more
accuracy; and a **confidential-cloud** option down the line. We never host your résumé — which keeps your
privacy intact and our liability low.

**Two surfaces, one engine.** The **CLI is the backbone** — local-first, for technical users, who run it
with their own AI CLI/API much like today's agentic dev tools. A **web app** for non-technical users comes
later (Phase 9): upload a résumé and get pointed toward fitting jobs with little effort, with evaluation
running **in the browser on a private model by default** (the résumé never leaves the device) and an
API-key upgrade available. Both surfaces share the same scanner, regions, levels, bilingual content, and rubric.

| Dimension | Typical job-search tools | **Jobdar** |
|---|---|---|
| **Primary user** | All experience levels, often senior-skewed | **New grads + people entering the workforce** (incl. no-degree); entry by default, toggle to mid; senior opt-in (full-rank when chosen) |
| **Geography** | National/global, coastal-skewed | **US, region-toggle-able** — Midwest default; Northeast/Southeast/Southwest/West/nationwide |
| **Processing & privacy** | Cloud SaaS — your data on their servers | **Data local at rest**; private **on-device model by default**, opt-in BYO-key cloud API; **we host no résumés** |
| **Surfaces** | One (web *or* CLI) | **CLI backbone now** (technical) + a **friendly web app later** (non-technical) |
| **Languages** | English-only, or token machine translation | **American English (primary) + Spanish (full parity)** |
| **Scanner targets** | Big aggregators / coastal-startup ATSs | **Workday + iCIMS first** (enterprise), plus Greenhouse/Lever/Ashby |
| **Install** | Web SaaS, or developer-heavy CLI | **One-command + interactive wizard; works for non-developers** |

### Core design

- **Two layers.** A zero-token, deterministic Node.js layer (`scan.mjs` + a plugin `providers/*.mjs`
  system, PDF/CV generation, tracker-integrity scripts, a `doctor` setup check) and an AI "brain" of
  Markdown prompt files (`AGENTS.md` + `modes/*.md`) that the chosen model reads to evaluate roles, tailor
  résumés, and prep interviews.
- **CLI is the backbone.** The command-line tool is the core product for technical users and ships first;
  the hosted web app for non-technical users follows in [Phase 9](#phase-9--web-app-for-non-technical-users-future).
- **Local data, pluggable inference.** Data stays **local at rest**. The inference engine is swappable: a
  lightweight **on-device model by default** (private, free), an **API plugin** (BYO key — cloud, higher
  quality, zero-retention) opt-in, and a **confidential-cloud** option later. The zero-token scanner touches
  only public job data, so only evaluation needs a model — which keeps local feasible and cloud cheap. See
  [Phase 8](#phase-8--pluggable-inference-local-default--api-plugin).
- **Region toggle.** US-focused, **Midwest by default**; switch to Northeast/Southeast/Southwest/West/
  nationwide and the seeds, location filters, and search adapt.
- **Level toggle.** Entry by default; mid first-class; senior opt-in (full-rank when chosen).
- **Bilingual, EN-canonical.** English is the base language; Spanish is a full peer. No other locales.
- **Midwest-first scanning, Workday/iCIMS-first.** The two ATSs that dominate US enterprise employers,
  plus Greenhouse/Lever/Ashby — under a region-aware seed catalog.
- **Friendly install.** A guided wizard, a zero-config first scan, and Playwright/PDF deferred until needed.

### The `jobdar` command

One binary, simple subcommands — **`jobdar <command>`** — installed on your PATH (`npm i -g jobdar` or the
one-line installer; `npx jobdar` works with no install):

| Command | What it does | Needs a model? |
|---|---|---|
| `jobdar init` | Interactive bilingual setup wizard (region, level, profile, inference) | no |
| `jobdar scan` | Scan configured portals for new roles (zero-token) | no |
| `jobdar eval <url\|file\|->` | Evaluate a role against your résumé → score + report | yes (inference backend) |
| `jobdar pipeline` | Process pending URLs end-to-end (scan → eval → track) | yes |
| `jobdar pdf [company]` | Generate a tailored ATS CV / cover letter | yes (tailoring) |
| `jobdar tracker` | View / update the application tracker | no |
| `jobdar dashboard` | Launch the pipeline dashboard | no |
| `jobdar doctor` | Validate setup (PDF/Playwright optional) | no |
| `jobdar update` | Self-update | no |

`jobdar --help`, `jobdar <command> --help`, and `jobdar --version` — all bilingual. **Deterministic**
commands (scan, tracker, doctor, init…) run with **no model**; **model-backed** commands (`eval`, `pdf`
tailoring, `pipeline`'s eval step) use the configured **inference backend** — your own API key now, or the
on-device model once [Phase 8](#phase-8--pluggable-inference-local-default--api-plugin) lands.

> **Two ways to drive it:** `jobdar <command>` in your **shell** (direct, scriptable, no AI CLI needed for
> deterministic commands), or `/jobdar <mode>` inside an **AI CLI** (Claude Code / Gemini) for the full
> agentic experience. Same capabilities, same config files.

> **Naming note:** the brief said "iCIMIS" — the platform is **iCIMS** (the recruiting ATS); this plan
> targets iCIMS. **Project name:** "Jobdar" (job + radar) was chosen on 2026-06-05 after screening npm +
> jobs/HR product collisions — it came back clear. Final confirm is Step 0.2 (formal trademark search +
> domain/org grab).

> **Provenance & licensing:** Jobdar is an **independent implementation** built on common, well-understood
> patterns (a plugin scanner, Markdown agent prompts, Markdown/TSV data) — patterns aren't owned by anyone.
> If we ever reuse third-party open-source code, we'll honor that code's license (e.g., MIT requires
> retaining its copyright line in `LICENSE`) — a legal requirement, separate from product branding.

---

## Table of contents

- [Phase 0 — Foundation & branding](#phase-0--foundation--branding)
- [Phase 1 — American-English-first bilingual core](#phase-1--american-english-first-bilingual-core)
- [Phase 2 — Workday provider (the marquee scanner win)](#phase-2--workday-provider-the-marquee-scanner-win)
- [Phase 3 — iCIMS provider (HTML/JSON-LD + Playwright fallback)](#phase-3--icims-provider-htmljson-ld--playwright-fallback)
- [Phase 4 — Level toggle (entry default) + no-degree tuning](#phase-4--level-toggle-entry-default--no-degree-tuning)
- [Phase 5 — Region toggle + seeds + geo tuning (Midwest default)](#phase-5--region-toggle--seeds--geo-tuning-midwest-default)
- [Phase 6 — Effortless install & onboarding for anyone](#phase-6--effortless-install--onboarding-for-anyone)
- [Phase 7 — Quality, dashboard, polish, release](#phase-7--quality-dashboard-polish-release)
- [Phase 8 — Pluggable inference (local default + API plugin)](#phase-8--pluggable-inference-local-default--api-plugin)
- [Phase 9 — Web app for non-technical users (future)](#phase-9--web-app-for-non-technical-users-future)
- [MVP cut line](#mvp-cut-line-fastest-path-to-something-real)
- [Risks & mitigations](#risks--mitigations)
- [Open decisions](#open-decisions-recommendation--alternatives)
- [Technical appendix](#technical-appendix-provider--inference-specifics)

---

## Phase 0 — Foundation & branding

**Goal:** a clean `Jobdar` repo that installs, passes `doctor`, and runs a dry-run scan — Jobdar-branded
throughout, scoped to EN/ES and the entry-default, Midwest-default focus.

| Step | What | Key files |
|---|---|---|
| 0.1 | Scaffold the Jobdar codebase: the two-layer structure (`scan.mjs` + `providers/`, `modes/` + `AGENTS.md`, `config/`, tracker scripts, `doctor.mjs`). Repo + `git init` already done; add `LICENSE`. | repo root, `LICENSE` |
| 0.2 | **Name locked: "Jobdar"** (screened clear on npm + jobs/HR products, 2026-06-05). Final confirm: formal USPTO/EUIPO trademark search; grab `jobdar.app`/`.io` (the `.com` is parked-for-resale) + a GitHub org (`/jobdar` is taken — use e.g. `getjobdar`/`jobdar-app`). | — |
| 0.3 | Jobdar branding + the **`jobdar` CLI entrypoint**: register `bin/jobdar` in `package.json`'s `bin` (so `npm i -g`/`npx` expose a real `jobdar` shell command) with a subcommand router (`jobdar <command>`); the AI-CLI slash command `/jobdar`; env vars `JOBDAR_*`; `.claude-plugin/{plugin,marketplace}.json`; `.agents/skills/`. | `package.json` (`bin`), `bin/jobdar`, `.claude-plugin/*`, all docs |
| 0.4 | Lock scope to **EN/ES only**; default region **Midwest**, default level **entry** — no coastal-skewed default content. | `config/`, `modes/` |
| 0.5 | Make PDF/Playwright **optional** in `doctor.mjs` (warn, don't fail) so a no-PDF first run is green. | `doctor.mjs` |
| 0.6 | Repo hygiene: `CHANGELOG.md` at `0.1.0`, `LICENSE`, `.github/` issue/PR templates + CI, and a `.gitignore` (`node_modules/`, `data/`, `output/`, `reports/`). | `CHANGELOG.md`, `.github/*`, `.gitignore` |

**Verification gate:** `npm install && npm run doctor` passes (PDF shown as optional); `node scan.mjs --dry-run`
runs against a tiny stub `portals.yml` and prints a clean summary; a branding grep shows only `jobdar`.

---

## Phase 1 — American-English-first bilingual core

**Goal:** EN is the canonical language; ES is a full, first-class peer (not a partial translation); no
hardcoded display strings live in code.

| Step | What | Key files |
|---|---|---|
| 1.1 | Author the base "brain" in American English: `AGENTS.md`, `CLAUDE.md`, `modes/_shared.md`, and every base `modes/*.md`. | `AGENTS.md`, `modes/*.md` |
| 1.2 | Establish i18n layout: `modes/` = EN canonical, `modes/es/` = **full** Spanish parity. Add a `language: en\|es` setting in `config/profile.yml` + a per-run override flag. | `config/profile.yml`, `modes/es/*` |
| 1.3 | **No hardcoded display strings in code.** Keep every user-facing literal (pipeline section markers, scan-summary labels, `doctor` lines) in a tiny string table `config/i18n/{en,es}.yml` rather than baked into `scan.mjs`/`doctor.mjs`. | `scan.mjs`, `doctor.mjs`, new `config/i18n/*` |
| 1.4 | Canonical state **IDs** in English (`evaluated/applied/...`); accept ES aliases on input; surface EN labels in data + dashboard. | `templates/states.yml` |
| 1.5 | Bilingual docs: `README.md` (American English) + `README.es.md` (full parity). Language badges 🇺🇸/🇲🇽. | `README.md`, `README.es.md` |
| 1.6 | Bilingual generated output: cover letters, outreach, form answers, and reports follow `language` (or the JD's language) via an EN/ES switch. | `modes/_shared.md`, `modes/apply.md`, `modes/contacto.md` |

**Verification gate:** run a scan + a mock evaluation with `language: en` and again with `language: es`;
confirm `pipeline.md` headers, the scan summary, `doctor` output, and a generated cover letter all render
in the selected language.

---

## Phase 2 — Workday provider (the marquee scanner win)

**Goal:** scan the single most important ATS for US enterprise employers, zero-token, fitting the provider
plugin contract. (Most large employers — manufacturers, retailers, health systems, banks, ag — run Workday.)

| Step | What | Detail |
|---|---|---|
| 2.1 | `providers/workday.mjs` exporting `{ id:'workday', detect, fetch }`. `detect()` matches `*.wd{N}.myworkdayjobs.com` from `careers_url` and parses `tenant` + `site`. | mirror the `greenhouse.mjs` provider shape |
| 2.2 | SSRF guard: host allowlist regex `^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$`, HTTPS-only, `redirect:'error'`. | security parity with other providers |
| 2.3 | **POST** pagination loop against `/wday/cxs/{tenant}/{site}/jobs` with body `{"appliedFacets":{},"limit":20,"offset":N,"searchText":""}`; accumulate `jobPostings[]`; stop when empty or `offset+limit ≥ total`. | the HTTP helper supports method/body — add a `fetchJson` POST convenience |
| 2.4 | Normalize each posting → `{title, url, company, location}`: build the absolute URL from `externalPath` + host; `location` from `locationsText`; capture `postedOn` for later freshness use. | conforms to the `Job` shape |
| 2.5 | Handle Workday quirks: variable shards (`wd1/wd3/wd5/wd101…`), `site` name discovery (`External`, `External_Career_Site`, `careers`) via an optional `site:` field in `portals.yml` + a small probe; polite rate-limit/backoff. | robustness |
| 2.6 | Tests in `test-all.mjs` with fixture JSON: `detect()`, pagination, URL build, **host-allowlist rejection**. Update `modes/scan.md` + portals docs (`provider: workday`, `site:`). | docs + tests |

**Verification gate:** `node scan.mjs --company <tenant> --dry-run` against 2–3 real public Workday tenants
returns normalized postings that pass title/location filters and dedup correctly.

---

## Phase 3 — iCIMS provider (HTML/JSON-LD + Playwright fallback)

**Goal:** cover the second big enterprise ATS (common in healthcare systems, insurers, manufacturers).
Harder than Workday — **no public unauthenticated JSON API**; the official Search/Job-Portal APIs require
OAuth2, so the default path must parse public career pages.

| Step | What | Detail |
|---|---|---|
| 3.1 | Spike: characterize the public iCIMS surface — `careers-{co}.icims.com`, `/jobs/search` HTML, embedded `JobPosting` **JSON-LD**, RSS where present. Decide parse strategy per surface. | research/spike |
| 3.2 | `providers/icims.mjs` (primary path): fetch the search-results HTML and parse — prefer JSON-LD `JobPosting` blocks; fall back to DOM row parsing. Host allowlist `*.icims.com`. Paginate via page params. | low/zero-token where possible |
| 3.3 | **Playwright fallback** for JS-rendered iCIMS widgets: reuse the Chromium liveness infra, **sequential only** (never Playwright in parallel). Gate behind a flag so the default stays light. | reuse infra |
| 3.4 | (Optional, off by default) scaffold the authenticated iCIMS **Job Portal API / Standard XML feed** (OAuth2) for users who have employer/vendor credentials — documented, not required. | future-proof |
| 3.5 | Tests with saved HTML/JSON-LD fixtures; docs + `provider: icims`. | docs + tests |

**Verification gate:** scan 2–3 real iCIMS employers (e.g. a hospital system + a manufacturer); confirm
postings are parsed, normalized, filtered, and deduped — with the Playwright fallback exercised on at least
one JS-heavy site.

---

## Phase 4 — Level toggle (entry default) + no-degree tuning

**Goal:** ship a built-in, toggle-able **level of work** selector — **entry-level by default**, **mid-level**
a first-class option, and **senior opt-in** (off by default, but full-rank when you choose it) — alongside a
genuinely different tuning path for candidates without a degree. This spans the title filter and the rubric.

| Step | What | Detail |
|---|---|---|
| 4.1 | **Level toggle.** Add `target_levels` to `config/profile.yml` — a multi-select of `entry`, `mid`, `senior`. **Default: `[entry]`.** `mid` is fully supported; `senior` is **opt-in** — off by default, but a full first-class target when explicitly selected. The orthogonal **tuning profile** stays: `new_grad` (default), `early_career`, `no_degree`, `career_changer`. | two axes: *level* (toggle) × *candidate tuning* |
| 4.2 | **Level → title filter.** Derive the effective `title_filter` from `target_levels`. `entry` positives: entry, junior, associate, "new grad", "I"/"II", trainee, apprentice, coordinator, assistant. `mid` positives: "II"/"III", specialist, unqualified titles, "3–5 years". `senior` positives: senior, staff, lead, principal. Levels **not** selected become negatives; selecting `senior` re-admits them as **normal targets**. | the filter is generated, not hand-edited |
| 4.3 | **Level-fit ranking (no penalty for a level you chose).** A role *above* the user's highest selected level (filter leakage) is de-prioritized/flagged. **Any selected level — including `senior` — ranks on merit, no penalty.** So the only thing ever downgraded is a role *above* what you asked for; pick senior and senior ranks normally. | `modes/_shared.md` scoring |
| 4.4 | **Level-aware archetypes & strategy.** Entry archetypes (Software/Data/Analyst, Business/Ops Analyst, Customer Support/Implementation, coordinator roles, plus Skilled-trades/technician/apprentice for no-degree & career-changers), a mid-level set, and a senior set — each with a "level strategy". | new archetype tables |
| 4.5 | **No-degree tuning** (a core differentiator): a tuning profile + rubric variant that (a) treats "Bachelor's required" as a *soft* signal, not a hard gate; (b) surfaces "or equivalent experience", apprenticeships, skills-based, cert-friendly roles; (c) reframes the CV/brain around projects, certs, and work history over credentials; (d) never silently hides degree-gated roles — flags them "stretch / worth a shot". | rubric + filter variant |
| 4.6 | JD degree-requirement detection: add `degree_required: yes/no/unclear` to each report + a toggle `include_degree_required_roles`. | the eval already reads the JD |
| 4.7 | Comp research tuned **per selected level** and **per region** cost-of-living. | `modes/_shared.md` |

**Verification gate:** with `target_levels: [entry]` (default), a "Senior Engineer" is excluded and an entry
"Analyst I" surfaces; switching to `[entry, mid]` admits "Engineer II"; **selecting `senior` admits senior
roles that rank on merit (no penalty)** — only a role *above* every selected level is flagged. Separately,
under `no_degree` a "Maintenance Technician — HS diploma or equivalent" scores well, while a "Software
Engineer — BS required" shows as a flagged stretch rather than hidden.

---

## Phase 5 — Region toggle + seeds + geo tuning (Midwest default)

**Goal:** a built-in **region selector** so the tool adapts to wherever the user is. Midwest ships first
and is the default; switching region re-aims the company seeds, location filter, and search. A fresh user
gets useful, level-appropriate results out of the box.

| Step | What | Detail |
|---|---|---|
| 5.1 | **Region toggle.** Add `target_regions` to `config/profile.yml` — presets `midwest` (**DEFAULT**), `northeast`, `southeast`, `southwest`, `west`, `nationwide`, `custom`. Each maps to states + major metros + a `location_filter` + a geo query fragment. Multi-select allowed; `nationwide` = all US + remote-US. Taxonomy is extensible (e.g., split `west` into Pacific/Mountain). | parallels the level toggle |
| 5.2 | **Region-aware employer catalog** `data/seed/employers.yml`, each company tagged by region/metro/ATS/sector. **Seed Midwest first** (Chicago, Minneapolis–St. Paul, Detroit, Columbus, Indianapolis, Milwaukee, Kansas City, St. Louis, Cincinnati, Cleveland, Des Moines, Omaha, Madison…); add other regions over time. | seed incrementally |
| 5.3 | `location_filter` is **derived from the selected region(s)**: allow that region's states/metros + remote-US; `always_allow` the user's metro; block common offshore hubs. | wired to onboarding |
| 5.4 | `search_queries` driven by **region × level** + `site:` filters for Workday/iCIMS/Greenhouse. | discovery |
| 5.5 | Onboarding expander: pick region → metro(s) (+ optional sectors) → materialize matching `tracked_companies` into `portals.yml`. | small `.mjs` helper |

**Verification gate:** switching `target_regions` from `midwest` to `southwest` swaps the seeded employers
and the location filter (a Phoenix user gets AZ/TX results, a Columbus user gets OH results); `nationwide`
returns US-wide + remote — all without the user hand-editing a file.

---

## Phase 6 — Effortless install & onboarding for anyone

**Goal:** a non-developer goes from zero → first real scan in under ~10 minutes, in EN or ES, without
hand-editing YAML. (For the CLI; the web app in Phase 9 lowers the bar further.)

| Step | What | Detail |
|---|---|---|
| 6.1 | **Interactive setup wizard** `npx jobdar init`: bilingual prompts for name/contact, **region** (Midwest default) + metro, **target level(s)** (entry default; mid optional; senior opt-in), tuning profile (`new_grad` / no-degree), **inference** (on-device default vs. API key), language — then **writes `profile.yml` + `portals.yml` automatically**. No manual YAML. | new `setup.mjs` |
| 6.2 | **Zero-config first scan:** sensible defaults so `jobdar scan` works immediately after `init`. Defer Playwright/PDF — lazy-install only on the first PDF request. | remove first-run friction |
| 6.3 | **One-command install:** `curl … \| bash` (macOS/Linux) + PowerShell (Windows) that checks/installs Node, fetches Jobdar, installs deps, runs `doctor`, launches the wizard. Plus a GitHub "Use this template" repo + a **devcontainer/Codespaces** path. | installers + `.devcontainer/` |
| 6.4 | Flesh out the unified **`jobdar`** command: `jobdar init / scan / eval / pipeline / pdf / tracker / dashboard / doctor / update`, each with `--help` + `--version`; bilingual help; shell tab-completion. Deterministic subcommands need no model; `eval`/tailoring use the inference backend (API key now, on-device model from Phase 8). | `bin/jobdar` |
| 6.5 | **Conversational guided onboarding** in the agent layer: a bilingual first-run flow that ingests a pasted résumé and confirms region + level(s). | `AGENTS.md`, `modes/_shared.md` |
| 6.6 | **Résumé bootstrap:** accept a PDF/DOCX/paste → generate `cv.md` + prefill `profile.yml`. (Reused server-side by the Phase 9 web app.) | new helper + mode |
| 6.7 | Plain-language **Getting Started** (EN + ES), 5-minute quickstart with screenshots/gif, troubleshooting page. | `docs/` |

**Verification gate:** a timed usability test — a non-developer reaches first scan results in <10 min using
only the README; repeat the whole flow in Spanish. Both pass.

---

## Phase 7 — Quality, dashboard, polish, release

**Goal:** ship a trustworthy 1.0 (CLI).

| Step | What | Detail |
|---|---|---|
| 7.1 | Dashboard decision: keep a Go TUI **optional** and/or add a lightweight `jobdar dashboard` → localhost web view as the friendly default. Bilingual labels; show active region + level(s). | see Open Decisions |
| 7.2 | Test coverage for Workday, iCIMS, i18n strings, the level toggle, and the region toggle in `test-all.mjs`; GitHub Actions CI green. | tests/CI |
| 7.3 | Ethics/legal pass: ToS-respecting rate limits + backoff for Workday/iCIMS, robots awareness, a `LEGAL_DISCLAIMER`, a privacy statement ("data stays local; we host no résumés"), and license compliance for any reused third-party code. | compliance |
| 7.4 | Security review of providers (SSRF allowlists, `redirect:'error'`, no secret leakage); confirm zero telemetry. | security |
| 7.5 | Package & release: Claude Code plugin (`/jobdar`) in a marketplace + npm; `1.0.0`; bilingual release notes. | release |
| 7.6 | Closed beta with target users (a new grad, a no-degree candidate, a career-changer, a Spanish-preferring user); iterate. | beta |

---

## Phase 8 — Pluggable inference (local default + API plugin)

**Goal:** make the model a **swappable backend** so the same evaluation/tailoring brain runs against (a) a
lightweight **on-device model by default** — private, no key, no cost — or (b) a **cloud model via an opt-in
API plugin** (BYO key, higher quality), with **data always local at rest**. This is what gives non-technical
users evaluation + résumé consistency with **no privacy exposure**, and lets technical users keep using their
own AI CLI/API. It also limits our liability: we never receive or store résumés.

| Step | What | Detail |
|---|---|---|
| 8.1 | **`InferenceProvider` interface** (same plugin spirit as the scanner): `evaluate(jd, profile, cv)` / `tailor(...)` → structured result. The Markdown rubric is the shared spec; backends are swappable. | abstraction |
| 8.2 | **Local backend (default for non-tech):** integrate a lightweight on-device LLM — **Ollama** (cross-platform) with a small instruct model (e.g., Llama 3.2 3B / Qwen2.5 3B), plus a **`llamafile`** single-binary option for true zero-install. Auto-detect/auto-pull with a friendly "preparing model…" UX. Fully offline, no key, no cost. | private + free |
| 8.3 | **API-plugin backend (opt-in, BYO key):** Anthropic (default) / OpenAI / Gemini; use **zero-retention** settings; send only the **minimal slice** (JD + relevant CV excerpt), never the whole history. For tech users + anyone wanting more accuracy. | the "tech users like today" path |
| 8.4 | **Consistency & quality guardrails:** the deterministic scanner does all filtering (no model); the model only does nuanced eval. Structured-output schema so local and cloud return the same shape; a "consistency mode" (pinned prompt + schema) so résumé tailoring stays stable over time; a small eval set to compare local vs. cloud. | accuracy + consistency |
| 8.5 | **Backend selector + fallback:** `inference: local\|api\|auto`. Wizard defaults non-tech users to `local`, tech users to `api`; `auto` runs local and offers an API upgrade on borderline roles. Clear UX about the privacy/quality tradeoff. | user control |
| 8.6 | **(Future) confidential-cloud option:** managed inference in a TEE (Nitro Enclaves / confidential VMs / a Private-Cloud-Compute-style enclave) for cloud quality the operator can't read — for when local isn't enough and the user won't BYO key. Documented, not built yet. | advanced |

**Verification gate:** the same JD evaluates end-to-end with `inference: local` (no key, offline) and with
`inference: api` (BYO key), returning the same structured shape; the local path makes **zero** network calls
to any model provider.

---

## Phase 9 — Web app for non-technical users (future / post-1.0)

**Goal:** a hosted, cross-platform, bilingual **web app** where a non-technical user uploads a résumé and is
pointed toward fitting jobs with little effort. **Ease of use and accuracy** are the two named targets. It
reuses the Phase 8 inference layer — and, crucially, **runs evaluation in the browser by default**, so the
résumé never leaves the device.

> **Privacy by architecture:** the browser holds the résumé and runs the model (WebLLM/WebGPU); the **server
> only runs the PII-free scanner** (fetches public job listings) and serves static assets. So the cloud
> delivers the app and the public job data, but **never receives the résumé** by default. This is the
> liability-limiting design — not "trust us with your data," but "your data never reaches us."

| Step | What | Detail |
|---|---|---|
| 9.1 | **In-browser inference (default):** run the Phase 8 local model in the browser via **WebLLM/WebGPU**. The résumé + matching happen client-side; nothing PII goes to the server. | privacy by default |
| 9.2 | **Server = PII-free scanner only:** the zero-token scanner runs server-side (CORS blocks the browser from fetching arbitrary career sites), returns **public** job listings to the browser, which evaluates them locally. | clean PII boundary |
| 9.3 | **Frictionless frontend:** cross-platform responsive web (phone/tablet/desktop; PWA-installable), **bilingual EN/ES**, accessible (WCAG). Flow: upload résumé → confirm region + level → ranked matches → one-tap tailored CV/cover letter. | ease-of-use target |
| 9.4 | **Résumé → everything:** reuse the Phase 6.6 parser **in the browser** → infer profile, skills, suggested level/region → seed the scan + evaluation. Little-to-no manual config. | non-technical users |
| 9.5 | **API-key upgrade (opt-in):** users who want higher accuracy plug in a key; only the minimal slice is sent, zero-retention, with explicit consent. | accuracy lever |
| 9.6 | **Fallback for low-end devices/browsers** (no WebGPU): a smaller model, or — with explicit consent — confidential-cloud inference (Phase 8.6). Never silently ship a résumé to a server. | honest fallback |
| 9.7 | **Accuracy & UX measurement + cost controls:** track match **accuracy** (human-rated) and **ease of use** (task success + time-to-first-match); monitor any server cost (scanner only ⇒ low). | both targets |

**Verification gate:** a non-technical, Spanish-preferring user on a phone uploads a résumé and reaches a
ranked, region-appropriate match list with a tailored CV — and a network trace shows the **résumé never
left the browser** on the default path.

---

## MVP cut line (fastest path to something real)

Ship a usable Jobdar **CLI** with the **bold** phases first; defer the rest:

1. **Phase 0** — foundation + branding (must-have)
2. **Phase 1** — American-English core (ship EN first; ES parity can trail by a step)
3. **Phase 2** — Workday provider (the single highest-value feature)
4. **Phase 4** — level toggle (entry default, mid optional, senior opt-in) + no-degree tuning
5. **Phase 5 (lite)** — region toggle with the **Midwest** catalog seeded first (+ `nationwide`/remote works immediately via filters)
6. **Phase 6 (lite)** — the **`jobdar`** command (`init`, `scan`, `eval`) + the wizard + zero-config first scan (using the user's own AI CLI/API for `eval`)

**Defer to fast-follow:** Phase 3 (iCIMS), full ES parity, other-region seed catalogs, **Phase 8 pluggable
inference / local model**, full test/CI hardening (Phase 7), and the **web app (Phase 9)**.

This gives an entry-level user in, say, Indianapolis a working **English, Workday-powered, first-job** scan
from a guided wizard — the core promise — before we invest in iCIMS, the local-model backend, and the web app.

---

## Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| **iCIMS has no clean public API** and pages are JS-heavy/inconsistent | High | Phase it after Workday; JSON-LD-first parsing + Playwright fallback; treat as best-effort; document coverage limits honestly |
| **On-device model accuracy < cloud** | Med–High | Scanner does all filtering (no model); structured rubric; offer the API/confidential upgrade for accuracy; measure local-vs-cloud on an eval set |
| **WebGPU unavailable on old/cheap devices** (Phase 9) | Medium | Smaller model; or consented confidential-cloud fallback; never silently send a résumé to a server |
| **Non-Midwest regions need seed coverage** | Medium | `nationwide`/remote + location filters work immediately; seed per-region catalogs incrementally; `log` what isn't seeded yet |
| **Workday `site` name varies per tenant** | Medium | `site:` override in config + a small probe that tries common names |
| **ATS ToS / rate-limiting / IP blocks** | Medium | Polite concurrency caps + backoff, honor robots, document responsible-use; human-in-the-loop (no auto-apply) |
| **Mid-level is fuzzy to detect by title** | Medium | Coarse title filter + let the rubric do level-fit scoring; tune with real fixtures |
| **Spanish parity rots** as EN evolves | Medium | Single i18n string table + a CI check for missing ES keys |
| **Name/trademark** | Low | "Jobdar" screened clear; lock with a formal trademark search + domain/org grab (Step 0.2) |
| **Scope creep** | Medium | Hold to the MVP cut line; don't build every mode, region, the local backend, or the web app before the CLI lands |

---

## Open decisions (recommendation + alternatives)

1. **Primary AI CLI / API.** → *Recommend:* default to **Claude Code** for tech users; CLI-agnostic
   `AGENTS.md` so Gemini CLI works too. *Alt:* lead with a free tier for cost-sensitive users.
2. **Inference defaults per surface.** → *Recommend:* CLI/tech users → **API (BYO key)**; wizard non-tech +
   web app → **on-device model**. `auto` offers an API upgrade on borderline roles. *Alt:* always-local with
   an explicit opt-in to cloud.
3. **Local model + runtime.** → *Recommend:* **Ollama** (CLI/desktop) + **llamafile** (zero-install) +
   **WebLLM/WebGPU** (web), small instruct model (Llama 3.2 3B / Qwen2.5 3B). *Alt:* a single runtime only.
4. **Regions to seed after Midwest.** → *Recommend:* let early user demand decide; `nationwide`/remote works
   from day one regardless. *Alt:* pre-seed all regions (more upfront work).
5. **Confidential-cloud.** → *Recommend:* build only if the local model proves too weak and users won't BYO
   key. *Alt:* skip entirely and rely on local + BYO-key.
6. **Web hosting (Phase 9).** Lighter now that the server holds no PII (scanner + static assets only) —
   *open sub-question:* build vs. buy the static-host + scanner-API stack.
7. **Other languages / dashboard / distribution.** → EN+ES for 1.0; TUI optional + later web dashboard;
   GitHub template + npm + Claude plugin for the CLI, standard web deploy for the app.

---

## Technical appendix: provider & inference specifics

### Workday (Phase 2) — clean, unauthenticated JSON
- **List endpoint:** `POST https://{tenant}.wd{N}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
- **Body:** `{"appliedFacets":{}, "limit":20, "offset":0, "searchText":""}` — `POST`, not `GET`. No auth for public boards.
- **Response:** `jobPostings[]` with `title`, `externalPath`, `locationsText`, `postedOn`; plus `total` for pagination.
- **Detail (optional):** `GET /wday/cxs/{tenant}/{site}/job/{externalPath}` for the full JD.
- **Pagination:** increment `offset` by `limit`; stop when `jobPostings` is empty or `offset+limit ≥ total`.
- **Public URL:** `https://{tenant}.wd{N}.myworkdayjobs.com/{site}{externalPath}`.

### iCIMS (Phase 3) — no public JSON; parse the career site
- **Public site host:** `careers-{company}.icims.com` (also `jobs.{company}.com` fronting iCIMS); search at `/jobs/search`. Detail pages often embed **`JobPosting` JSON-LD** — parse that first.
- **Official APIs need OAuth2** (Search / Job Portal / Standard XML feed) — out of scope for the default zero-auth path; optional in 3.4.
- **Strategy:** JSON-LD/HTML parse → Playwright fallback (sequential). Expect more breakage than Workday; document coverage per employer.

### Inference options (Phase 8/9)
- **Local (default, private):** Ollama + a small instruct model (Llama 3.2 3B / Qwen2.5 3B) for CLI/desktop; `llamafile` single-binary for zero-install; **WebLLM (WebGPU)** in-browser for the web app. No key, no cost, nothing leaves the device.
- **API plugin (opt-in):** BYO key — Anthropic (default) / OpenAI / Gemini; **zero-retention** settings; send only the minimal JD + CV excerpt.
- **Confidential cloud (future):** TEE-based managed inference (Nitro Enclaves / confidential VMs / Private-Cloud-Compute-style) for cloud quality without exposing data.
- **Why this is feasible:** the scanner is **zero-token** (no model — it only fetches public job data), so only evaluation/tailoring needs a model. That keeps the local path practical and the cloud path cheap.

### Sources
- Workday CXS API guide — https://jobspipe.dev/blog/workday-api-guide
- iCIMS developer docs (Search / Job Portal / XML feed) — https://developer-community.icims.com/
