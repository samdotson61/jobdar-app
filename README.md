# Jobdar

**🇺🇸 English** · [🇲🇽 Español](README.es.md)

A bilingual (American English / Español) US job-search command center for **new grads and people breaking
into the workforce** — including those **without a college degree**. **Region-adaptable** (Midwest by
default; toggle to South, Southwest, Northeast, West, or nationwide) and **entry-level by default** (toggle
to mid-level, and senior when you choose it).

Jobdar scans company career pages (with first-class support for **Workday** and **iCIMS**, the ATSs that
dominate US enterprise employers), evaluates each role against your résumé, tailors an ATS-friendly CV and
cover letter, and tracks every application.

> **Status:** Phase 0 (foundation & branding) **complete** — the CLI installs, passes `doctor`, and
> runs a dry-run scan. See **[ROADMAP.md](ROADMAP.md)** for the full Phase-and-Step build plan and
> **[CHANGELOG.md](CHANGELOG.md)** for what's shipped.

## Your data stays local

Your résumé and history stay **on your device** (or in your browser, for the web app). The model that does
the thinking is **swappable**:

- **On-device model by default** — private, no API key, no cost (great for non-technical users).
- **API plugin (opt-in)** — bring your own key for higher accuracy; only the minimal slice is sent, with
  zero-retention.
- **Confidential-cloud** — a later option for cloud quality the operator can't read.

The scanner only ever touches **public** job listings — never your résumé — so **we host no personal data**.
That protects your privacy and limits our liability.

## Two surfaces, one engine

- **CLI (the backbone)** — local-first, for technical users, run with your own AI CLI/API. Ships first.
- **Web app (later — [Phase 9](ROADMAP.md#phase-9--web-app-for-non-technical-users-future))** — a hosted,
  cross-platform, bilingual app for non-technical users: upload a résumé, get pointed toward fitting jobs
  with little effort. Evaluation runs **in your browser** by default, so the résumé never leaves your
  device. Targets: **ease of use** and **accuracy**.

## Using the CLI

`jobdar` is one command with simple subcommands:

```bash
jobdar init           # bilingual setup wizard (region, level, profile)
jobdar scan           # scan portals for new roles (no model needed)
jobdar eval <url>     # evaluate a role against your résumé
jobdar pipeline       # scan -> evaluate -> track, end to end
jobdar pdf [company]  # tailored ATS CV / cover letter
jobdar tracker        # view your applications
jobdar doctor         # check your setup
```

Install with `npm i -g jobdar` (or run `npx jobdar` with no install). Inside an AI CLI like Claude Code,
the same actions are available as the slash command `/jobdar scan`, `/jobdar eval`, and so on.

## Who Jobdar is for

1. **New grads** — college graduates in their 20s landing their first professional role.
2. **People breaking into the workforce** — including those without a degree, career-changers, and
   first-time job-seekers.

**Entry-level is the default**, but levels are **toggle-able**: include mid-level roles, or opt into senior
(which then ranks normally, no penalty).

## Why Jobdar is different

- **American English + Spanish**, full parity (English primary) — across CLI and web app.
- **Scanner for US enterprise** — Workday + iCIMS first, plus Greenhouse/Lever/Ashby.
- **Region toggle** — Midwest by default; switch to Northeast/Southeast/Southwest/West/nationwide and the seeds, location filters, and search adapt.
- **Level toggle** — entry by default; mid first-class; senior opt-in (ranks normally when chosen).
- **A dedicated no-degree path** — surfaces skills-based, apprenticeship, and "or equivalent experience" roles.
- **Private by design** — local data + on-device model by default; no résumé ever hosted by us.
- **Easy for anyone** — a guided, bilingual setup wizard for the CLI today; a friendly web app for non-technical users later.

## Next steps

The roadmap's MVP cut line (CLI): foundation & branding → American-English core → Workday provider →
the level toggle (entry default) + no-degree tuning → the region toggle (Midwest seeded first) → the setup
wizard. The pluggable local-model backend and the web app follow post-1.0.
