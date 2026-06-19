# Jobdar (Claude Code)

This repo is **Jobdar** — a bilingual US job-search command center. Start with
[`AGENTS.md`](AGENTS.md) for the full agent guide; it applies to Claude Code too.

- Deterministic commands run with no model: `jobdar scan`, `jobdar doctor`, `jobdar tracker`
  (or `node scan.mjs --dry-run`).
- Model-backed work (evaluate, tailor) reads the prompts in `modes/`.
- Inside Claude Code, use the `/jobdar` slash command (see `commands/jobdar.md`).

**Before starting work (every session): `git fetch origin && git status -sb`.** Multiple sessions
work this repo — if local is behind, pull (or reconcile) BEFORE editing, and never claim a semver
number until you've confirmed origin hasn't already used it. Every change bumps the version by size
(patch/minor/major) in lockstep across `package.json` + `.claude-plugin/plugin.json` +
`package-lock.json` + `CHANGELOG.md` + the `ROADMAP.md`/README/banner status lines — a bump that
touches only `package.json` is a bug.

Scope is locked: American English + Spanish; Midwest-default region; entry-default level
(senior opt-in, ranks on merit). Keep the user's résumé local — the scanner only ever
touches public job data.

> Status: Phases 0–7, 5.5, 7.7, 7.8, 8b, 8a, 8c, 8e + 8f complete — Jobdar CLI 1.40.1 (see `ROADMAP.md` / `CHANGELOG.md`).
> Scan discovers + filters roles; the model's `eval` scores fit — the scanner never scores.
