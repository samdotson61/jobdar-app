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
- Providers: **Greenhouse** (shipped reference). **Workday** (Phase 2) and **iCIMS** (Phase 3)
  are the marquee enterprise ATSs; Lever/Ashby follow.
- `jobdar scan --dry-run` resolves a provider per portal and prints a summary with **no network
  calls** — use it to check configuration.

## Your role as the agent
- Help the user add real employers to `config/portals.yml` (the region wizard arrives in Phase 5).
- After a scan, hand promising roles to the **eval** mode for scoring.
- Title/location filtering by level and region is deterministic and expands in Phases 4–5.
