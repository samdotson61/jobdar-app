# Eval tuning — research notes

> Research backing the design of `jobdar eval`'s scoring (Phase 8a.4–8a.6) and `jobdar offer`
> (Phase 8d). Goal: the same rubric must score **consistently and fairly** on both backends —
> a frontier API model *and* a small local model served by
> [winc.cpp](https://github.com/samdotson61/winc.cpp). Compiled 2026-06-10.

> **Update (2026-06-14, CLI 1.24.x) — as-shipped deltas + two on-device findings.** This page is the
> original research; some specifics shifted in implementation. The authoritative current spec is
> [`engine.md`](engine.md) + [`../modes/_shared.md`](../modes/_shared.md). As shipped: **bands are
> Apply ≥ 4.0 · Research ≥ 3.5 · Don't < 3.5** (`lib/evaluations.mjs BANDS` — §3 below quotes an earlier
> draft scale), and the verdict JSON is `{required, skills, experience, level_fit, logistics, education,
> recommendation}` with deterministic code computing the 0–5.
>
> - **Transferable-skills mode (the `transferable_skills` toggle, 1.24.0; hardened 1.24.1).** Credits
>   genuine adjacent skills — rated on *bridge strength*, not title match — and makes the clamp treat an
>   unmet "X+ years in [field]" requirement as bridgeable (exact parity with the no-degree degree rule
>   of §2.2; hard credentials — license/cert/clearance — still gate). It changes *what* counts as a fit,
>   not the bar.
> - **Measured local-model variance.** §1 predicted small-model variance; we measured it. The winc
>   Qwen3.5-4B swings **~±1 point run-to-run**, enough to flip a band near an edge — so transferable
>   behavior must be judged on the **mean of N ≥ 5 runs, never one**, and §1's "2–3-sample ensemble,
>   majority band" should be treated as **load-bearing for production** on a 4B local backend, not optional.

## 1. What the literature says about LLM job-fit scoring

