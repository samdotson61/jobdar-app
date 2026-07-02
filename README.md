# Jobdar

**🇺🇸 English** · [🇲🇽 Español](README.es.md)

A bilingual (American English / Español) US job-search command center for **new grads and people breaking
into the workforce** — including those **without a college degree**. **Region-adaptable** (Midwest by
default; toggle to South, Southwest, Northeast, West, or nationwide) and **entry-level by default** (toggle
to mid-level, and senior when you choose it).

Jobdar scans company career pages (with first-class support for **Workday** and **iCIMS**, the ATSs that
dominate US enterprise employers), evaluates each role against your résumé, tailors an ATS-friendly CV and
cover letter, and tracks every application.

> **Status:** Phases 0–7, 5.5, 7.7, 7.8, 8b, 8a, 8c, 8e + 8f **complete** — **Jobdar CLI `1.43.0`**: bilingual core; **six live-verified
> scanner providers** (Workday, iCIMS, Greenhouse, Lever, Ashby + an opt-in JSON-LD reader) plus an opt-in
> **USAJobs** federal aggregator (BYO free key); level + region
> toggles and the `jobdar init` wizard; the full **discover → prescreen → evaluate → track → build** pipeline —
> `scan` finds and filters roles (it never scores), `jobdar prescreen` **gates + ranks the queue zero-token**
> (hard gates screen with a quoted reason, never silently), the model's `jobdar eval` scores fit (0–5 →
> Apply / Research / Don't) and records it, you advance status (`a` in the TUI or `jobdar tracker --set`),
> `jobdar outreach` finds the **warm contact** and keeps follow-ups polite by construction, and `jobdar pdf`
> builds the tailored ATS résumé; a scrollable cursor-driven `jobdar tui` workspace + a web dashboard with
> analytics; freshness tracking (`posted` / `first_seen`, `scan --prune`). Remaining for the 1.0 ship:
> npm publish + marketplace, then a closed beta. See **[ROADMAP.md](ROADMAP.md)** for the full build plan
> and **[CHANGELOG.md](CHANGELOG.md)** for what's shipped.

## Your data stays local

Your résumé and history stay **on your device** (or in your browser, for the web app). The model that does
the thinking is **swappable**:

- **On-device model by default** — private, no API key, no cost (great for non-technical users).
- **API plugin (opt-in)** — bring your own key for higher accuracy; only the minimal slice is sent, with
  zero-retention.
- **Confidential-cloud** — a later option for cloud quality the operator can't read.

The scanner only ever touches **public** job listings — never your résumé — so **we host no personal data**.
That protects your privacy and limits our liability. See **[SECURITY.md](SECURITY.md)** and
**[Legal & responsible use](docs/legal.md)** for the full posture (zero telemetry, SSRF-guarded scanners).

**Your profile never reaches a repo.** `config/profile.yml` (name, metro, salary target — built by
`jobdar init` from your answers or uploaded résumé) and `config/portals.yml` (the employers you're
targeting) are **gitignored and excluded from the npm package**; the repo ships only PII-free
`*.example.yml` templates. Your résumé (`data/cv.md`), API key, and pipeline live under the gitignored
`data/` dir.

**Portable between devices.** All your data lives in one *user data home*: a repo checkout keeps it
inside the folder (the whole clone is a self-contained, movable unit), a global install uses
`~/.jobdar` (never inside `node_modules`, so updates can't wipe it), and **`JOBDAR_HOME`** relocates
it anywhere. Moving machines = copying one folder; `jobdar doctor` shows the active home. Language
tables and the employer catalog ship with the code, so they work from any location.

## Two surfaces, one engine

- **CLI (the backbone)** — local-first, for technical users, run with your own AI CLI/API. Ships first.
- **Web app (later — [Phase 9](ROADMAP.md#phase-9--web-and-mobile-apps-future--post-10))** — a hosted,
  cross-platform, bilingual app for non-technical users: upload a résumé, get pointed toward fitting jobs
  with little effort. Evaluation runs **in your browser** by default, so the résumé never leaves your
  device. Targets: **ease of use** and **accuracy**.

## Using the CLI

`jobdar` is one command with simple subcommands:

```bash
jobdar init           # bilingual setup wizard (region, level, profile)
jobdar scan           # scan portals for new roles (no model needed)
jobdar seed --region midwest --write   # add real employers for your region
jobdar prescreen      # gate + rank pending roles by likelihood (no model needed)
jobdar eval <url>     # evaluate a role against your résumé
jobdar pipeline       # scan -> evaluate -> track, end to end
jobdar tailor [company] # AI: role-targeted CV summary + cover letter (grounded, local model)
jobdar pdf [company]  # tailored ATS résumé → output/ (HTML, +PDF with Playwright)
jobdar outreach <url> # find people to contact about a role; polite follow-ups, enforced
jobdar tracker        # view your applications
jobdar dashboard      # localhost web view of your pipeline
jobdar tui            # interactive terminal dashboard
jobdar doctor         # check your setup
```

Install with `npm i -g jobdar` (or run `npx jobdar` with no install). Inside an AI CLI like Claude Code,
the same actions are available as the slash command `/jobdar scan`, `/jobdar eval`, and so on.

New here? The **[Getting Started guide](docs/getting-started.md)** is the 5-minute path from install to
your first scan — `jobdar init` walks you through it in English or Spanish, no YAML editing.

## Who Jobdar is for

1. **New grads** — college graduates in their 20s landing their first professional role.
2. **People breaking into the workforce** — including those without a degree, career-changers, and
   first-time job-seekers.

**Entry-level is the default**, but levels are **toggle-able**: include mid-level roles, or opt into senior
(which then ranks normally, no penalty).

## Why Jobdar is different

- **American English + Spanish**, full parity (English primary) — across CLI and web app.
- **Scanner for US enterprise** — Workday + iCIMS first, plus Greenhouse/Lever/Ashby.
- **Discover → prescreen → evaluate pipeline** — `scan` finds and filters roles but **never scores them**; `jobdar prescreen` screens hard gates (years required, active clearance, degree gates) **with a quoted reason — never silently** — and ranks the rest by skill overlap + freshness; the model's `jobdar eval` scores fit **0–5** against your résumé and records an **Apply / Research / Don't** band. `jobdar tui` shows discovered roles as *pending eval* until the model has scored them.
- **A warm contact beats a cold application** — `jobdar outreach` builds LinkedIn people-search links (you browse and choose; Jobdar never scrapes or sends), drafts stay yours to send, and the polite cadence — 2 people per role, ONE follow-up after 5+ business days, then stop — is enforced in code.
- **Region toggle** — Midwest by default; switch to Northeast/Southeast/Southwest/West/nationwide and the seeds, location filters, and search adapt.
- **Level toggle** — entry by default; mid first-class; senior opt-in (ranks normally when chosen).
- **A dedicated no-degree path** — surfaces skills-based, apprenticeship, and "or equivalent experience" roles.
- **Transferable-skills toggle** — for career-changers and new grads: credits genuine adjacent skills toward a role's requirements and treats an "X+ years in [field]" ask as bridgeable, not a hard wall — without lowering the bar (`transferable_skills` / `eval --transferable`).
- **Private by design** — local data + on-device model by default; no résumé ever hosted by us.
- **Easy for anyone** — a guided, bilingual setup wizard for the CLI today; a friendly web app for non-technical users later.

## Next steps

The roadmap's MVP cut line (CLI): foundation & branding → American-English core → Workday provider →
the level toggle (entry default) + no-degree tuning → the region toggle (Midwest seeded first) → the setup
wizard. The pluggable local-model backend and the web app follow post-1.0.
