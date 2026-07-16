---
mode: eval
language: en
status: authored
---

# Evaluate a role

**Goal:** read one job description against the user's résumé and return a clear fit report.
Model-backed — uses the configured inference backend (`inference:` in `config/profile.yml`):
**on-device winc.cpp by default** (local, private, no key), or your own API key (`api`). `jobfaro backend`
checks it's live. Apply the rubric in [`_shared.md`](_shared.md).

## Inputs
- The job description — `jobfaro eval <url>` fetches it for you via the matching provider
  (greenhouse / workday / icims) and prints it; you read and score it. (A file or pasted text works too.)
- The user's profile + résumé (`config/profile.yml`, `cv.md`).
- **Today's date** — `jobfaro eval` prints it. Use it: treat any "Present"/"Current" on the résumé as
  today, **never as a future date** (a "Mar 2025 – Present" role is ongoing, not future employment).

## Steps
1. Extract the role's must-haves, nice-to-haves, level, location, and any degree requirement.
2. Map the user's real skills, projects, and history onto them.
3. Score **0.0–5.0** and assign a band (**Apply / Research / Don't**) per `_shared.md`.
4. Read the **level fit** (on-target vs. above-target leakage) and the **degree requirement**
   (hard gate vs. soft signal — decisive for no-degree users).
5. Decide a one-line recommendation: apply now, apply with prep, stretch, or skip — and why.

## Output (write in the user's language; keep these sections)

```
# Fit report — {role} @ {company}
Fit score: {0.0–5.0} ({band})
Recommendation: {one line}

## Why it fits
- {grounded strengths, mapped to the JD}

## Gaps to address
- {honest gaps; how to close or frame each}

## Level fit
{on-target — or "reads above your target level; flagged, not hidden"}

## Degree requirement
degree_required: {yes | no | unclear}
{if yes: hard gate or soft ("or equivalent experience")? For no-degree candidates, say what would
close the gap. Degree-gated roles stay visible (flagged) when include_degree_required_roles is on.}

## Pay
{cite the JD's STATED range if present (`jobfaro prescreen` extracts it into the `pay` column) and how
it compares to target — above / within / near / below. If pay is undisclosed, say so. Never invent a number.}

## Next step
{apply, tailor a CV (`jobfaro pdf`), or move on — one concrete action}
```

## Record it

The scanner only discovers roles — it never scores them. **You** are the scorer, so persist your
verdict to the pipeline (it then surfaces in `jobfaro tui` / the dashboard):

```
jobfaro eval --save --url <url> --score <0.0–5.0> --band <apply|research|dont> --company "{company}" --role "{role}" --note "{one-line recommendation}"
```

Keep it tight and specific. Cite the JD. Never inflate the score or invent a qualification.
