# Jobdar — Agent Guide

Jobdar is a bilingual (American English / Español) US job-search command center for
**new grads and people breaking into the workforce** (including those without a degree).
It **scans** company career pages, **evaluates** roles against the user's résumé,
**tailors** an ATS-friendly CV/cover letter, and **tracks** applications — with the user's
data kept **local**.

This file orients an AI CLI agent (Claude Code, Gemini CLI, …). Humans: see `README.md`.

## Two layers

1. **Deterministic Node.js layer (zero model).** `scan.mjs` + `providers/*.mjs`,
   `doctor.mjs`, the tracker, and config under `config/`. These never call a model and
   touch only **public** job data. Run them directly (`node scan.mjs`) or via `jobdar <cmd>`.
2. **AI brain (this layer).** Markdown prompts in `modes/` that you, the agent, read to
   evaluate roles, tailor résumés, and prep outreach. `modes/_shared.md` holds the shared
   rubric; each `modes/<mode>.md` is one task.

Deterministic work needs no model; only **evaluation/tailoring** does.

## Scope (locked)

- **Languages:** American English (canonical) + Spanish (full peer). No other locales.
- **Region:** US, **Midwest by default**; toggle via `target_regions` in `config/profile.yml`.
- **Level:** **entry by default**; `mid` first-class; `senior` opt-in (ranks on merit when
  chosen). Only roles *above* the user's highest selected level are de-prioritized.
- **Privacy:** the résumé stays local; the scanner only fetches public listings.

## How to drive it

- Read `config/profile.yml` for language, region(s), level(s), and tuning profile.
- For any user-facing string, prefer the i18n tables in `config/i18n/` over inventing copy.
- Match the user's language (`language:`, or the JD's language) in everything you generate.
- **Always surface the dashboard.** Whenever you run Jobdar or report results, point the user to it
  for easy access: `jobdar tui` (terminal) or `jobdar dashboard` (web · http://localhost:4319).
- **Build résumés via `jobdar pdf`.** After tailoring `data/cv.md` to a role (the `apply` mode),
  `jobdar pdf [company]` renders an ATS-friendly HTML/PDF résumé into `output/`.

## Modes

| Mode | File | Purpose |
|---|---|---|
| shared | `modes/_shared.md` | Shared rubric, scoring bands, and the rules that never bend |
| scan | `modes/scan.md` | How scanning + portals work (deterministic) |
| eval | `modes/eval.md` | Evaluate one role against the résumé → fit report |
| apply | `modes/apply.md` | Tailored cover letter + application answers |
| outreach | `modes/outreach.md` | Recruiter & networking messages |
| pipeline | `modes/pipeline.md` | Scan → evaluate → track, end to end |
| onboard | `modes/onboard.md` | Guided bilingual first-run setup |

Each base mode has a full Spanish peer in `modes/es/`.

> Status: Phases 0–7 + 5.5 complete — Jobdar CLI 1.12.0. The brain is authored EN-canonical with full
> Spanish parity; level archetypes (Phase 4) and region tuning (Phase 5) are wired into the rubric.
> Next up: pluggable on-device inference (Phase 8) and the web app (Phase 9). See `CHANGELOG.md`.
