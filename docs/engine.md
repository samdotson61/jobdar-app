# Jobdar engine contract (Phase 8e)

`lib/engine.mjs` is the **one programmatic seam** for the whole pipeline — import → scan → evaluate →
track → build. It has **no console I/O**: every verb returns a structured value and takes an optional
`onProgress(event)` callback. The CLI subcommands, the web app, and the mobile app are all thin callers.
**Build against this document, never against internals.** `ENGINE_VERSION` bumps on any breaking change
to a signature or a returned shape.

The same verbs are exposed as JSON over localhost by `jobdar serve` (default `http://127.0.0.1:4320`,
CORS locked to localhost): `GET /health`, `POST /evaluate {jd, cv?, confirm?, transferable?}`, `POST /import {file}`.

## Verbs

### `importDocument(file, { active?, onProgress? }) → ImportResult`
Extract a résumé/JD deterministically (`lib/docparse`), then — if an `active` backend is passed — let it
structure the profile fields. `cv` is the **extracted text**, never a model rewrite.
- `ImportResult` = `{ ok: true, ext, cv: string, fields: { name, location, level, skills[] }, structuredBy }`
  or `{ ok: false, error }` (`error` ∈ `not-found | empty | image-pdf | pdf-no-extractor | unsupported`).

### `scan({ portals, existing, discover, dateStr, onProgress? }) → { rows, found }`
`discover(portal) → Job[]` is injected (the CLI passes the provider fetch). Merges discovered roles into
`existing` pipeline rows (URL + near-duplicate dedup). `Job` = `{ title, url, company, location, postedOn? }`.

### `evaluate({ active, jd, cv?, profile?, today?, confirm?, escalate?, transferable? }) → Verdict`
The §3 pipeline: normalizeDates → extract → gate → judge (decomposed rubric, code-computed 0–5) →
clamp (+merge pay). `confirm: true` runs the cheap pre-confirm triage first (returns
`{ ok: true, skipped: true, preConfirm }` if it drops the role). `escalate` is a second active backend
used to re-score a borderline verdict. `transferable` (defaults to `profile.transferable_skills`)
turns on transferable-skills mode: both the judge and the pre-confirm credit genuine adjacent/foundational
skills, and the clamp stops treating an unmet "X+ years in [field]" requirement as a hard gate (hard
credentials — license/cert/clearance — still gate). It changes *what* counts as a fit, not the bar.
- `Verdict` = `{ ok: true, score: 0–5, band: 'apply'|'research'|'dont', recommendation, clamped, rawScore,
  judgments, pay, payBand, usage, model, backend }` — or `{ ok: false, raw }` when the reply didn't parse.
- On local backends (`active.jsonEval`: winc/ollama/llamafile) the eval uses the **guaranteed-JSON**
  endpoint (`response_format=json_schema` on `/v1/chat/completions`) by default — `ok:false` is rare and
  it degrades to `/v1/messages` parse on error. Opt out with `profile.eval_grammar: false`. The Anthropic
  api stays on Messages. Pair with winc's greedy eval profile for deterministic local scoring.

### `preConfirm({ active, jd, cv?, profile?, transferable? }) → { verdict: 'fit'|'maybe'|'skip', reason }`
The fast triage that thins the queue before `evaluate` (the Search-tab pre-confirm). Unknown → `maybe`.
`transferable` (defaults to `profile.transferable_skills`) lets it pass genuine cross-field bridges while
still skipping aspirational stretches.

### `tailor({ active, jd, cv?, profile?, role?, company?, directives? }) → TailorResult`
The Apply-stage "Customize" model step. Returns `{ ok, summary, coverLetter, keywords[], coverComplete,
tailoredCv, model, usage }` — a role-targeted summary, a complete cover letter, truthful keywords, and
`tailoredCv` (the CV with the summary led in). Uses the guaranteed-JSON path on capable local backends so
even a 2B stays GROUNDED (selects/summarizes from the résumé — never fabricates); a **completeness guard**
retries once if the cover letter comes back truncated (sets `coverComplete:false` if still short). `{ ok:false }`
when the reply doesn't parse. Pair with `buildCv`/`jobdar pdf` to render `tailoredCv`.

`directives?` (Phase 8f) — an ordered array of user instructions that steer tone, emphasis, length, and
structure ONLY. They are appended **after** the grounding rules (a fixed clause forbids adding facts not in
the résumé) and the call runs at **`temperature: 0`**, so the same `(cv, jd, directives)` reproduce the same
letter. Additive + optional — the engine contract version is unchanged. (`jobdar tailor --instruct` layers
these per role and writes versioned `-vN` variants; see `data/customize.yml`.)

### Track (pure — rows in, rows out)
- `recordVerdict(rows, { url, score, band, company?, role?, location?, recommendation? }, dateStr) → rows`
- `recordPrescreenVerdict(rows, url, { score, reason, pay }, dateStr) → rows | null`
- `advanceStatus(rows, url, status, dateStr) → rows | null`
- `prune(rows, activeUrls) → { rows, pruned }`
- reads: `readPipeline()`, `pendingQueue(rows, { includeScreened? })`

### `buildCv(cvMarkdown, opts?) → htmlString`
Render a tailored ATS résumé as HTML (the PDF wrapper lives in `jobdar pdf`).

### Backend selection (re-exported from `lib/inference`)
`resolveBackend(profile, env)`, `selectActive(profile, env) → { kind, runtime, baseUrl, up, … }`,
`backendHealth(url, { path? })`. Backends: `local` (winc.cpp / Ollama / llamafile) or `api` (BYO key).

## Conformance
`test-all.mjs` runs one full pipeline — `importDocument → evaluate → recordVerdict → advanceStatus →
buildCv` — through `lib/engine.mjs` only (no CLI), asserting every shape above. That test is the seam's
guarantee; keep it green.
