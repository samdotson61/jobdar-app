# Jobdar (Claude Code)

This repo is **Jobdar** — a bilingual US job-search command center. Start with
[`AGENTS.md`](AGENTS.md) for the full agent guide; it applies to Claude Code too.

- Deterministic commands run with no model: `jobdar scan`, `jobdar doctor`, `jobdar tracker`
  (or `node scan.mjs --dry-run`).
- Model-backed work (evaluate, tailor) reads the prompts in `modes/`.
- Inside Claude Code, use the `/jobdar` slash command (see `commands/jobdar.md`).

Scope is locked: American English + Spanish; Midwest-default region; entry-default level
(senior opt-in, ranks on merit). Keep the user's résumé local — the scanner only ever
touches public job data.

> Status: Phases 0–7 complete — Jobdar CLI 1.8.0 (see `ROADMAP.md` / `CHANGELOG.md`).
> Scan discovers + filters roles; the model's `eval` scores fit — the scanner never scores.
