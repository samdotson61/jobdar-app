---
mode: scan
language: en
status: authored
---

# Scan

Scanning is **deterministic and model-free** — `scan.mjs` drives the provider plugins in
`providers/`. You don't fetch career pages yourself; you run `jobfaro scan` (or `node scan.mjs`)
and reason over the normalized results.

## How it works
- Portals live in `config/portals.yml`: `company`, `careers_url`, optional `provider` / `site`.
- Each provider exports `{ id, detect, fetch }`. `detect()` is network-free; `fetch()` returns
  normalized `{ title, url, company, location, postedOn }` over HTTPS with a host allowlist.
- Providers: **Greenhouse** (reference), **Workday**, and **iCIMS** (all shipped). Workday: set
  `provider: workday` + optional `site:`. iCIMS parses public career-page HTML (JSON-LD first);
  add `--playwright` for JS-rendered sites. Lever/Ashby follow.
- `jobfaro scan --dry-run` resolves a provider per portal and prints a summary with **no network
  calls** — use it to check configuration.

## Your role as the agent
- Help the user add employers — `jobfaro seed --region <r> --write` materializes them from
  `data/seed/employers.yml` into `config/portals.yml`, or they can edit it by hand.
- After a scan, hand promising roles to the **eval** mode for scoring.
- Point the user to the dashboard for an at-a-glance view — `jobfaro tui` (terminal) or
  `jobfaro dashboard` (web · http://localhost:4319).
- Title filtering by **level** (`lib/levels.mjs`) and **region/location** (`lib/regions.mjs`) is
  deterministic: roles outside the user's `target_levels` or `target_regions` are pre-filtered out
  (remote-US always allowed); ambiguous titles/locations pass through to the rubric.
