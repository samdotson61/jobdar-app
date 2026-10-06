---
mode: scan
language: en
status: authored
---

# Scan

Scanning is **deterministic and model-free** — `scan.mjs` drives the provider plugins in
`providers/`. You don't fetch career pages yourself; you run `jobdar scan` (or `node scan.mjs`)
and reason over the normalized results.

## How it works
- Portals live in `config/portals.yml`: `company`, `careers_url`, optional `provider` / `site`.
- Each provider exports `{ id, detect, fetch }`. `detect()` is network-free; `fetch()` returns
  normalized `{ title, url, company, location, postedOn }` over HTTPS with a host allowlist.
- Providers: **Greenhouse** (reference), **Workday**, **iCIMS**, **Lever**, **Ashby**, **UKG/UltiPro**
  and **DirectEmployers microsites** (`*.dejobs.org`, the National Labor Exchange's per-employer
  sitemaps; no descriptions) are detected from the careers URL; **JSON-LD** and **Jibe** read sites on an
  employer's own domain and need an explicit `provider: jsonld` / `provider: jibe`; **USAJobs** is
  opt-in with a free key. Workday: optional `site:`. iCIMS parses public career-page HTML (JSON-LD
  first); add `--playwright` for JS-rendered sites.
- A big board is read page by page, up to 5,000 postings in one scan (the daily baseline scan on GitHub
  reads boards whole). A board that was not read to its end is left out of the "no longer posted"
  check — a role missing from a cut-off list proves nothing.
- `jobdar scan --dry-run` resolves a provider per portal and prints a summary with **no network
  calls** — use it to check configuration.

## Your role as the agent
- Help the user add employers — `jobdar seed --region <r> --write` materializes them from
  `data/seed/employers.yml` into `config/portals.yml`, or they can edit it by hand.
- After a scan, hand promising roles to the **eval** mode for scoring.
- Point the user to the dashboard for an at-a-glance view — `jobdar tui` (terminal) or
  `jobdar dashboard` (web · http://localhost:4319).
- Title filtering by **level** (`lib/levels.mjs`) and **region/location** (`lib/regions.mjs`) is
  deterministic: roles outside the user's `target_levels` or `target_regions` are pre-filtered out
  (remote-US always allowed); ambiguous titles/locations pass through to the rubric.
