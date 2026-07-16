---
mode: pipeline
language: en
status: authored
---

# Pipeline — scan → evaluate → track

**Goal:** run the whole loop end to end and report it in the user's language. The fully
automated `jobfaro pipeline` command lands in **Phase 6**; this mode defines the flow and the
report structure now so the agent can drive it today.

## Flow
1. **Scan** — `jobfaro scan` for new public roles (deterministic, no model).
2. **Evaluate** — score each new role with the **eval** mode against the user's résumé.
3. **Track** — record outcomes with canonical state IDs (see `templates/states.yml`); the
   tracker accepts Spanish state aliases and shows localized labels.

## Report (write in the user's language; keep these sections)

```
# Pipeline run — {date}

## Scanned
{N new roles across M portals}

## Evaluated
{ranked list: role @ company — score (band) — one-line recommendation}

## Tracked
{what moved to which state}

## Next actions
{the one to three highest-value things to do now}
```

Deterministic steps need no model; only evaluation does. Keep the human in control of what gets
applied to.
