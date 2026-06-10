# Jobdar — Phase-and-Step Roadmap

> A bilingual (American English / Español) US job-search command center for **new grads and people
> breaking into the workforce** — including those without a college degree. **Region-adaptable** (Midwest
> by default; toggle to South, Southwest, Northeast, West, or nationwide) and **entry-level by default**
> (toggle to mid-level, and senior when you choose it). It **scans** company career pages, **evaluates**
> fit against your résumé, **tailors** an ATS-friendly CV/cover letter, and **tracks** every application —
> with your data kept **local**, processed by a **private on-device model by default** or your own cloud API.
>
> **Status:** Phases 0–7 **and 5.5** complete — **Jobdar CLI `1.14.1`**. Bilingual core; **six scanner
> providers** (Greenhouse, Workday, iCIMS, Lever, Ashby + an opt-in JSON-LD reader), all live-verified,
> all with eval-time JD fetch; level + region toggles; the `jobdar init` wizard; the full
> **discover→evaluate→track→build pipeline** — `scan` finds + filters (it never scores), the model's
> `jobdar eval` scores fit (0–5 → Apply/Research/Don't) and records it, the human advances status
> (`a` in the TUI / `jobdar tracker --set`), `jobdar pdf` builds the tailored ATS résumé; a scrollable
> cursor-driven TUI workspace + a web dashboard with analytics; freshness tracking (`posted`/`first_seen`,
> `scan --prune`); security/privacy pass (zero telemetry, SSRF-guarded).
> Remaining for 1.0 ship: **npm publish + marketplace** (needs the org from Step 0.2) and the **closed
> beta** (7.6 — can start from the GitHub repo + installer now). **Next build phase: Phase 8a** (BYO-key
> automated eval), then **8b** (on-device via **winc.cpp** — the **default** backend), **8c** (PDF
> résumé/JD understanding), **8d** (offer evaluation), **8e** (the engine contract), then Phase 9
> (web + mobile apps). Step-by-step:
> [Remaining work — build-order implementation guide](#remaining-work--build-order-implementation-guide).
> See [CHANGELOG.md](CHANGELOG.md).
> **Date:** 2026-06-10 (Phases 0–7 built 2026-06-05; 1.11/1.12 + Phase 5.5 on 2026-06-09)

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
with their own AI CLI/API much like today's agentic dev tools. A **web app** — then a **mobile app** — for non-technical users comes
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
  the hosted web app (and the mobile app after it) for non-technical users follows in [Phase 9](#phase-9--web-and-mobile-apps-future--post-10).
- **Local data, pluggable inference.** Data stays **local at rest**. The inference engine is swappable: a
  lightweight **on-device model by default** (private, free), an **API plugin** (BYO key — cloud, higher
  quality, zero-retention) opt-in, and a **confidential-cloud** option later. The zero-token scanner touches
  only public job data, so only evaluation needs a model — which keeps local feasible and cloud cheap. See
  [Phase 8](#phase-8--pluggable-inference-8a-byo-key-auto-eval-then-8b-on-device-via-winccpp).
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
on-device model once [Phase 8](#phase-8--pluggable-inference-8a-byo-key-auto-eval-then-8b-on-device-via-winccpp) lands.

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

- [Remaining work — build-order implementation guide](#remaining-work--build-order-implementation-guide)
- [Phase 0 — Foundation & branding](#phase-0--foundation--branding)
- [Phase 1 — American-English-first bilingual core](#phase-1--american-english-first-bilingual-core)
- [Phase 2 — Workday provider (the marquee scanner win)](#phase-2--workday-provider-the-marquee-scanner-win)
- [Phase 3 — iCIMS provider (HTML/JSON-LD + Playwright fallback)](#phase-3--icims-provider-htmljson-ld--playwright-fallback)
- [Phase 4 — Level toggle (entry default) + no-degree tuning](#phase-4--level-toggle-entry-default--no-degree-tuning)
- [Phase 5 — Region toggle + seeds + geo tuning (Midwest default)](#phase-5--region-toggle--seeds--geo-tuning-midwest-default)
- [Phase 5.5 — Provider expansion (demand-driven)](#phase-55--provider-expansion-demand-driven)
- [Phase 6 — Effortless install & onboarding for anyone](#phase-6--effortless-install--onboarding-for-anyone)
- [Phase 7 — Quality, dashboard, polish, release](#phase-7--quality-dashboard-polish-release)
- [Phase 8 — Pluggable inference (8a BYO-key auto-eval, then 8b on-device via winc.cpp)](#phase-8--pluggable-inference-8a-byo-key-auto-eval-then-8b-on-device-via-winccpp)
- [Phase 8c — Document understanding (PDFs in, structured data out)](#phase-8c--document-understanding-pdfs-in-structured-data-out)
- [Phase 8d — Offer evaluation](#phase-8d--offer-evaluation)
- [Phase 8e — The engine contract (CLI, web, mobile plug in here)](#phase-8e--the-engine-contract-cli-web-mobile-plug-in-here)
- [Phase 9 — Web and mobile apps (future / post-1.0)](#phase-9--web-and-mobile-apps-future--post-10)
- [MVP cut line](#mvp-cut-line-fastest-path-to-something-real)
- [Risks & mitigations](#risks--mitigations)
- [Open decisions](#open-decisions-recommendation--alternatives)
- [Technical appendix](#technical-appendix-provider--inference-specifics)

---

## Remaining work — build-order implementation guide

> Phases 0–7 + 5.5 are **shipped**. This is everything left, in the order to build it — and the
> end-state it adds up to: **one headless engine** that every surface plugs into.

```
résumé PDF/DOCX ─▶ 8c understand ─▶ cv.md + profile.yml
                                         │
portals.yml ─▶ scan (zero-token) ─▶ pending roles ─▶ 8a/8b eval 0–5
                                         │            (winc.cpp local by DEFAULT;
                                         │             BYO-key API opt-in)
                          tracker ─▶ offer in hand ─▶ 8d offer verdict
                                         │
                               build (tailored CV / cover letter)
```

The CLI drives this engine today; the **web app and the mobile app (Phase 9) plug into the same
engine** through the Phase 8e contract — no second pipeline, ever.

| # | Milestone | Where | Status | Why this order |
|---|---|---|---|---|
| 1 | **Closed beta starts** | 7.6 | ⬜ ready now (GitHub repo + installer; npm NOT required) | real-user feedback steers everything below |
| 2 | **BYO-key automated eval** | 8a.1–8a.3 | ⬜ next build | the single biggest daily-use unlock; small build |
| 3 | **Eval tuning + calibration + fairness** | 8a.4–8a.6 | ⬜ with 8a | scores must be trustworthy before they're the product; research done → [docs/eval-tuning-research.md](docs/eval-tuning-research.md) |
| 4 | **winc.cpp local backend — the DEFAULT** | 8b.1–8b.4 | ⬜ after 8a | same client, new base URL; makes "private, free, offline" real |
| 5 | **PDF/document understanding** | 8c.1–8c.5 | ⬜ | "upload a résumé → go" for init; PDF JDs in eval |
| 6 | **Offer evaluation** | 8d.1–8d.5 | ⬜ | completes discover → evaluate → **decide** |
| 7 | **The engine contract** | 8e.1–8e.4 | ⬜ | freezes the seam web/mobile build against |
| 8 | **npm publish + marketplace → 1.0** | 7.5 | 🔶 blocked on Step 0.2 (org/trademark) only | distribution, not function |
| 9 | **Workday quirk tenants; new ATS readers** | 5.5.4 / 5.5.5 | 🔶 / ⬜ demand-driven | parallel track, paced by beta demand |
| 10 | **Web app, then mobile app** | 9.1–9.8 | ⬜ post-1.0 | thin front-ends over the 8e engine |

---

## Phase 0 — Foundation & branding

> **Status: ✅ shipped** (2026-06-05) — all steps built; the only loose end is 0.2's externals
> (formal trademark search + domain/GitHub-org grab), the sole blocker on 7.5.

**Goal:** a clean `Jobdar` repo that installs, passes `doctor`, and runs a dry-run scan — Jobdar-branded
throughout, scoped to EN/ES and the entry-default, Midwest-default focus.

| Step | What | Key files |
|---|---|---|
| 0.1 ✅ | Scaffold the Jobdar codebase: the two-layer structure (`scan.mjs` + `providers/`, `modes/` + `AGENTS.md`, `config/`, tracker scripts, `doctor.mjs`). Repo + `git init` already done; add `LICENSE`. | repo root, `LICENSE` |
| 0.2 🔶 | **Name locked: "Jobdar"** (screened clear on npm + jobs/HR products, 2026-06-05). Final confirm: formal USPTO/EUIPO trademark search; grab `jobdar.app`/`.io` (the `.com` is parked-for-resale) + a GitHub org (`/jobdar` is taken — use e.g. `getjobdar`/`jobdar-app`). | — |
| 0.3 ✅ | Jobdar branding + the **`jobdar` CLI entrypoint**: register `bin/jobdar` in `package.json`'s `bin` (so `npm i -g`/`npx` expose a real `jobdar` shell command) with a subcommand router (`jobdar <command>`); the AI-CLI slash command `/jobdar`; env vars `JOBDAR_*`; `.claude-plugin/{plugin,marketplace}.json`; `.agents/skills/`. | `package.json` (`bin`), `bin/jobdar`, `.claude-plugin/*`, all docs |
| 0.4 ✅ | Lock scope to **EN/ES only**; default region **Midwest**, default level **entry** — no coastal-skewed default content. | `config/`, `modes/` |
| 0.5 ✅ | Make PDF/Playwright **optional** in `doctor.mjs` (warn, don't fail) so a no-PDF first run is green. | `doctor.mjs` |
| 0.6 ✅ | Repo hygiene: `CHANGELOG.md` at `0.1.0`, `LICENSE`, `.github/` issue/PR templates + CI, and a `.gitignore` (`node_modules/`, `data/`, `output/`, `reports/`). | `CHANGELOG.md`, `.github/*`, `.gitignore` |

**Verification gate:** `npm install && npm run doctor` passes (PDF shown as optional); `node scan.mjs --dry-run`
runs against a tiny stub `portals.yml` and prints a clean summary; a branding grep shows only `jobdar`.

---

## Phase 1 — American-English-first bilingual core

> **Status: ✅ shipped** (2026-06-05).

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

> **Status: ✅ shipped** (2026-06-05; live-verified — see 5.5.4 for the open quirk tenants).

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

> **Status: ✅ shipped** (2026-06-05; live-verified).

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

> **Status: ✅ shipped** (2026-06-05).

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

> **Status: ✅ shipped** (2026-06-05).

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

## Phase 5.5 — Provider expansion (demand-driven)

> **Status: ✅ core shipped** (1.12.0, 2026-06-09) — 5.5.1–5.5.3 live; 5.5.4/5.5.5 stay open as
> the demand-driven parallel track (milestone 9).

**Goal:** cover the ATSs where real small/midsize and regional employers actually post, beyond the
big three. Greenhouse skews startup/tech; Workday/iCIMS carry enterprise + healthcare; Lever/Ashby
carry the small-company long tail. Every provider implements the same contract
(`detect` / `fetch` discovery / `fetchJob` eval-time JD).

| Step | What | Status |
|---|---|---|
| 5.5.1 | **Lever provider** — unauthenticated `api.lever.co/v0/postings/{site}` list + per-posting detail (`descriptionPlain`); detects `jobs.lever.co/{site}`. | ✅ shipped 1.12.0 (live-verified: Spotify, Zoox, Octopus Energy) |
| 5.5.2 | **Ashby provider** — unauthenticated `api.ashbyhq.com/posting-api/job-board/{org}` (carries `descriptionHtml`); detects `jobs.ashbyhq.com/{org}`. | ✅ shipped 1.12.0 (live-verified: Ramp, Replo) |
| 5.5.3 | **Generic JSON-LD provider** (`provider: jsonld`, explicit opt-in) — schema.org JobPosting/ItemList embedded in any careers page; same-origin SSRF pinning. Escape hatch for Phenom/SmashFly-style sites that server-render JSON-LD. | ✅ shipped 1.12.0 (opt-in; note: TriHealth's SmashFly **listing** page is JS-only — no SSR JSON-LD — so it still needs 5.5.5) |
| 5.5.4 | **Workday quirk tenants** — `allina`, `methodisthealthsystem` (HTTP 500) and `hca` (HTTP 422) reject the standard CXS POST even with a browser UA; needs deeper request replication (cookies/calendar token). | 🔶 open (diagnosed: not UA-gating) |
| 5.5.5 | **Future readers, demand-driven** — Phenom, SmashFly/Symphony, Taleo, Oracle Recruiting, SmartRecruiters (these run TriHealth, UC Health, The Christ Hospital, and many regional systems). Build per real user demand; document per-employer coverage honestly. | ⬜ future |

**Verification gate:** a portal on each new ATS scans live, dedupes, and feeds the same pipeline; the
eval-time JD fetch returns real description text for at least one role per provider. *(Met for Lever +
Ashby on 2026-06-09.)*

---

## Phase 6 — Effortless install & onboarding for anyone

> **Status: ✅ shipped** (2026-06-05) — 6.6's PDF/DOCX half is superseded by the fuller Phase 8c
> plan (the paste path shipped).

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

> **Status: 🔶 nearly complete** — 7.1–7.4 ✅; 7.5 🔶 blocked on the 0.2 externals only;
> 7.6 ⬜ ready to start now (GitHub repo + installer; npm not required).

**Goal:** ship a trustworthy 1.0 (CLI).

| Step | What | Detail |
|---|---|---|
| 7.1 ✅ | Dashboard decision: keep a Go TUI **optional** and/or add a lightweight `jobdar dashboard` → localhost web view as the friendly default. Bilingual labels; show active region + level(s). | see Open Decisions |
| 7.2 ✅ | Test coverage for Workday, iCIMS, i18n strings, the level toggle, and the region toggle in `test-all.mjs`; GitHub Actions CI green. | tests/CI |
| 7.3 ✅ | Ethics/legal pass: ToS-respecting rate limits + backoff for Workday/iCIMS, robots awareness, a `LEGAL_DISCLAIMER`, a privacy statement ("data stays local; we host no résumés"), and license compliance for any reused third-party code. | compliance |
| 7.4 ✅ | Security review of providers (SSRF allowlists, `redirect:'error'`, no secret leakage); confirm zero telemetry. | security |
| 7.5 🔶 | Package & release: Claude Code plugin (`/jobdar`) in a marketplace + npm; `1.0.0`; bilingual release notes. **Blocked on Step 0.2** (org/trademark + npm name grab) — everything else is ready. | release |
| 7.6 ⬜ | Closed beta with target users (a new grad, a no-degree candidate, a career-changer, a Spanish-preferring user); iterate. **Does NOT need 7.5** — beta can start now from the GitHub repo + one-line installer. | beta |

---

## Phase 8 — Pluggable inference (8a BYO-key auto-eval, then 8b on-device via winc.cpp)

> **Status: ⬜ not started** — 8a is the next build (milestones 2–3); 8b follows (milestone 4).

**Goal:** make the model a **swappable backend** so the same evaluation/tailoring brain runs against
either a **cloud model via the user's own key** (8a — small, unblocks daily use first) or a fully
**local model via [winc.cpp](https://github.com/samdotson61/winc.cpp) — the PRIMARY on-device backend** (8b).
The key architectural insight: **both halves speak the same wire format — the Anthropic Messages API.**
winc.cpp's `llama-server` serves `/v1/messages` **natively** on localhost, so ONE tiny HTTP client
covers both backends; only the base URL and the key differ. Data always local at rest; we never
receive or store résumés.

### Phase 8a — BYO-key automated eval (build first; small)

| Step | What | Detail |
|---|---|---|
| 8a.1 | **`InferenceProvider` interface** (same plugin spirit as the scanner): `evaluate(jd, profile, cv)` → structured verdict `{ score, band, recommendation, … }`. The Markdown rubric (`modes/_shared.md` + `modes/eval.md`) is the shared spec. | abstraction |
| 8a.2 | **`jobdar eval --auto [<url> \| --next \| --all-pending]`** — reads the key `init` already stores in `data/credentials.env` (today it's collected and never used), calls the **Anthropic Messages API** with rubric + JD + `cv.md`, parses the structured verdict, records it via the existing `eval --save` path. Batch mode walks every pending role politely. | the single biggest daily-use unlock |
| 8a.3 | **Minimal-slice + zero-retention posture:** send only the JD + relevant CV excerpt, never history; document the retention settings; key never leaves `credentials.env` (gitignored, 0600). | privacy |
| 8a.4 | **Consistency guardrails + rubric design** (per [docs/eval-tuning-research.md](docs/eval-tuning-research.md)): pinned prompt, temperature 0, structured-output schema so every backend returns the same shape. **Decomposed sub-criteria** — skills 35% / experience 25% / level-fit 20% / logistics 10% / education-gate 10% — each a categorical `strong/partial/none` judgment **with a quoted JD line as evidence**, reason-then-judge ordering, 2 short anchor examples per band. **Code, not the model, computes the 0–5** from the weighted sub-judgments and applies band thresholds (Apply ≥ 3.5 / Research 2.0–3.4 / Don't < 2.0 — config-tunable). | accuracy |
| 8a.5 | **Calibration set:** 30–50 real JDs hand-banded by us (incl. no-degree / "or equivalent experience" pairs) as fixtures; `test-all.mjs` scores them against the configured backend and reports agreement + drift on every prompt or model change. | trust |
| 8a.6 | **Fairness guards:** strip name/contact lines from the CV slice before the prompt is built (smaller bias surface AND less PII out the door — off-the-shelf LLMs measurably carry demographic bias in hiring contexts); under `no_degree`, a degree requirement can flag a role but never auto-zero it, and the calibration set makes a regression here a **test failure**, not a vibe. | fairness |

### Phase 8b — on-device backend: winc.cpp primary (private, no key, no cost)

> **Source of truth: the published repo — [github.com/samdotson61/winc.cpp](https://github.com/samdotson61/winc.cpp).**
> All 8b integration work targets winc.cpp as released on GitHub (its README, `winc.toml` schema,
> `winc serve` contract, and releases) — never a local checkout, which may drift behind origin.
> Verified against origin/master (v1.4.5, 2026-06-09): `winc serve [--multi]` fronts llama.cpp's
> `llama-server` (router included), serving the **Anthropic Messages API natively** (`/v1/messages`)
> at the `host`/`port` in `winc.toml` (default `127.0.0.1:8080`).

| Step | What | Detail |
|---|---|---|
| 8b.1 | **winc.cpp as the PRIMARY local backend.** `inference: local` points the SAME 8a client at winc's local server (default `http://127.0.0.1:8080/v1/messages`, configurable via `inference_url` to match the user's `winc.toml`) — it speaks the Anthropic Messages API natively, so no translation layer and no new client code. No key, no cost, fully offline. | one client, two backends |
| 8b.2 | **Friendly liveness UX:** detect whether the local server is up; if not, print the exact start command (`winc serve`, or `winc serve --multi` for hot-swapped models) and the install pointer (`git clone https://github.com/samdotson61/winc.cpp` → run the installer, or a Releases binary + `winc setup`). | onboarding |
| 8b.3 | **Alternate local runtimes** behind the same interface for users without winc: **Ollama** / **llamafile** (OpenAI-compat shim mapped to the shared schema). Secondary — winc is the documented happy path. | breadth |
| 8b.4 | **Backend selector + fallback:** `inference: local\|api\|auto`. **Default for everyone: `local` via winc.cpp** — private, free, no key; `api` (BYO key) is the opt-in accuracy upgrade; `auto` runs local and offers an API upgrade on borderline roles. Clear UX about the privacy/quality tradeoff. | user control |
| 8b.5 | **(Future) confidential-cloud option:** TEE-based managed inference for cloud quality the operator can't read — only if local proves too weak and users won't BYO key. Documented, not built. | advanced |

**Verification gate:** the same JD evaluates end-to-end with `inference: api` (BYO key) and with
`inference: local` (**winc.cpp's `winc serve` running; zero external network calls**), both recording the
same structured verdict shape into the pipeline.

---

## Phase 8c — Document understanding (PDFs in, structured data out)

> **Status: ⬜ not started** (milestone 5).

**Goal:** Jobdar automatically reads and understands PDFs. A résumé PDF/DOCX becomes `data/cv.md` + a
prefilled `config/profile.yml` with no hand-editing, and `jobdar eval` accepts a PDF JD. The division of
labor is strict: **extraction is deterministic** (a parser, no model); **understanding is the inference
backend's job** (text → structured fields) — so résumé understanding is private-by-default on winc.cpp
and accuracy scales with whichever backend the user picked. (Supersedes the 6.6 sketch with a real plan;
library survey in [docs/eval-tuning-research.md](docs/eval-tuning-research.md) §5.)

| Step | What | Detail |
|---|---|---|
| 8c.1 | **Text-extraction layer** `lib/pdf_extract.mjs`: [unpdf](https://github.com/unjs/unpdf) (maintained, Mozilla pdf.js under the hood, no native binaries, runs in Node **and** serverless — the same code will serve Phase 9's server) as **the one new dependency**. `extractText(buffer) → { text, pages, meta }`. DOCX via a thin `mammoth` adapter; `.txt`/`.md` pass through. | one module, swappable |
| 8c.2 | **`jobdar import <file>`** (+ wired into `jobdar init`): extract → send ONLY the extracted text to the inference backend with a structuring prompt → write `data/cv.md` (canonical Markdown CV) + prefill `config/profile.yml` (name, metro, suggested level(s), skills) → show a bilingual confirm/edit summary **before** saving anything. | the "upload résumé → go" path |
| 8c.3 | **PDF JDs in eval:** `jobdar eval <file.pdf>` runs the same extraction and feeds the JD text through the existing eval path (eval already accepts files/stdin — this puts a PDF reader in front). | symmetry |
| 8c.4 | **Scanned/image PDFs:** detect a near-empty text layer and fail honestly — a bilingual error + "export as text/DOCX" hint. OCR is documented as out of scope for now. | honest failure |
| 8c.5 | **Tests:** fixture PDFs in `test-all.mjs` — a text-based résumé (EN + ES), a JD, and an image-only scan — extraction asserted offline, no network, no model. | regression net |

**Verification gate:** a real résumé PDF → `jobdar import` → confirmed `cv.md` + prefilled profile, then
`jobdar scan` and `jobdar eval --next` complete — **zero hand-edited YAML, fully offline on winc.cpp**.

---

## Phase 8d — Offer evaluation

> **Status: ⬜ not started** (milestone 6).

**Goal:** when applications turn into offers, evaluate the offer the way we evaluate fit — against the
user's profile, region, and **real wage data** — on the same swappable backends. The model never invents
numbers: deterministic code supplies market context; the model interprets it. (Data sources in
[docs/eval-tuning-research.md](docs/eval-tuning-research.md) §4.)

| Step | What | Detail |
|---|---|---|
| 8d.1 | **`jobdar offer <company>`** — bilingual interactive capture: base, bonus, benefits, PTO, metro/remote, start date → stored on the tracker row (new `offer` fields + an `offer` state in `templates/states.yml`, EN canonical / ES alias per 1.4). | capture first |
| 8d.2 | **Wage-context pack (deterministic, zero-token):** `data/seed/wages.yml` — BLS OEWS median/percentile wages for the entry archetypes × major metros + a metro cost-of-living index; refreshed per release with provenance documented. Code computes offer-vs-metro percentile and COL-adjusted comparisons. | facts from data, not the model |
| 8d.3 | **Offer rubric** `modes/offer.md` (EN + ES): the model weighs comp-vs-market (from 8d.2), benefits completeness, growth trajectory, commute/remote — plus entry-level-specific factors (training, mentorship, first-role résumé value) → structured verdict `{ assessment: strong/fair/below, negotiation_levers[], questions_to_ask[] }` under the same 8a.4 consistency guardrails. | judgment on top of facts |
| 8d.4 | **Multi-offer compare:** `jobdar offer --compare` — a COL-adjusted side-by-side of every recorded offer. | the real decision moment |
| 8d.5 | **Tests:** wage-math fixtures + verdict-shape checks on both backends in `test-all.mjs`. | parity |

**Verification gate:** record a real-shaped offer; the verdict cites metro wage context and returns the
identical structured shape on `inference: api` and `inference: local`; a Spanish run renders fully in Spanish.

---

## Phase 8e — The engine contract (CLI, web, mobile plug in here)

> **Status: ⬜ not started** (milestone 7).

**Goal:** freeze the headless pipeline — **import → scan → eval → track → build** — behind ONE documented
programmatic seam, so the CLI, the web app, and the mobile app are thin front-ends over the **same engine**.
This is the phase that makes Phase 9 a UI project instead of a rewrite.

| Step | What | Detail |
|---|---|---|
| 8e.1 | **`lib/engine.mjs`** — export the verbs as functions with **no console I/O** (structured returns + progress callbacks): `importDocument()`, `scan()`, `evaluate()`, tracker verbs, `buildCv()`. The CLI subcommands become thin callers — behavior identical, seam explicit. | extract, don't rewrite |
| 8e.2 | **Local HTTP façade** `jobdar serve` — the same verbs as JSON endpoints on localhost (the dashboard already proves the pattern); CORS locked to localhost; no secrets in responses. This is what a dev-build web front-end — or a phone on the LAN — talks to. | the plug socket |
| 8e.3 | **Contract doc** `docs/engine.md` — verb signatures, the `Job` / `Verdict` / `Offer` shapes, progress events; versioned. **Phase 9 builds against this doc, never against internals.** | the promise |
| 8e.4 | **Conformance test:** one script in `test-all.mjs` drives a full pipeline run through `lib/engine.mjs` only — no CLI — and asserts every shape. | keeps the seam honest |

**Verification gate:** a single script (no CLI) goes résumé-PDF → scanned → evaluated → tracked via
`lib/engine.mjs`; `jobdar serve` does the same over HTTP from a browser `fetch`.

---

## Phase 9 — Web and mobile apps (future / post-1.0)

> **Status: ⬜ not started** — post-1.0 (milestone 10).

**Goal:** a hosted, cross-platform, bilingual **web app** — and, after it, a **mobile app** — where a
non-technical user uploads a résumé and is pointed toward fitting jobs with little effort. **Ease of use
and accuracy** are the two named targets. Both surfaces are thin front-ends over the **Phase 8e engine
contract** (import → scan → eval → track → build) and the Phase 8 inference layer — and, crucially,
evaluation **runs in the browser by default**, so the résumé never leaves the device.

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
| 9.8 | **Mobile app:** PWA-installable first (9.3 already targets it); then a thin native wrapper (e.g. Capacitor) over the **same in-browser engine + the 8e contract** — no second codebase. New-match notifications land here. | meet job-seekers on their phones |

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
2. **Inference defaults.** → **Decided 2026-06-10:** **local via winc.cpp is the default everywhere**
   (CLI, web, mobile) — private, free, no key; **API (BYO key)** is the opt-in accuracy upgrade; `auto`
   offers that upgrade on borderline roles.
3. **Local model + runtime.** → **Decided (Phase 8b):** **winc.cpp is the PRIMARY local runtime** (it
   speaks the Anthropic Messages API natively on localhost); **Ollama / llamafile** are secondary
   alternates behind the same interface; **WebLLM/WebGPU** in-browser for web/mobile. Model selection,
   download, and hardware fit are winc's job, not ours.
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
- **Local PRIMARY ([winc.cpp](https://github.com/samdotson61/winc.cpp)):** the user's `winc serve` runs
  llama.cpp's `llama-server`, which serves the **Anthropic Messages API natively** (`/v1/messages`) on
  `127.0.0.1:8080` (per `winc.toml`) — Jobdar's API client just points at it (no key, no translation
  proxy, nothing leaves the device). Model management (download, hardware detect, hot-swap via
  llama-swap) is winc's job, not ours. Integration tracks the GitHub repo/releases, not local checkouts.
- **Local alternates:** Ollama + a small instruct model (Llama 3.2 3B / Qwen2.5 3B) or `llamafile`
  single-binary (both via an OpenAI-compat shim); **WebLLM (WebGPU)** in-browser for the web app.
- **API plugin (opt-in):** BYO key — Anthropic (default) / OpenAI / Gemini; **zero-retention** settings; send only the minimal JD + CV excerpt.
- **Confidential cloud (future):** TEE-based managed inference (Nitro Enclaves / confidential VMs / Private-Cloud-Compute-style) for cloud quality without exposing data.
- **Why this is feasible:** the scanner is **zero-token** (no model — it only fetches public job data), so only evaluation/tailoring needs a model. That keeps the local path practical and the cloud path cheap.

### Sources
- Workday CXS API guide — https://jobspipe.dev/blog/workday-api-guide
- iCIMS developer docs (Search / Job Portal / XML feed) — https://developer-community.icims.com/