**Decomposed (analytic) rubrics beat holistic scores.** Asking a model for one 0–5 "fit" number
invites inconsistency; asking it to judge **one criterion at a time** (skills match, experience
relevance, level fit, …) is more reliable, easier to debug, and shows *why* a score moved.
Analytic rubrics are the recommended shape for longitudinal monitoring — exactly our pipeline
case ([Evidently](https://www.evidentlyai.com/llm-guide/llm-as-a-judge),
[Galtea](https://galtea.ai/blog/llm-as-a-judge-the-complete-guide)).

**Coarse judgments beat fine-grained ones.** Models answer "strong / partial / none" far more
consistently than "is this a 73 or an 82." The reliable pattern: the model makes **categorical
sub-judgments with quoted evidence**, and *deterministic code* converts them to the 0–5 score
and Apply/Research/Don't band
([Confident AI](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)).

**Reason first, then judge.** Chain-of-thought — explain the evidence, *then* emit the verdict —
measurably improves judge accuracy and robustness
([Comet](https://www.comet.com/site/blog/llm-as-a-judge/),
[explicit-reasoning study](https://arxiv.org/pdf/2509.13332)).

**Few-shot anchors raise consistency.** 2–3 worked examples per band (what a 5 looks like, what
a 2 looks like) pin the scale in place across runs and across models. Keep anchors short so they
fit a small local model's context
([Langfuse](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)).

**Calibrate against humans before trusting it.** Standard practice: a **30–50 example
human-annotated calibration set**, re-scored on every prompt or model change; track agreement
and drift ([Kinde](https://www.kinde.com/learn/ai-for-software-engineering/best-practice/llm-as-a-judge-done-right-calibrating-guarding-debiasing-your-evaluators/)).
For Jobdar: a fixture set of real JDs hand-banded by us, run by `test-all.mjs` against any
configured backend.

**Small local models hold up — with help.** Decomposed rubric + few-shot anchors + structured
output is precisely the recipe that lets a 3–8B-class local model judge usefully; ensembling
(2–3 samples, majority band) cuts variance further at zero cloud cost
([Vadim](https://vadim.blog/llm-as-judge)). Pairwise comparison is intrinsically more reliable
than absolute scoring, but our pipeline needs absolute bands — so we use **band-anchored
absolute scoring** and reserve pairwise for A/B-testing rubric changes on the calibration set.

## 2. Fairness — load-bearing for Jobdar's audience

A 2025 study of ~10,000 real candidate–job pairs found off-the-shelf LLMs (OpenAI, Anthropic,
Google, Meta, Deepseek) reached ROC AUC ≈ 0.77 on hiring fit **and carried measurable
demographic bias** (race-wise impact ratios ≤ 0.809, vs 0.957 for a purpose-built matcher) —
the authors' conclusion: never deploy hiring-adjacent LLM scoring without explicit fairness
guardrails ([arXiv 2507.02087](https://arxiv.org/pdf/2507.02087);
see also [bias in job–résumé matching](https://arxiv.org/pdf/2503.19182)).

Jobdar's stakes are lower — we score **jobs for one candidate**, not candidates for an employer —
but two guards are still ours to build:

1. **Minimal-slice + PII-strip (8a.3, extended):** the eval prompt gets the JD + a *skills/
   experience excerpt* of `cv.md` — name, address, and contact lines stripped before the prompt
   is built. Less PII out the door **and** a smaller bias surface.
2. **No-degree fairness is rubric law:** under the `no_degree` tuning profile the rubric must
   treat "Bachelor's required" as a *soft* signal (per Phase 4.5) — and the calibration set must
   include no-degree/equivalent-experience JD pairs so a regression here **fails tests**, not
   just vibes.

## 3. Concrete rubric design for `jobdar eval` (feeds 8a.1/8a.4)

Sub-criteria (model returns `strong | partial | none` + one quoted JD line of evidence each):

| Criterion | Weight | Notes |
|---|---|---|
| `skills_match` | 35% | hard + transferable skills vs JD requirements |
| `experience_relevance` | 25% | projects/work history vs the role's day-to-day |
| `level_fit` | 20% | role level vs `target_levels` (above-selected-level → capped, per 4.3) |
| `logistics` | 10% | metro/remote/relocation vs `target_regions` |
| `education_gate` | 10% | **soft** under `no_degree` (flag, never auto-zero, per 4.5) |

Code (not the model) maps categories → numbers, applies weights → **0–5 score**, then bands:
**Apply ≥ 3.5 · Research 2.0–3.4 · Don't < 2.0** (thresholds live in config, tuned on the
calibration set). Verdict schema (both backends, enforced):

```json
{ "criteria": { "skills_match": {"judgment": "strong", "evidence": "..."}, … },
  "score": 4.1, "band": "apply", "summary_en": "…", "summary_es": "…",
  "flags": ["degree_required_soft"] }
```

Prompt rules: pinned system prompt; temperature 0; reason-then-judge ordering; 2 anchor
examples per band; identical prompt text on `api` and `local` so backend differences are
measurable, not confounded.

## 4. Offer evaluation data sources (feeds 8d)

The model must **never invent wage numbers** — deterministic code supplies market context;
the model only interprets it:

- **BLS OEWS** — median/percentile wages by occupation × metro ([bls.gov/bls/blswage.htm](https://www.bls.gov/bls/blswage.htm)) — the backbone of "is this offer at market?"
- **Metro CPI** ([bls.gov/cpi](https://www.bls.gov/data/)) and regional price differences for
  cost-of-living-adjusted comparisons between metros (differences are large — same nominal
  salary can differ ~50% in real terms between metros,
  [COLA guide](https://salary-converter.com/blog/articles/cost-of-living-adjustment-cola-guide-2026)).
- **Employment Cost Index** for trend ("are wages in this sector rising?")
  ([bls.gov/eci](https://www.bls.gov/eci/)).

Ship as a versioned `data/seed/wages.yml` snapshot (entry archetypes × major metros), refreshed
per release with provenance noted — works offline, no per-user BLS calls.

## 5. PDF understanding (feeds 8c)

Survey of the Node PDF-extraction field
([PkgPulse comparison](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026),
[Strapi roundup](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025)):

- **[unpdf](https://github.com/unjs/unpdf)** — modern, maintained (UnJS), Mozilla pdf.js under
  the hood, no native binaries, runs in Node **and** serverless/edge — the same extraction code
  can serve the Phase 9 web server. **→ our pick (the one new dependency).**
- `pdf-parse` — most-downloaded but effectively unmaintained; unpdf is its stated successor.
- `pdfjs-dist` raw — full renderer, heavyweight; more than we need.
- `pdf.js-extract` — positional/per-glyph extraction; only needed if layout-aware parsing ever
  becomes necessary (it likely won't: the *model* does the structuring, not regexes).

Division of labor: **extraction is deterministic** (unpdf → text), **understanding is the
inference backend's job** (text → structured `cv.md` + profile fields) — so résumé
understanding is private-by-default on winc.cpp, and accuracy scales with whichever backend
the user picked. Image-only/scanned PDFs: detect the empty text layer and fail honestly with
a bilingual hint (OCR out of scope for now).

## Sources

- [Evaluating the Promise and Pitfalls of LLMs in Hiring Decisions (arXiv 2507.02087)](https://arxiv.org/pdf/2507.02087)
- [Evaluating Bias in LLMs for Job-Resume Matching (arXiv 2503.19182)](https://arxiv.org/pdf/2503.19182)
- [Explicit Reasoning Makes Better Judges (arXiv 2509.13332)](https://arxiv.org/pdf/2509.13332)
- [LLM-as-a-judge: a complete guide — Evidently](https://www.evidentlyai.com/llm-guide/llm-as-a-judge)
- [LLM-as-a-Judge — Langfuse docs](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge)
- [LLM-as-a-Judge guide — Confident AI](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)
- [LLM-as-a-Judge — Comet](https://www.comet.com/site/blog/llm-as-a-judge/)
- [Calibrating, Guarding & Debiasing LLM Evaluators — Kinde](https://www.kinde.com/learn/ai-for-software-engineering/best-practice/llm-as-a-judge-done-right-calibrating-guarding-debiasing-your-evaluators/)
- [LLM as Judge: what engineers get wrong — Vadim](https://vadim.blog/llm-as-judge)
- [BLS wage data by area & occupation](https://www.bls.gov/bls/blswage.htm) · [BLS data tools](https://www.bls.gov/data/) · [ECI](https://www.bls.gov/eci/)
- [unpdf (UnJS)](https://github.com/unjs/unpdf) · [unpdf vs pdf-parse vs pdf.js — PkgPulse](https://www.pkgpulse.com/blog/unpdf-vs-pdf-parse-vs-pdfjs-dist-pdf-parsing-extraction-nodejs-2026) · [Strapi: 7 PDF parsing libraries](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025)
