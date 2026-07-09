# Jobdar — Phase-and-Step Roadmap

> A bilingual (American English / Español) US job-search command center for **new grads and people
> breaking into the workforce** — including those without a college degree. **Region-adaptable** (Midwest
> by default; toggle to South, Southwest, Northeast, West, or nationwide) and **entry-level by default**
> (toggle to mid-level, and senior when you choose it). It **scans** company career pages, **evaluates**
> fit against your résumé, **tailors** an ATS-friendly CV/cover letter, and **tracks** every application —
> with your data kept **local**, processed by a **private on-device model by default** or your own cloud API.
>
> **Status:** Phases 0–7, **5.5, 7.7, 7.8, 8b, 8a, 8c, 8e and 8f** complete + **Phase 10 L0–L5 shipped** — **Jobdar CLI `1.47.1`** / app `1.17.0` (9.1 serve façade, security/correctness hardening, 9.3 intent search + tunable region/level/résumé controls + BM25-lite relevance, 9.4 winc-suggest ATS discovery, a search-speed pass, region-timezone ranking, a fit-only Search tab, honest résumé status, docx/pdf résumé upload, résumé-seeded profile, a blank-start app, a target-salary selector, persisted state after first use, a documented known-gaps list, a `jobdar doctor` poppler check, `POST /profile` persistence, a first-run onboarding screen, an eval-calibration pass, an **eval-feedback loop** (thumbs → `jobdar calibrate --feedback`), **batch Apply scoring**, a **USAJobs** opt-in provider, npm ship-prep, + a **"Need visa sponsorship" toggle**, + **web-native parity** (AsyncStorage persistence, native résumé upload, a backend-down banner, list pagination, honest signal labels), + **Phase 10 L0–L5: the fully-local iPhone app** (the whole pipeline runs **on the phone** — on-device backend over a CLI-format file store, native scanning, an in-app model manager, llama.rn eval/tailor/outreach on the winc eval profile, docx/txt résumé parse — no Mac, no serve)). Bilingual core; **six live-verified scanner
> providers** (Greenhouse, Workday, iCIMS, Lever, Ashby + an opt-in JSON-LD reader), all with
> eval-time JD fetch, plus the opt-in **USAJobs** aggregator (BYO free key; not yet live-verified); level + region toggles; the `jobdar init` wizard; the full
> **discover→prescreen→evaluate→track→build pipeline** — `scan` finds + filters (it never scores),
> **`jobdar prescreen` gates + ranks the queue zero-token** (hard gates screen with a quoted reason,
> never silently), the model's `jobdar eval` scores fit (0–5 → Apply/Research/Don't) and records it,
> the human advances status (`a` in the TUI / `jobdar tracker --set`), **`jobdar outreach`** finds the
> warm contact and enforces the polite follow-up cadence in code, `jobdar pdf` builds the tailored ATS
> résumé; a scrollable cursor-driven TUI workspace + a web dashboard with analytics; freshness tracking
> (`posted`/`first_seen`, `scan --prune`); security/privacy pass (zero telemetry, SSRF-guarded).
> Remaining for the 1.0 CLI ship: **npm publish + marketplace** (the name/org call in Step 0.2 — install
> today is the GitHub repo + one-command installer, which work now) and the **closed beta** (7.6).
> **Active build phase: [Phase 10 — fully-local iPhone](#phase-10--fully-local-iphone-active-direction-locked-2026-07-08):
> L0–L5 shipped in 1.46–1.47; next is L6 TestFlight** (Sam's account steps: App Store Connect record,
> `eas login`, icon), then the **web app / jobdar.ai** and **Android** on the same stack. On-device
> inference via **winc.cpp** (the `winc-jobdar` branch) is the CLI's **default** backend (private, no
> key, no cost — `jobdar backend --install`), and the app now runs the same eval profile **on the phone
> via llama.rn**. Step-by-step:
> [Remaining work — build-order implementation guide](#remaining-work--build-order-implementation-guide).
> See [CHANGELOG.md](CHANGELOG.md).
> **Date:** 2026-07-09 (Phases 0–7 built 2026-06-05; Phase 10 direction locked + L0–L5 shipped
> 2026-07-08; status banner refreshed 2026-07-09)

---

## Known gaps & current limitations

Current as of v1.47.x — tracked deliberately so they aren't mistaken for bugs. The app-side items are elaborated in
[docs/phase9-architecture.md](docs/phase9-architecture.md#known-gaps--current-limitations). *(Resolved since
v1.40.x: onboarding shipped 1.41; `POST /profile` shipped 1.41; the `jobdar doctor` poppler check shipped
1.41; USAJobs opt-in provider shipped 1.43; native persistence via AsyncStorage shipped 1.45 and moved to
the on-device file store — fully serve-free — in 1.47.)*

- **State persists per-device; no cross-machine sync.** Web persists to localStorage; native persists to
  the **on-device file store** (CLI-identical TSV/JSON formats — files are the source of truth since
  1.47) — blank first boot, saved after first use — and in Mac-serve mode identity/résumé are also
  written to the CLI's `config/profile.yml` / `data/cv.md` via serve. Moving machines = copying the
  jobdar home (a future phone⇄Mac export is a file copy by construction). *(By design — local-first.)*
- **Native is fully local since 1.47 — a phone needs no serve.** The optional **Mac-serve companion
  mode** (Settings → backend: URL + bearer token) still needs a reachable `jobdar serve --host 0.0.0.0`;
  web keeps loopback + the `?serve=<mac-ip>&token=<t>` override. On-device honest limits (Phase 10
  L4/L5): intent parse falls back to deterministic keywords, `/discover` returns not-available, PDF
  résumé parse asks for `.docx`/`.txt`, and the in-app model-download UX + real-device Metal speed are
  still to be exercised on hardware in the TestFlight beta. *(Phase 10 L6.)*
- **PDF résumé upload/import needs `pdftotext` (poppler) on the host.** `.docx` uses `unzip` (ubiquitous);
  `.pdf` uses `pdftotext` — install poppler (`brew install poppler` / `apt-get install poppler-utils`).
  `jobdar doctor` flags it when missing; without it the app returns an honest "couldn't read that file";
  scanned/image-only PDFs have no embedded text to extract. *(Host dependency — doctor-checked.)*
- **Discovery is keyless ATS-probing, not an aggregator.** `jobdar discover` has winc name companies and
  probes Greenhouse/Lever/Ashby/Workday slugs — it finds companies whose ATS handle is guessable, not every
  posting on the internet. **USAJobs** (opt-in, BYO free key, dormant without one) shipped in 1.43 but is
  **not yet live-verified** (needs a real key). A broader **aggregator Pro provider** on the same
  `/discover` seam is a future add (LinkedIn/Indeed have no open search API). *(Future — Pro tier.)*
- **The evaluator is bimodal** (Apply/Don't clusters, thin Research band). Code-side causes fixed
  (1.42); the fix path is the 👍/👎 feedback ledger → `jobdar calibrate --feedback` → recalibrate
  thresholds from N≥50–100 real labels, not guesses. *(Data-gated — collect via real use.)*
- **1.0 ship items still open:** claim the npm name (`jobdar` is available, unscoped) or pick a scope,
  npm publish + marketplace listing, then the **closed beta** (7.6) — mechanics prepped in
  [RELEASING.md](RELEASING.md); the name/beta/license calls are human decisions. *(Tracked for 1.0.)*

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
  [Phase 8](#phase-8--pluggable-inference-8b-on-device-via-winccpp-first-then-8a-byo-key-auto-eval).
- **Region toggle.** US-focused, **Midwest by default**; switch to Northeast/Southeast/Southwest/West/
  nationwide and the seeds, location filters, and search adapt.
- **Level toggle.** Entry by default; mid first-class; senior opt-in (full-rank when chosen).
- **Bilingual, EN-canonical.** English is the base language; Spanish is a full peer. No other locales.
- **Midwest-first scanning, Workday/iCIMS-first.** The two ATSs that dominate US enterprise employers,
  plus Greenhouse/Lever/Ashby — under a region-aware seed catalog.
- **Friendly install.** A guided wizard, a zero-config first scan, and Playwright/PDF deferred until needed.

### Design philosophy

**Clean and tight, but homey. The user should come away feeling confident — never coddled.**
Applies to every surface: CLI + TUI today, web and mobile (Phase 9) later.

- **Clean & tight.** Every screen earns its pixels: small surfaces, fast paths, no decorative chrome,
  one obvious next action at any moment. Dense-but-legible information is the house style — the TUI is
  the reference (cursor, bands, counts; nothing else).
- **Homey, not "friendly."** Jobdar is a well-kept workshop, not a cheerleader. Plain, warm language
  ("3 new roles at Medtronic"), no mascots, no exclamation marks, no congratulating the user for
  clicking. The Spanish voice carries the same register — cálido y directo, nunca meloso.
- **Confidence is the product.** The job hunt is stressful; the tool must never be. Always show what
  just happened, what it cost (zero-token scan vs. a model call), and what to do next. Honest failure
  beats silent magic — a board we can't read says so, per portal. Predictability — same command, same
  shape of result, every time — is what makes a first-time job-seeker trust the pipeline.
- **Out of the box with winc — no-frills, clean-cut, efficient.** Jobdar must be fully featured with
  zero external accounts and zero manual key generation: `jobdar backend --install` auto-provisions
  winc + the model (8b.0), inference defaults to local (8b.4), and reference data (BLS wages) comes from
  keyless bulk downloads (8d.2). If a feature would force the user through an external signup or a
  pasted key to work at all, choose the keyless path instead — even if it's a little more code on our
  side. (Decided 2026-06-13.)

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
on-device model once [Phase 8](#phase-8--pluggable-inference-8b-on-device-via-winccpp-first-then-8a-byo-key-auto-eval) lands.

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
- [Phase 7.7 — Apply-likelihood: the prescreen gate + the outreach engine](#phase-77--apply-likelihood-the-prescreen-gate--the-outreach-engine)
- [Phase 7.8 — Deterministic eval-precision primitives (pay, dates, dedup)](#phase-78--deterministic-eval-precision-primitives-pay-dates-dedup)
- [Phase 8 — Pluggable inference (8b on-device via winc.cpp FIRST, then 8a BYO-key auto-eval)](#phase-8--pluggable-inference-8b-on-device-via-winccpp-first-then-8a-byo-key-auto-eval)
- [Phase 8c — Document understanding (PDFs in, structured data out)](#phase-8c--document-understanding-pdfs-in-structured-data-out)
- [Phase 8d — Offer evaluation](#phase-8d--offer-evaluation)
- [Phase 8e — The engine contract (CLI, web, mobile plug in here)](#phase-8e--the-engine-contract-cli-web-mobile-plug-in-here)
- [Phase 8f — Steerable customization (re-runnable, directive-driven materials)](#phase-8f--steerable-customization-re-runnable-directive-driven-materials)
- [Phase 9 — Web and mobile apps (future / post-1.0)](#phase-9--web-and-mobile-apps-future--post-10)
- [MVP cut line](#mvp-cut-line-fastest-path-to-something-real)
- [Risks & mitigations](#risks--mitigations)
- [Open decisions](#open-decisions-recommendation--alternatives)
- [Technical appendix](#technical-appendix-provider--inference-specifics)

---

## Remaining work — build-order implementation guide

> Phases 0–7, 5.5 + 7.7 are **shipped**. This is everything left, in the order to build it — and the
> end-state it adds up to: **one headless engine** that every surface plugs into.

```
résumé PDF/DOCX ─▶ 8c understand ─▶ cv.md + profile.yml
                                         │
portals.yml ─▶ scan (zero-token) ─▶ 7.7 prescreen (zero-token gate+rank) ─▶ 8a/8b eval 0–5
                                         │            (winc.cpp local by DEFAULT;
                                         │             BYO-key API opt-in)
                          tracker ─▶ offer in hand ─▶ 8d offer verdict
                                         │
                     7.7 outreach (warm contact) + build (tailored CV / cover letter)
```

The CLI drives this engine today; the **web app and the mobile app (Phase 9) plug into the same
engine** through the Phase 8e contract — no second pipeline, ever — and **embed the same 8b
on-device inference**, which is why winc.cpp comes first below.

| # | Milestone | Where | Status | Why this order |
|---|---|---|---|---|
| ✅ | **Prescreen gate + outreach engine** | 7.7 | ✅ shipped 1.15.0 (2026-06-12) | kills wasted evals before any model runs; builds the queue 8a/8b will consume |
| ✅ | **Deterministic eval-precision (pay extract / date-normalize / dedup)** | 7.8 | ✅ shipped 1.18.0 (2026-06-13) | removed the worst measured defects (model salary, "future" dates, dup roles) before any backend work; feeds 8a/8d |
| 2 | **Closed beta starts** | 7.6 | ⬜ ready now (GitHub repo + installer; npm NOT required) | real-user feedback steers everything below |
| ✅ | **winc.cpp local backend — the DEFAULT (+ `jobdar backend --install` bootstrap)** | 8b.0–8b.5 | ✅ shipped 1.19.0 (2026-06-13) | the on-device engine the Phase 9 web + iOS/Android apps embed; makes "private, free, offline" real |
| ✅ | **BYO-key automated eval** | 8a.1–8a.3 | ✅ shipped 1.20.0 (2026-06-14) | the opt-in accuracy upgrade; small build |
| ✅ | **Eval tuning + calibration + fairness + economics** | 8a.4–8a.9 | ✅ shipped 1.20.0 (8a.9 optional, deferred) | scores must be trustworthy before they're the product; research done → [docs/eval-tuning-research.md](docs/eval-tuning-research.md) — incl. the measured requirements-check win + grammar-constrained JSON |
| ✅ | **PDF/document understanding (+ light AI pre-confirm)** | 8c.1–8c.5 | ✅ shipped 1.21.0 (2026-06-14) | "upload a résumé → go" for init; PDF JDs in eval |
| 🔶 | **Offer evaluation + on-demand BLS pay resolver** | 8d.1–8d.5 | 🔶 core shipped 1.24.0 (resolver+rubric; capture/fetch/compare deferred) | completes discover → evaluate → **decide**; revised 8d.2 = a growing wage cache, not a static pack |
| 8 | **The engine contract** | 8e.1–8e.4 | ✅ shipped 1.24.0 | freezes the seam web/mobile build against |
| 9 | **npm publish + marketplace → 1.0** | 7.5 | 🔶 blocked on Step 0.2 (org/trademark) only | distribution, not function |
| 10 | **Workday quirk tenants; new ATS readers** | 5.5.4 / 5.5.5 | 🔶 / ⬜ demand-driven | parallel track, paced by beta demand |
| 11 | **Web app, then mobile app** | 9.1–9.8 | ⬜ post-1.0 | thin front-ends over the 8e engine, with 8b inference embedded |

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
| 6.4 | Flesh out the unified **`jobdar`** command: `jobdar init / scan / eval / pipeline / pdf / tracker / dashboard / doctor / update`, each with `--help` + `--version`; bilingual help; shell tab-completion. Deterministic subcommands need no model; `eval`/tailoring use the inference backend (on-device winc.cpp by default, or a BYO API key). | `bin/jobdar` |
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

## Phase 7.7 — Apply-likelihood: the prescreen gate + the outreach engine

> **Status: ✅ shipped** (1.15.0, 2026-06-12) — built from real beta pain: evals were being spent on
> roles a hard gate had already closed. Both halves are zero-token; fit *judgment* stays the model's job.

**Goal:** raise the odds an application leads anywhere BEFORE any model spends a token — never evaluate
a role a hard gate already closed, always evaluate the most winnable role first, and turn cold
applications warm with polite, tracked outreach.

| Step | What | Detail |
|---|---|---|
| 7.7.1 ✅ | **`jobdar prescreen`** (`lib/prescreen.mjs`) — fetches each pending role's JD politely (sequential, paced) and extracts hard gates with a QUOTED snippet as evidence: years-required vs the selected level(s) (entry >2 / mid >5 / senior >10 — the LOWEST stated floor counts), an ACTIVE security clearance, and degree gates (`yes/no/unclear`; "or equivalent experience" downgrades to unclear). Soft signals (obtainable clearance, no-sponsorship, license/cert) only flag. Screened rows keep `screen_reason` on the pipeline — **nothing is ever hidden silently** (the 4.5 rule), and under `no_degree` a degree ask flags a stretch but NEVER screens. | the zero-token gate |
| 7.7.2 ✅ | **Likelihood score 0–100** = skill overlap (cv.md ∩ JD vocabulary, identical extraction both sides) + posting freshness (the `posted`/`first_seen` data the pipeline already tracked) + headroom minus soft flags. `eval --next` now serves the **prescreen-ranked queue**; screened roles return only with `--include-screened`. | rank the eval queue |
| 7.7.3 ✅ | **`jobdar outreach`** (`lib/outreach.mjs`) — deterministic LinkedIn people-search LINKS (recruiters/TA, likely hiring manager via a level-stripped title, company people). The user browses and picks the human; **Jobdar never scrapes LinkedIn and never sends a message** (ToS + the politeness bar). | the referral lever |
| 7.7.4 ✅ | **Cadence enforced in code, not vibes:** a gitignored ledger (`data/outreach.tsv` — name/title/channel/date only) caps contacts at **2 per role**, one thread per person, **ONE follow-up** ripe after **≥5 business days** (`--due` says when), hard stop after — no override flag exists for the stop. | polite by construction |
| 7.7.5 ✅ | **Draft lint + paste-to-personalize:** `outreach --lint` rejects >300-char LinkedIn notes, leftover `{placeholders}`, and drafts missing the recipient's name. `modes/outreach.md` (EN + ES parity) walks the flow: the pasted public headline feeds ONE draft and is never written to disk — and on the winc.cpp default backend (8b) it never leaves the device at all. | quality + privacy |

**Verification gate:** ✅ met 2026-06-12 — the 62-test suite covers gate extraction, scoring, queue
ordering, cadence enforcement, and lint; a live smoke run showed screened-with-reason output, the ranked
queue feeding `eval --next`, duplicate/follow-up refusals exiting non-zero, and a clean lint pass.

---

## Phase 7.8 — Deterministic eval-precision primitives (pay, dates, dedup)

> **Status: ✅ shipped 1.18.0** (2026-06-13) — all five steps built, 13 new offline tests (74 total,
> 0 failing). Validated on a **100-JD corpus fetched live on macOS** from 17 Greenhouse boards
> (committed as the acceptance set) and adversarially verified at **95% extraction precision**.
> As built, differing from the original sketch: the leniency band is **above / within / near / below**
> (a `near` 4th band) with **halved** knobs — tolerance 5% / floor 15% (an $80k target still catches a
> $78k role at score 0.86); the `lib/html.mjs` `decodeEntities` `&mdash;`/`&ndash;` fix was **bundled
> in** (Greenhouse encodes ranges as `$73,125&mdash;$117,000`, the real cause of a 34% floor-only
> truncation); and `target_salary`/`score_weights.salary` were **wired live**, not removed (7.8.4
> narrowed to the stale `scoring.mjs` doc line). These zero-token fixes ship BEFORE the Phase 8 backend
> work and feed 8a/8d. Throughline: **the model normalizes and judges fit; deterministic code owns
> every number.**

**Goal:** kill the defects no backend choice fixes — the model mislabeling/hallucinating salary (3 tiers
got stated pay wrong; a 12-line extractor got 7/7), misreading recent dates as "future" employment, and
duplicate roles reaching the user — with pure code.

| Step | What | Detail |
|---|---|---|
| 7.8.1 ✅ | **`lib/salary.mjs` — deterministic salary extraction** (rec-spec §1; highest impact / lowest effort). `extractPay(jd) → {period,min,max,annualMin,annualMax,location_tiered,quote} \| null` + `bandVsTarget(pay,target) → above/within/near/below (lenient `near` band, tol 5% / floor 15%)`. Five ordered rules: hourly range ×2080, single hourly, annual range (K-suffix, 20k–600k sanity bound), single annual, **location-tiered** non-HCOL selection for a Midwest/SE candidate. Reuses `prescreen.mjs` conventions (`clip` quote helper, matchAll-pick-the-right-match, null-on-absent). **NOT a gate** — pay never screens a role out (4.5 honesty). Wires the dormant `target_salary` + `score_weights.salary`. The model NEVER produces a pay number. Also the STATED layer beneath the 8d resolver. | the worst defect, fixed |
| 7.8.2 ✅ | **`lib/dates.mjs` — résumé date normalization** (rec-spec §3a). `normalizeResumeDates(resume, today)` resolves "Present"→today and strips ambiguity BEFORE the prompt; the eval injects `Today's date is {today}` **after** any cached prefix (so it never busts 8a.8's prompt-cache). Measured: a prompt date-stamp alone cut the "future employment" misread 3→1; code normalization closes the rest. | dates are code's job |
| 7.8.3 ✅ | **Near-duplicate dedup** (rec-spec §5). Extend `lib/evaluations.mjs mergeScanned()` from URL-only to `normalized(company+title) + canonical-location` (campus/building collapsed within a metro; different metros stay distinct). Keep `url` as the row key; record a collapsed dup as an **alias on the survivor** (survivor = tracked > evaluated > earliest `first_seen`); `recordEval`/`recordPrescreen`/`setStatus` resolve an alias URL to its survivor before writing; live aliases feed `prune`. Needs a NEW city/metro canonicalizer (export `regions.mjs`'s metro tables — `parseLocation` only yields a state set). 4.5 honesty: the survivor shows it absorbed N postings. | one role, one row |
| 7.8.4 ✅ | **Config + rubric cleanup** (rec-spec §3b residue): the since-REMOVED `lib/scoring.mjs` left orphans — reconcile/remove `score_weights.salary` + `target_salary` in `config.mjs` and the stale `lib/scoring.mjs` pre-score/levelCap reference in `modes/_shared.md`. (The model already emits no salary; this is dead-config cleanup, not a model change.) | sweep the dead scorer |
| 7.8.5 ✅ | **Test-fixture migration** (blocks 7.8 acceptance): copy the 2026-06-13 study corpus off Windows (`jobdar-wider-2026-06-13.json` — 79 JDs; `winc-resume-eval`/`reeval-*.jsonl`) into a committed `test/fixtures/`; lift the 7 verified-pay JD snippets as inline test consts (test-all.mjs's established style — it reads no external JD fixtures today). The same corpus is the acceptance set for 8d resolver coverage, the §3 gate re-run, and 8a.5 calibration — migrate once, reuse. | unblock CI |

**Verification gate:** `extractPay` returns the correct annual band for the 7 verified-pay fixtures
(Carle $37.64/hr→$78,291 below; Censys non-HCOL $103–130k above; Cincinnati $91.5–116.7k above;
Cincinnati BSA $56.8–72.5k below); the study's known dups (Kettering "PM Oper Excellence" ×2; two
identical-pay Cincinnati PMs) collapse to one row each with no distinct-role loss; a "Mar 2025–Present"
résumé no longer reads as future. All offline, no model, no network.

---

## Phase 8 — Pluggable inference (8b on-device via winc.cpp FIRST, then 8a BYO-key auto-eval)

> **Status: ✅ complete — 8b (winc.cpp) 1.19.0 + 8a (auto-eval) 1.20.0 shipped**: it's the default backend
> everywhere AND the engine the Phase 9 web + iOS/Android apps embed, so it lands before 8a (milestones
> 3–4), which reuses the same client with a different base URL.

**Goal:** make the model a **swappable backend** so the same evaluation/tailoring brain runs against a
fully **local model via [winc.cpp](https://github.com/samdotson61/winc.cpp) — the PRIMARY on-device
backend and the DEFAULT** (8b, built first), or a **cloud model via the user's own key** (8a — the
opt-in accuracy upgrade). The key architectural insight: **both halves speak the same wire format — the
Anthropic Messages API.** winc.cpp's `llama-server` serves `/v1/messages` **natively** on localhost, so
ONE tiny HTTP client covers both backends; only the base URL and the key differ. Data always local at
rest; we never receive or store résumés.

### Phase 8a — BYO-key automated eval — **✅ SHIPPED 1.20.0**

| Step | What | Detail |
|---|---|---|
| 8a.1 ✅ | **`InferenceProvider` interface** (same plugin spirit as the scanner): `evaluate(jd, profile, cv)` → structured verdict `{ score, band, recommendation, … }`. The Markdown rubric (`modes/_shared.md` + `modes/eval.md`) is the shared spec. | abstraction |
| 8a.2 ✅ | **`jobdar eval --auto [<url> \| --next \| --all-pending]`** — reads the key `init` already stores in `data/credentials.env` (today it's collected and never used), calls the **Anthropic Messages API** with rubric + JD + `cv.md`, parses the structured verdict, records it via the existing `eval --save` path. Batch mode walks the **prescreen-ranked queue (7.7)** politely — the gate has already removed roles a hard requirement closed, so every token lands on a winnable role. **One JD per request, always** — multi-JD prompts degrade quality, cross-contaminate verdicts, and break 8a.4's quoted-evidence design. | the single biggest daily-use unlock |
| 8a.3 ✅ | **Minimal-slice + zero-retention posture:** send only the JD + relevant CV excerpt, never history; document the retention settings; key never leaves `credentials.env` (gitignored, 0600). | privacy |
| 8a.4 ✅ | **Consistency guardrails + rubric design** (per [docs/eval-tuning-research.md](docs/eval-tuning-research.md)): pinned prompt, temperature 0, structured-output schema so every backend returns the same shape. **Decomposed sub-criteria** — skills 35% / experience 25% / level-fit 20% / logistics 10% / education-gate 10% — each a categorical `strong/partial/none` judgment **with a quoted JD line as evidence**, reason-then-judge ordering, 2 short anchor examples per band. **Code, not the model, computes the 0–5** from the weighted sub-judgments and applies the **shipped band thresholds** (`lib/evaluations.mjs` `BANDS`: **Apply ≥ 4.0 / Research ≥ 3.5 / else Don't** — DECIDED 2026-06-13, the shipped scale stands; the 8a draft's ≥3.5/≥2.0 is dropped). **§3 pipeline (rec-spec):** the eval JSON **MUST NOT contain `salary_fit`** (band merged post-model by `lib/salary.mjs`/8d resolver, §3b); optional `soc_code`/`seniority` gated behind the 8d pay resolver (emit only when it ships); the requirement gate/clamp **REUSES the shipped 7.7.1 `lib/prescreen.mjs` extractors + `lib/levels.mjs classifyTitle` — NO new `lib/gate.mjs`** (one extractor, two enforcement points: prescreen excludes pre-eval, the clamp overrides post-eval); unify on the shipped `YEARS_CEILING {entry:2,mid:5,senior:10}`; code owns the clamp (`qualified:false` → force the score below the Research band into `dont`, carrying the quoted gate line, via the existing `recordEval`). Pipeline order: normalizeDates → extract → gate → judge(fit-only) → clamp(+merge pay) → record. **Cert gate (§3c):** extend `lib/prescreen.mjs` `extractLicense` to promote a stated-**required** cert ("PMP certification required") from flag → hard gate for users who lack it (YEARS_CEILING already screens most over-experience reach roles pre-eval, so this closes the remaining cert/domain gap). The schema also carries a **`required` requirements-check block** (filled first) and the call uses winc's **grammar-constrained** endpoint — see 8a.4a / 8a.4b. | accuracy + the §3 pipeline |
| 8a.4a ✅ | **Grammar-constrained structured output (winc-side SHIPPED — `winc-jobdar` 1.21.3-jobdar.4, §3e).** Issue the **eval** call to winc's OpenAI-compatible **`POST /v1/chat/completions` with `response_format={type:'json_schema', json_schema:…}`** (the 8a.4 schema) — the engine returns guaranteed valid, conformant JSON even from a prose-eliciting prompt, and winc's router preserves `response_format` across both its paths (regression-tested). The eval profile prints this guaranteed-JSON endpoint on ready. **Other jobdar calls stay on `/v1/messages`.** Nothing further needed from winc — this is the structural guarantee that would have caught the malformed-JSON the few-shot run exposed. | valid JSON, guaranteed |
| 8a.4b ✅ | **In-band requirements-check (MEASURED WIN — 2026-06-13, 72-eval A/B/C/D on the real résumé, §3b).** The schema adds a **`required` block — `{min_years, certs[], degree, candidate_meets_all}` — filled FIRST**, forcing explicit requirement reasoning before the verdict. Best form: **pass prescreen's already-extracted, quote-backed required years/degree/clearance INTO the prompt as verified facts** and have the model fill only `candidate_meets_all` against them (stronger than letting it self-extract). Measured: +reqcheck took **Qwen-4B 4/6 → 6/6** gating (fixed over-acceptance AND over-strictness), **gemma 2/3 → 3/3** rejects, **Qwen-2B 1/3 → 2/3**, ≈ +90 output tokens — **adopt**. **REJECTED — few-shot examples:** they backfired (small models more lenient — Qwen-2B over-accepted all 3 reach roles — and JSON validity dropped 6/6 → 4/6 on the 4B); do NOT add without a reject-weighted redesign + re-test. | the gating fix |
| 8a.5 ✅ | **Calibration set + clamp-override log + per-tier agreement (trust):** 30–50 real hand-banded JDs (incl. no-degree / "or equivalent experience" pairs) as **offline** fixtures asserting (1) salary-band accuracy 100% where stated (7.8.1 `extractPay`), (2) gate correctness on reach roles (`qualified:false` every tier — OhioHealth ePMO / Cincinnati 6-yr PM / Carle construction), (3) source-label presence on silent roles (8d resolver). Persist every **clamp override** (model said X, gate/pay said Y) — plus the winc `model` id + `usage` — to a gitignored `data/` log (outreach-ledger privacy: no CV text) to compute per-tier agreement (gemma4-e2b / 4B / 2B) + drift on every prompt/model change. **The live-backend scorer is an opt-in `jobdar calibrate`, NOT `npm test`** — only the fixture corpus + the pure scoring/agreement/drift functions stay in `test-all.mjs` (preserves the offline-test invariant). | trust |
| 8a.6 ✅ | **Fairness guards:** strip name/contact lines from the CV slice before the prompt is built (smaller bias surface AND less PII out the door — off-the-shelf LLMs measurably carry demographic bias in hiring contexts); under `no_degree`, a degree requirement can flag a role but never auto-zero it, and the calibration set makes a regression here a **test failure**, not a vibe. | fairness |
| 8a.7 ✅ | **Bulk-eval economics — the Message Batches API:** `--all-pending` on the API backend submits one Batches-API job (one role per request) instead of N live calls — **50% of standard price**, up to 100k requests per batch, usually done within the hour; results polled and recorded via the same `--save` path. Interactive evals (`--next`, single URL) stay on the live Messages API. | half-price overnight runs |
| 8a.8 ✅ | **Prompt caching for the shared prefix:** rubric + `cv.md` are byte-identical across every eval in a run — mark them with `cache_control` so each call pays full price only for the JD (~0.1× input price on the cached prefix; 5-min TTL that a paced sequential queue keeps warm). Requires a byte-stable prefix: no timestamps or per-run IDs ahead of the JD. | each eval pays only for the JD |
| 8a.9 ✅ | **Targeted escalation ladder (optional cost/quality, §3f).** Run the fast low-end model (gemma4-e2b — safe on rejects, occasionally over-strict) on EVERY role, then **re-score only the borderline / negative verdicts on Qwen-4B** (via winc team mode or a second profile) — recovers gemma's over-strict misses without paying 4B latency on every job. Measured: gemma+reqcheck 3/3 rejects but over-strict; Qwen-4B+reqcheck 6/6. | pay 4B only where it matters |

### Phase 8b — on-device backend: winc.cpp primary (private, no key, no cost) — **✅ SHIPPED 1.19.0**

> **Shipped 1.19.0 (2026-06-13), Jobdar side:** `lib/inference.mjs` (one Messages-API client for local +
> api), `jobdar backend` (status / `--check` canary / `--install`), `inference: local|api|auto` with
> **local as the default**, `inference_url`. Verified end-to-end against a live `winc serve --eval`
> (Qwen3.5-4B) — `/health` + a real eval round-trip, zero external network; offline tests (85 total).
> 8b.3 (Ollama/llamafile OpenAI-compat shims) now also shipped; only 8b.5 (confidential cloud) remains
> future (documented-only). The cross-repo winc contract below stands; the local install here is
> `1.21.3-jobdar.3` (pin remains jobdar.4).

> **Source of truth: the published repo — [github.com/samdotson61/winc.cpp](https://github.com/samdotson61/winc.cpp).**
> All 8b integration work targets winc.cpp as released on GitHub (its README, `winc.toml` schema,
> the `winc serve --eval` contract, and releases) — never a local checkout, which may drift behind origin.
> **Dependency: the `winc-jobdar` BRANCH** (newest `1.21.3-jobdar.4`), NOT master — its **`winc serve
> --eval`** profile is the contract: reasoning OFF at the template level (budget-0 measured broken on
> Qwen3.5 → empty content), q8 KV / 16384 window, a native `/v1/messages` router on the `winc.toml`
> port (default `127.0.0.1:8080`), auto-picking **gemma4-e2b < 5 GiB / qwen3.5-4b ≥ 5 GiB** (qwen3.5-2b
> floor-only — over-accepts). **Two surfaces:** `/v1/messages` for general calls, and a **guaranteed-JSON
> eval path — `POST /v1/chat/completions` with `response_format=json_schema`** (shipped in jobdar.4; the
> eval profile prints it on ready, the router preserves `response_format` across both paths). Branch
> builds are versioned `-jobdar.N` and **refuse a master self-update**.
> (The old "origin/master v1.4.5 / `winc serve`" note was doubly stale — master is now v1.21.2, and the
> bare-`serve` agent profile runs reasoning ON, which returns EMPTY content to an eval client.)
>
> **Why 8b now leads Phase 8:** this local engine is the default backend for every surface AND what the
> Phase 9 web + iOS/Android apps embed (WebLLM in-browser; the native wrapper ships the same on-device
> inference) — landing it first means everything after it builds against the real default.

| Step | What | Detail |
|---|---|---|
| 8b.0 ✅ | **One-command local bootstrap — `jobdar backend --install`** (+ the on-device `jobdar init` path): `winc setup` (engine/PATH) → **winc-tiered model pull (DELEGATED — never hardcode an alias; gemma4-e2b ~2.9 GB low-end, qwen3.5-4b 2.6 GB ≥ 5 GiB)** → `winc serve --eval` → canary-verify (`GET /health` 200 + one real eval round-trip). Target **fully-featured < 10 min** (the model download is the long pole). Install via a prebuilt `-jobdar.N` release (no compiler) or `git clone -b winc-jobdar … && ./install.sh` (source; install.sh auto-installs Go) fallback. **This is the Phase 9 first-run prototype** — same model family, size budget, and 10-min SLA. **Cross-repo dep:** winc must publish prebuilt `-jobdar.N` releases per OS/arch (the sha256 download path exists in `update.go`, gated off for jobdar builds) for the no-compiler path. | the onboarding gate — BUILD FIRST in 8b |
| 8b.1 ✅ | **winc.cpp as the PRIMARY local backend.** `inference: local` points the SAME 8a client at winc's local server (default `http://127.0.0.1:8080/v1/messages`, configurable via `inference_url` to match the user's `winc.toml`) — it speaks the Anthropic Messages API natively, so no translation layer and no new client code. No key, no cost, fully offline. The client captures the Messages-API `usage` block and surfaces input/output tokens as a per-eval transparency "cost" (tokens on the local path; dollars only on the 8a/api path). | one client, two backends |
| 8b.2 ✅ | **Friendly liveness UX:** probe `GET /health` (proxied through to llama-server → 200 only when fully loaded); if down, print the exact start command **`winc serve --eval`** (NOT bare `winc serve` — that's the agent profile with reasoning ON → empty content) plus the install pointer (`git clone -b winc-jobdar https://github.com/samdotson61/winc.cpp` → `./install.sh`, or a prebuilt `-jobdar.N` release + `winc setup`). **Delegate model choice to winc** — never print or pull a specific alias. | onboarding |
| 8b.3 ✅ | **Alternate local runtimes** behind the same interface for users without winc: **Ollama** / **llamafile** (OpenAI-compat shim mapped to the shared schema). Secondary — winc is the documented happy path. | breadth |
| 8b.4 ✅ | **Backend selector + fallback:** `inference: local\|api\|auto`. **Default for everyone: `local` via winc.cpp** — private, free, no key; `api` (BYO key) is the opt-in accuracy upgrade; `auto` runs local and offers an API upgrade on borderline roles. Clear UX about the privacy/quality tradeoff. **Flip `PROFILE_DEFAULTS.inference` from `'api'` to `'local'` here** — shipped code still defaults to `api`, contradicting Open Decision 2 (local-default, decided 2026-06-10). | user control |
| 8b.5 ⬜ | **(Future) confidential-cloud option:** TEE-based managed inference for cloud quality the operator can't read — only if local proves too weak and users won't BYO key. Documented, not built. | advanced |

**Verification gate:** the same JD evaluates end-to-end with `inference: api` (BYO key) and with
`inference: local` (**winc.cpp's `winc serve --eval` running; zero external network calls**), both recording the
same structured verdict shape into the pipeline.

---

## Phase 8c — Document understanding (PDFs in, structured data out)

> **Status: ✅ shipped 1.21.0** (2026-06-14) — DOCX/PDF text extraction + `jobdar import` + the light AI pre-confirm (the Search-tab queue thinner). Verified on-device with two real résumés. DOCX via system `unzip` (no new deps); PDF via `pdftotext` when present. 8c.5 covers text/error/triage paths (PDF fixtures deferred).

**Goal:** Jobdar automatically reads and understands PDFs. A résumé PDF/DOCX becomes `data/cv.md` + a
prefilled `config/profile.yml` with no hand-editing, and `jobdar eval` accepts a PDF JD. The division of
labor is strict: **extraction is deterministic** (a parser, no model); **understanding is the inference
backend's job** (text → structured fields) — so résumé understanding is private-by-default on winc.cpp
and accuracy scales with whichever backend the user picked. (Supersedes the 6.6 sketch with a real plan;
library survey in [docs/eval-tuning-research.md](docs/eval-tuning-research.md) §5.)

| Step | What | Detail |
|---|---|---|
| 8c.1 ✅ | **Text-extraction layer** `lib/pdf_extract.mjs`: [unpdf](https://github.com/unjs/unpdf) (maintained, Mozilla pdf.js under the hood, no native binaries, runs in Node **and** serverless — the same code will serve Phase 9's server) as **the one new dependency**. `extractText(buffer) → { text, pages, meta }`. DOCX via a thin `mammoth` adapter; `.txt`/`.md` pass through. | one module, swappable |
| 8c.2 ✅ | **`jobdar import <file>`** (+ wired into `jobdar init`): extract → send ONLY the extracted text to the inference backend with a structuring prompt → write `data/cv.md` (canonical Markdown CV) + prefill `config/profile.yml` (name, metro, suggested level(s), skills) → show a bilingual confirm/edit summary **before** saving anything. | the "upload résumé → go" path |
| 8c.3 ✅ | **PDF JDs in eval:** `jobdar eval <file.pdf>` runs the same extraction and feeds the JD text through the existing eval path (eval already accepts files/stdin — this puts a PDF reader in front). | symmetry |
| 8c.4 ✅ | **Scanned/image PDFs:** detect a near-empty text layer and fail honestly — a bilingual error + "export as text/DOCX" hint. OCR is documented as out of scope for now. | honest failure |
| 8c.5 🔶 | **Tests:** fixture PDFs in `test-all.mjs` — a text-based résumé (EN + ES), a JD, and an image-only scan — extraction asserted offline, no network, no model. | regression net |

**Verification gate:** a real résumé PDF → `jobdar import` → confirmed `cv.md` + prefilled profile, then
`jobdar scan` and `jobdar eval --next` complete — **zero hand-edited YAML, fully offline on winc.cpp**.

---

## Phase 8d — Offer evaluation

> **Status: 🔶 core shipped 1.24.0** (2026-06-14) — `lib/pay.mjs resolvePay` (STATED→COMPARABLE→BLS, mandatory source label) + national wage seed floor + `socForTitle` router + `modes/offer.md` rubric (EN/ES). Deferred: `jobdar offer` capture (8d.1), live BLS bulk-download (8d.2b — seed floor substitutes), multi-offer compare (8d.4).

**Goal:** when applications turn into offers, evaluate the offer the way we evaluate fit — against the
user's profile, region, and **real wage data** — on the same swappable backends. The model never invents
numbers: deterministic code supplies market context; the model interprets it. (Data sources in
[docs/eval-tuning-research.md](docs/eval-tuning-research.md) §4.)

| Step | What | Detail |
|---|---|---|
| 8d.1 | **`jobdar offer <company>`** — bilingual interactive capture: base, bonus, benefits, PTO, metro/remote, start date → stored on the tracker row (new `offer` fields + an `offer` state in `templates/states.yml`, EN canonical / ES alias per 1.4). | capture first |
| 8d.2 | **Wage cache from the KEYLESS OEWS bulk download (rec-spec §2 — REVISED; BLS-source DECIDED 2026-06-13):** **no API key, no account, works out of the box.** Ship a small **national-by-SOC seed** (`data/seed/wages-national.yml`, sliced from the OEWS national release) as the always-offline floor so coverage is never blank; `data/cache/wages.yml` then **grows on demand** — on a region change / a new metro surfacing, download the keyless OEWS metro table(s) once and append only the needed `(area, soc)` rows, offline thereafter (`jobdar pay --refresh` re-pulls the annual release). **KEEP the metro cost-of-living index 8d.3/8d.4/4.7 depend on** — relocate it into the seed, do NOT drop it. (Pay sparsity is real — only 23/79 study postings stated pay, worst on the target roles, IT Support 0/8 — so an external anchor is required, not optional.) | facts from data, keyless |
| 8d.2a ✅ | **`lib/pay.mjs` — three-layer `resolvePay(jd, role, metro, target)`:** STATED (`lib/salary.mjs extractPay`, high) → COMPARABLE (in-scan median {soc, seniority, metro}, n≥3, reusing `cv_render matchedKeywords`, med) → BLS (`wages.yml` percentile by seniority: entry→p25 / mid→median / senior→p75, base). Always returns `{annualMin, annualMax, source, confidence, band}`; **the source label is mandatory UI text** ("stated $X" / "est. $Y (N comparable)" / "est. $Z (BLS median, [occ], [metro])"); never blank, never model-produced. | the de-skew engine |
| 8d.2b | **`lib/bls.mjs` (keyless bulk) + the hard split (§2b/§2c):** `ensureWages(regions, socCodes)` (idempotent, resumable) downloads the relevant **OEWS annual release table(s)** — keyless HTTPS from `download.bls.gov` / `bls.gov/oes` (XLSX/TXT flat files; set a descriptive User-Agent per BLS guidance) — and slices the needed `(area, soc)` rows into the cache; `lookupWage(...)` is a pure cache read; `nationalAdjusted(soc, metro)` (national row × metro pay-differential, `source:'bls-national-adj'`) covers rural/unreachable. **No API key** — the v2 API needs per-user registration (not out-of-the-box) and keyless v1 caps at ~10 req/day, so we take the bulk download. SSRF-guarded via `lib/http.mjs` (`download.bls.gov` + `www.bls.gov` allowlist, HTTPS, `redirect:'error'`). **Hard split:** the **model is the SOC + seniority router ONLY** (deterministic `data/seed/soc-map.yml` fallback for offline/no-model — local-first); **software owns every number** (download, slice, area-code lookup, percentile + hourly↔annual, cache). **SECURITY.md (lockstep):** add `download.bls.gov` / `www.bls.gov` as permitted outbound hosts — public reference data, no PII, no key. | model routes, software calculates |
| 8d.3 ✅ | **Offer rubric** `modes/offer.md` (EN + ES): the model weighs comp-vs-market (from 8d.2), benefits completeness, growth trajectory, commute/remote — plus entry-level-specific factors (training, mentorship, first-role résumé value) → structured verdict `{ assessment: strong/fair/below, negotiation_levers[], questions_to_ask[] }` under the same 8a.4 consistency guardrails. | judgment on top of facts |
| 8d.4 | **Multi-offer compare:** `jobdar offer --compare` — a COL-adjusted side-by-side of every recorded offer. | the real decision moment |
| 8d.5 | **Tests:** wage-math fixtures + verdict-shape checks on both backends in `test-all.mjs`. | parity |

**Verification gate:** record a real-shaped offer; the verdict cites metro wage context and returns the
identical structured shape on `inference: api` and `inference: local`; a Spanish run renders fully in Spanish.

---

## Phase 8e — The engine contract (CLI, web, mobile plug in here)

> **Status: ✅ shipped 1.24.0** (2026-06-14) — `lib/engine.mjs` (no-console verbs + onProgress) + `jobdar serve` (localhost JSON façade) + `docs/engine.md` + a conformance test driving the full pipeline via the engine only. Phase 9 builds against this seam.

**Goal:** freeze the headless pipeline — **import → scan → eval → track → build** — behind ONE documented
programmatic seam, so the CLI, the web app, and the mobile app are thin front-ends over the **same engine**.
This is the phase that makes Phase 9 a UI project instead of a rewrite.

| Step | What | Detail |
|---|---|---|
| 8e.1 ✅ | **`lib/engine.mjs`** — export the verbs as functions with **no console I/O** (structured returns + progress callbacks): `importDocument()`, `scan()`, `evaluate()`, tracker verbs, `buildCv()`. The CLI subcommands become thin callers — behavior identical, seam explicit. | extract, don't rewrite |
| 8e.2 ✅ | **Local HTTP façade** `jobdar serve` — the same verbs as JSON endpoints on localhost (the dashboard already proves the pattern); CORS locked to localhost; no secrets in responses. This is what a dev-build web front-end — or a phone on the LAN — talks to. | the plug socket |
| 8e.3 ✅ | **Contract doc** `docs/engine.md` — verb signatures, the `Job` / `Verdict` / `Offer` shapes, progress events; versioned. **Phase 9 builds against this doc, never against internals.** | the promise |
| 8e.4 ✅ | **Conformance test:** one script in `test-all.mjs` drives a full pipeline run through `lib/engine.mjs` only — no CLI — and asserts every shape. | keeps the seam honest |

**Verification gate:** a single script (no CLI) goes résumé-PDF → scanned → evaluated → tracked via
`lib/engine.mjs`; `jobdar serve` does the same over HTTP from a browser `fetch`.

---

## Phase 8f — Steerable customization (re-runnable, directive-driven materials)

> **Status: ✅ complete.** 8f.1 shipped 1.27.0 (`jobdar tailor --instruct` — CV summary + cover letter); **8f.2 shipped 1.28.0** (2026-06-15) — grounded `draftOutreach` behind `jobdar outreach --draft`. _Supersedes the cut Phase 8d offer-capture remainder._

**Goal:** let the user **steer** their application materials with natural-language directives and
**re-run** to refine — **grounded** (directives never add facts) and at **low temperature** so a re-run is
deterministic. The directive is the lever, not a dice-roll: a re-run only changes the artifact when a
directive (or the résumé) changes. This is the CLI foundation for the Phase 9 Apply-tab "Customize."

| Step | What | Detail |
|---|---|---|
| 8f.1 ✅ | **`jobdar tailor` customization** — `--instruct "<directive>"` layers per-role directives, re-derives from résumé+JD at `temperature: 0`, writes versioned `-vN` variants; `--list` / `--reset` / `--revise`; idempotent (unchanged content hash = no-op). New `lib/customize_store.mjs` (`data/customize.yml`), a `temperature` passthrough in `lib/inference.mjs`, and a grounding-guard `directiveBlock` in `lib/tailor.mjs`. | the lever, not the dice |
| 8f.2 ✅ | **`jobdar outreach --draft`** — a NEW grounded `draftOutreach` engine verb (mirrors `tailorRole`): one real fit reason + one ask, gated through the existing `lintDraft` + cadence (warns, never blocks — drafting ≠ sending); `--instruct` / `--channel` / `--person`; versioned `-vN`, idempotent. Never auto-logs to the cadence ledger. | model-drafted outreach |

**Verification gate:** re-running `jobdar tailor <role> --instruct "<same>"` is a no-op; a changed
directive writes the next `-vN`; an adversarial directive ("claim 10 years of X") does not fabricate.

---

## Phase 9 — Web and mobile apps (future / post-1.0)

> **Status: 🏗️ building — 9.0 partially landed (`@jobdar/app` 1.1.0, 2026-06-15)** (full spec: [`docs/phase9-architecture.md`](docs/phase9-architecture.md)). **The app now runs the REAL engine, not a mirror:** the repo is a pnpm workspace, a new private **`@jobdar/engine`** package re-exports the pure `lib/` modules, and `apps/jobdar` imports it — so Search's level filter + prescreen gates + Apply's 0–5 score/clamp/band/pay are the **exact** CLI functions (`filterByLevel`, `prescreenRole`, `prepEval`, `buildVerdict`). The hand-written app mirror is deleted; `src/engine.ts` is a thin adapter. This fixed the level mismatch (entry/mid candidates no longer see senior/director roles) at the source. **9.1 landed (CLI 1.32.0):** `jobdar serve` is now the **full pipeline HTTP façade** over `lib/engine.mjs` — `GET /pipeline · /profile` (secrets redacted) `· /cv · /outreach/due` and `POST /scan · /prescreen · /eval/next · /eval/save · /tracker/set · /outreach/log` (plus the prior `/health · /evaluate · /import`), each reusing the real engine verbs + `pipeline.tsv`. Opt-in **LAN access + bearer token** (`jobdar serve --host 0.0.0.0`, auto-minted or `--token`) lets the iPhone on the same Wi-Fi drive it; default stays loopback. `test-all.mjs` **116** (+1 subprocess serve integration test). **⚡ ARCHITECTURE LOCKED (2026-06-15, Sam): all surfaces (web, desktop, mobile) point BY DEFAULT at the local jobdar CLI + winc engine as the ENTIRE full stack** — the model is **always server-side**; **cloud model API keys are a pluggable Pro-tier upgrade / monetization** (tracked at 9.6 below). This **supersedes the in-browser WebLLM / `llama.rn`-embedded plan** (no dual model implementation; no `kind:'local-embedded'`). Remaining: the model-generation endpoints (`POST /tailor`, `/outreach/draft`); **repoint the app off its stand-ins** (typed serve client; delete `SAMPLE_*` data + the keyword judge + the in-app generators — keep `@jobdar/engine` only for derived UI: band/level/cadence labels); live résumé upload→`/import`; EAS native + new-match push; then the Pro tier. **One Expo codebase (React Native + react-native-web) → web PWA + native iOS/Android**; the PII-free scanner-proxy (`apps/server`) stays an always-on Node option (Fly/Render) for hosted discovery. Privacy story: **the user runs their own jobdar+winc stack; their résumé/data live on their machine** (hosted-for-strangers is not a near-term goal).

**Goal:** a hosted, cross-platform, bilingual **web app** — and, after it, a **mobile app** — where a
non-technical user uploads a résumé and is pointed toward fitting jobs with little effort. **Ease of use
and accuracy** are the two named targets. Both surfaces are thin front-ends over the **Phase 8e engine
contract** (import → scan → eval → track → build) and the Phase 8 inference layer — and, crucially,
evaluation **runs in the browser by default**, so the résumé never leaves the device. Both surfaces
follow the [design philosophy](#design-philosophy): clean and tight, homey rather than chummy — the
user always knows what happened, what it cost, and what's next.

> **Privacy by architecture:** the browser holds the résumé and runs the model (WebLLM/WebGPU); the **server
> only runs the PII-free scanner** (fetches public job listings) and serves static assets. So the cloud
> delivers the app and the public job data, but **never receives the résumé** by default. This is the
> liability-limiting design — not "trust us with your data," but "your data never reaches us."

**The app shell — three tabs that ARE the workflow** (canonical for web + mobile; design intent 2026-06-14). One GUI, three tabs mapping 1:1 onto the shipped pipeline; the bottom bar **1·Search → 2·Apply → 3·Follow-up** is the same spine on phone + web:

1. **Search** — onboarding prompt *“Upload your résumé and tell us what you want”*: parse the résumé locally (9.4) → infer field/title/level/region → server-side zero-token `scan`/`seed` → a **light on-device AI pass** labels each result (“likely fit / worth a look / skip”) to drop obvious misses BEFORE the expensive scoring pass (efficiency: it thins the queue `eval` runs on). Free-form intent works too (“jobs that take me outside”) → the model maps it to a search. = shipped `prescreen` (zero-token gate) + a thin AI confirm. A **“find jobs with transferable skills” toggle** (`transferable_skills`, shipped 1.24.0) makes the pre-confirm + eval credit genuine adjacent/foundational skills for new grads & career changers — strongly targeted, never a flood.
2. **Apply** — the scoring stage: `eval --auto` (8a decomposed rubric → 0–5 → Apply/Research/Don’t, gate/clamp, pay band) on the pre-thinned set, then one-tap tailored CV + cover letter (`pdf`).
3. **Follow-up** — `outreach`: warm-contact finder + the code-enforced polite cadence + draft lint.

All three run on the **local AI by default** (8b) with the **tiered API-key upgrade** (8a) for premium editions — the same `inference: local|api|auto` backend the CLI already ships. The Search tab’s light-AI pre-confirm is a NEW thin layer between the in-browser model and the heavy `eval` — a cheap yes/maybe/no, not a score.

**Finalized milestone ladder** (2026-06-15; full detail + architecture diagrams + verification in [`docs/phase9-architecture.md`](docs/phase9-architecture.md)). **Re-aligned 2026-06-15 to the locked architecture** (Sam): the apps are thin GUIs over a **local `jobdar serve` + winc engine as the full stack** — the model is always server-side; cloud API keys are a later **Pro tier**. The in-browser **WebLLM/`llama.rn`-embedded** track and the `Store`/`DocExtract`/`InferenceClient` *model*-port extraction are **dropped** (no dual model implementation). Locked: Expo one-codebase (web + native) · serve is the seam · default loopback, opt-in LAN+token · per-surface accuracy measured, not asserted.

| # | Milestone | Deliverable |
|---|---|---|
| 9.0 | **App on the real deterministic engine** — ✅ *landed (`@jobdar/app` 1.1.0)* | pnpm workspace + private **`@jobdar/engine`** (re-exports the pure `lib/` modules) + `apps/jobdar` rewired to it (real `filterByLevel`/`prescreenRole`/`prepEval`/`buildVerdict`; mirror deleted; `test-all.mjs` green = zero CLI behavior change). The in-browser-model ports + dual-adapter spike are **dropped** — the model stays server-side over serve. |
| 9.1 | **`jobdar serve` full pipeline façade + LAN access** — ✅ *landed (CLI 1.32.0)* | serve exposes the whole pipeline as JSON (`/pipeline·/profile·/cv·/outreach/due` + `POST /scan·/prescreen·/eval/next·/eval/save·/tracker/set·/outreach/log` + the prior `/health·/evaluate·/import`) over the real engine + winc; opt-in `--host 0.0.0.0` + bearer token for the phone; +1 subprocess test (**116**). The `apps/server` PII-free scanner-proxy stays an always-on Node option (Fly/Render) for hosted discovery. |
| 9.2 | **Model endpoints + repoint the app onto serve** | `POST /tailor` + `/outreach/draft` (real-model, customize/ledger bookkeeping, 503 when winc down); a typed serve client in the app; Search/Apply/Follow-up `fetch` from serve; **DELETE** `SAMPLE_*` data + the keyword judge + the in-app generators; keep `@jobdar/engine` only for derived UI (band/level/cadence labels); a "start `jobdar serve` / enter token" connect screen. |
| 9.3 | **Web PWA + upload→/import** | three-tab `expo-router` SPA polished over serve; résumé upload → `POST /import` (server extract+structure); installable/offline shell; EN/ES parity; WCAG; loading + backend-down states. |
| 9.4 | **Native iOS/Android (EAS)** | same Expo source → EAS build → iOS + Android, talking to the user's `jobdar serve` over the LAN (token); **new-match push notifications**; store-submission prep. |
| 9.5 | **Pro tier — pluggable cloud model keys (monetization)** | BYO cloud API key (the existing `inference:api` path) as a paid upgrade over the default local winc; explicit-consent confidential-cloud fallback; entitlement/key UI; the general monetization surface (design TBD with Sam). |
| 9.6 | **Privacy + measurement gates** | the user runs their own stack (résumé/data stay on their machine); a CI guard that the app only talks to serve; **per-surface** match accuracy + task success + time-to-first-match; end-to-end verification (Spanish-preferring phone persona). |

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
| **BLS pay data (8d): bulk-file size / format / annual cadence** | Low–Med | DECIDED: keyless OEWS bulk download (no API key/account — the v2 API needs per-user registration, v1 caps at ~10/day). Residual: the all-data flat file is large → slice to the user's metros + the IT/PM SOCs, don't cache wholesale; the format/layout can shift between annual releases → parse defensively + pin the release year per cached row; ship the national-by-SOC seed so a download failure is never blank; document `download.bls.gov`/`www.bls.gov` in SECURITY.md (no PII, no key) |
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
8. **BLS data source (Phase 8d).** → **DECIDED 2026-06-13: keyless OEWS bulk download, NO key, NO account.**
   The v2 API requires per-user registration (an external account the app can't generate silently —
   not out-of-the-box); the keyless v1 dies at ~10 requests/day. So Jobdar downloads the OEWS annual
   release tables directly (keyless HTTPS) and slices locally — account-free, offline after first fetch,
   honoring "Jobdar ships no API keys." Governing principle: **no-frills, clean-cut, works out of the
   box** — no feature that forces the user through an external signup. (Rejected: a shared shipped key
   — rate-limit/abuse risk + contradicts the no-keys posture.)

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

---

## Phase 10 — Fully-local iPhone (ACTIVE, direction locked 2026-07-08)

**Sam's call: fully-local iOS FIRST** (download from the App Store, works with no Mac and no serve),
**then** the web app / jobdar.ai hosted UI, **then Android** using the same stack for parity
(llama.rn = llama.cpp bindings for React Native on BOTH platforms). Full analysis + TestFlight plan:
`~/Documents/Jobdar-Beta.md`.

Both backend halves move into the app: the engine (mostly pure JS in `@jobdar/engine` already; the
fs-bound pieces get ports) and the model (llama.rn, grammar-JSON + greedy — the same eval profile winc
serves). The serve-backed mode remains for the Mac-companion path.

| Slice | Scope | Status |
|---|---|---|
| **L0 spike (go/no-go)** | llama.rn dev build; same GGUF/prompt/grammar as winc; verdict parity | **PASSED 2026-07-08** — on-device `apply 4.1` vs winc `apply 4.5` (same band/clamp, one sub-rating step of template/build drift; sim CPU — device speed TBD) |
| L1 | Local backend dispatcher (`src/local/backend.ts`) behind the same `servePost/serveGet` contract (store.ts untouched) + file Store (`src/local/files.ts`, CLI-identical TSV/JSON formats) + pure `lib/pipeline_pure.mjs`/`lib/outreach_pure.mjs` splits + fs-free provider creds seam | **SHIPPED 1.47.0** |
| L2 | Native scanning + prescreen: engine-exported providers (no CORS on native), seed catalog via generated `packages/engine/seed.mjs`, pool 4 for phone radios | **SHIPPED 1.47.0** |
| L3 | Model manager (Settings screen): confirm-gated resumable GGUF download from the winc registry (unsloth HF), RAM-tiered default (4b ≥7GB, 2b below), delete, backend mode chooser (on-device ⇄ Mac serve w/ URL+token — the connect screen) | **SHIPPED 1.47.0** |
| L4 | evaluate / tailor / outreach-draft via llama.rn (grammar-JSON + greedy, winc eval profile); intent parse = deterministic keyword fallback on-device (model parse later); on-device calibration matrix re-run PENDING (needs device hardware) | **CORE SHIPPED 1.47.0** |
| L5 | JS docparse: docx (fflate) + txt/md; PDF deferred with the honest on-screen error | **SHIPPED 1.47.0** |
| L6 | TestFlight: eas.json profiles ready; remaining = Sam's account steps (App Store Connect record, eas login, icon choice) + first internal build | ready for Sam |

Known constraints: no Metal in the iOS **simulator** (parity testing only; speed on hardware);
qwen3.5-4b Q4 (~2.4GB) needs 8GB devices — 2b (~1.2GB) is the floor tier and its flatter calibration
re-opens on-device (the eval-tuning research + thumbs feedback loop apply); model downloads are
post-install and confirm-gated (App-Store-legal, established local-LLM pattern).
