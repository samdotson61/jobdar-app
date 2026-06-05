# Changelog

All notable changes to Jobdar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Jobdar adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
