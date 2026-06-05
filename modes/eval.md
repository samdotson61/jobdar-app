---
mode: eval
language: en
status: scaffold
---

# Evaluate a role

Given one job description and the user's résumé (`cv.md` / profile), produce a **fit score
+ report**: strengths, gaps, level fit, and — for no-degree candidates — whether a degree
requirement is a hard gate or a soft signal.

This is a **model-backed** mode: it uses the configured inference backend (`inference:` in
`config/profile.yml`) — your API key now, the on-device model from Phase 8. The scanner
does all filtering first; the model only does the nuanced read.

> **Phase 0 scaffold.** The scoring rubric (shared in `modes/_shared.md`) and the structured
> report shape are authored in **Phase 1** and **Phase 4**.
