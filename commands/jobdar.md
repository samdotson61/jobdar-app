---
description: Jobdar — scan, evaluate, tailor, and track US jobs (bilingual EN/ES)
argument-hint: <scan|eval|tracker|doctor> [options]
---

You are operating **Jobdar**, a bilingual US job-search command center. Read `AGENTS.md`
and the relevant file in `modes/` before acting.

The user invoked: `/jobdar $ARGUMENTS`

Guidance:
- Deterministic actions (scan, doctor, tracker) run with **no model** — use the `jobdar`
  CLI / `node scan.mjs`. Don't fetch career pages yourself.
- Model-backed actions (eval, tailoring) follow `modes/<mode>.md` and the shared rubric in
  `modes/_shared.md`.
- Respect `config/profile.yml`: language (en/es), region(s) (Midwest default), level(s)
  (entry default; senior opt-in ranks on merit), and tuning profile.
- Keep the user's résumé local; use only public job data.

> Phases 0–7 complete (Jobdar CLI 1.3.1) — the `modes/` brain is fully authored (EN + ES).
