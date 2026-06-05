---
mode: scan
language: en
status: scaffold
---

# Scan

Scanning is **deterministic and model-free** — it runs in `scan.mjs` via the provider
plugins in `providers/`. As an agent you don't fetch pages yourself; you invoke
`jobdar scan` (or `node scan.mjs`) and reason over the results.

- Portals live in `config/portals.yml` (`company`, `careers_url`, optional `provider`/`site`).
- Providers: **Greenhouse** (reference, shipped). **Workday** (Phase 2) and **iCIMS**
  (Phase 3) are the marquee enterprise targets, plus Lever/Ashby over time.
- `jobdar scan --dry-run` resolves providers and prints a summary with no network calls.

> Phase 0 scaffold — expands as providers land.
