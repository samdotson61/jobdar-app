# Is there a better eval model than qwen3.5-4b? — findings (2026-09-24)

> Sam's question after the half-weight fix shipped (CLI 1.62.0): "tell me if there's a better alternative to
> qwen3.5-4b." **Answer: not among anything we can run today.** Four candidates were benched on the same
> harness, same 50 labeled rows, same engine, same prompt, and scored on the goal that matters — *good jobs,
> not more jobs* (Apply precision first, then per-class agreement). Every one of them is worse than
> qwen3.5-4b at the Apply end; three of the four never produce an Apply at all. qwen3.5-4b stays.
> Companion notes: [`spark-x2.5-eval-candidate.md`](spark-x2.5-eval-candidate.md) (Spark, same day),
> [`eval-tuning-research.md`](eval-tuning-research.md) (prompt history).

## Who was considered, and why these four

The winc catalog (40 entries) was scanned for instruct models that fit the two deployment classes:

- **Phone class (≤ ~3 GB Q4, must eventually run under llama.rn):** `granite4.2-3b` (IBM, Apache-2.0,
  2026-08-25 — the newest small model with a published instruction-following story), and `gemma4-e2b`
  (already benched in June: over-conservative, not re-run).
- **Mac class (≤ ~6 GB, the :8080 eval serve):** `gemma4-e4b` (in winc's own eval picker; rejected in June
  on the *old* prompt, so re-tested on v2), `lfm2.5-8b-a1b` (Liquid, MoE ~1.5B active — the fastest thing
  in the catalog, IFEval 91.8 per the vendor), and `qwen3.5-9b` (the bigger sibling; the vendor card shows
  it ahead of the 4B on every benchmark).
- Spark-X2.5-4B was benched earlier today and is included in the table for reference.
- Not benched: coder models (`omnicoder-9b`), the Ornith line (chat/RP tuned), anything above 6 GB (won't
  fit the Mac eval budget alongside the app), and thinking-only variants.

Published numbers, for orientation only (different task than rubric-grading fit — see the last section):

| model | params | IFEval | IFBench | MMLU-Pro | GPQA-D | source |
|---|---|---|---|---|---|---|
| Qwen3.5-4B (instruct) | 4B | 89.8 | 59.2 | 79.1 | 76.2 | [HF card](https://huggingface.co/Qwen/Qwen3.5-4B) |
| Qwen3.5-9B (instruct) | 9B | 91.5 | 64.5 | 82.5 | 81.7 | [HF card](https://huggingface.co/Qwen/Qwen3.5-9B) |
| Gemma 4 E4B | 4.5B eff. / 8B | — | 44.2 (AA) | 69.4 | 58.6 | [model card](https://ai.google.dev/gemma/docs/core/model_card_4), [BenchLM](https://benchlm.ai/models/gemma-4-e4b) |
| Granite 4.2 3B | 3B dense | — | 74.3 | 67.8 | — | [llm-stats](https://llm-stats.com/models/compare/granite-4.2-3b-vs-qwen3.5-0.8b), [IBM docs](https://www.ibm.com/granite/docs/models/granite4-2) |
| LFM2.5-8B-A1B | 8.3B / ~1.5B active | 91.8 | — | — | — | [Liquid blog](https://www.liquid.ai/blog/lfm2-5-8b-a1b) |

## Setup (the model was the only variable)

- **Engine:** llama.cpp b11146 for every run (the qwen baseline is the same-day b11146 re-validation,
  `data/eval-bench-2026-09-24-b11146/`). winc `1.41.0-jobdar.1`.
- **Serve:** `gemma4-e4b` through the real path, `winc serve --eval gemma4-e4b` (it is in the picker). The
  others are not in the picker (that list lives in `eval.go` on the winc-jobdar branch — untouched), so they
  were served with `llama-server` directly on :8080 using the eval profile's flags **verbatim** (`--jinja -c
  16384 -b 2048 -ub 512 --flash-attn on --cache-type-k q8_0 --cache-type-v q8_0 --reasoning off --temp 0
  --top-k 1`); `-m` asserted from the process list before each run. Qwen3.5-9B also got the
  `--chat-template-file …winc.jinja` the 4B uses (the file is byte-identical across the Qwen3.5 sizes).
- **Two serve findings worth keeping:** (1) **LFM2.5-8B-A1B ignores `--reasoning off`** — it thinks anyway,
  burns the token budget, and returns *empty content* on every row (50/50 `ERR unparsed` on the first
  attempt). It only answers with `--reasoning-budget 0 --chat-template-kwargs '{"enable_thinking":false}'`
  added, which the winc eval profile does not pass — so it could not be adopted without a winc-side change
  even if it had scored well. (2) **Granite 4.2 3B breaks the json_schema grammar** when those same two
  flags are present (`Unexpected empty grammar stack after accepting piece: !`, HTTP 500 on every request);
  with the verbatim flags alone it is fine. The eval profile's flags are not model-neutral either way.
- **Bench:** `data/eval-bench-2026-08-28/ab-eval.mjs`, shipped v2 prompt arm, 50 live labeled rows
  (5 apply / 9 research / 36 dont), greedy. Each run in its own dir under `data/eval-bench-2026-09-24-<model>/`
  (gitignored) with `run-meta.txt` + `run.log`. All runs re-scored through the *shipped* 1.62.0 weights via
  `compare-shipped.mjs` (in the spark dir) so every model is judged under the same rubric. Rows a model
  failed to parse are dropped from *both* sides of that model's comparison — the qwen column therefore
  varies slightly per pairing; the "vs qwen" numbers are the like-for-like ones.
- **Canary** (`jobdar backend --check`, the clear-fit probe qwen scores 4.1–4.2 Apply): Gemma 3.8, Granite
  3.8, Qwen-9B 3.8 (all Research), LFM 3.1 (Don't). The first hint, confirmed below.

## Result — scored on good jobs, not more jobs

| model | rows | bands (apply/research/dont) | **Apply precision** | real fits found (of 5) | agreement | per class (apply · research · dont) | wall time (s/eval) |
|---|---|---|---|---|---|---|---|
| **qwen3.5-4b** (shipped) | 50 | 5 / 3 / 42 | **4 / 5** | **4** | **39 / 50** | 4/5 · 1/9 · 34/36 | 10m30s (12.6) |
| Spark-X2.5-4B | 50 | 3 / 3 / 44 | 1 / 3 | 1 | 37 / 50 | 1/5 · 2/9 · 34/36 | 8m34s (10.3) |
| Granite 4.2 3B | 49 | 1 / 3 / 45 | 1 / 1 | 1 | 38 / 49 | 1/5 · 2/9 · **35/35** | 4m50s (5.8) |
| Gemma 4 E4B | 50 | **0** / 0 / 50 | — (0 shown) | 0 | 36 / 50 | 0/5 · 0/9 · 36/36 | 10m06s (12.1) |
| LFM2.5-8B-A1B | 50 | **0** / 0 / 50 | — (0 shown) | 0 | 36 / 50 | 0/5 · 0/9 · 36/36 | **3m39s (4.4)** |
| Qwen3.5-9B | 44 (6 unparsed) | 6 / 1 / 37 | **2 / 6** | 2 | 28 / 44 | 2/5 · 0/9 · 26/30 | 15m33s (18.7) |

(qwen on the same 44 rows as the 9B: 4/5 precision, 33/44 agreement; on Granite's 49: 4/4, 39/49.)

What each one actually did:

- **Gemma 4 E4B and LFM2.5-8B-A1B rate everything Don't.** 36/36 on the Don't rows looks like accuracy and is
  not: a model that never says Apply has no precision to measure and finds none of the five real fits
  (#3 Path Robotics IT Systems Engineer, #7 Cincinnati Children's IS Project Manager II, #46 Nationwide Tech
  PM, #53 Kettering CSS Tech II, #5 Project Coordinator). Gemma behaves exactly as it did in June on the old
  prompt — over-conservative is the model, not the prompt. LFM is the fastest thing we have measured (4.4
  s/eval, 2.9× qwen) and it is useless for the job.
- **Granite 4.2 3B is a perfect rejecter and nearly no accepter.** 35/35 on Don't, 0 false Applies, and one
  real fit found (#7, at exactly 4.0). It demotes #3, #46, #53 — the three most on-target roles in the set,
  the same three Spark dropped. At 5.8 s/eval it is the best *phone-class* result here, but "finds 1 of 5
  good jobs" fails the goal outright.
- **Qwen3.5-9B is worse than its little sibling, and it is the surprise.** Six Applies, four of them wrong
  (#13 Marketing-Email Intern, #25, #28 Admin Support III Marketing, #35), only two real fits; 6 rows
  returned empty content (unparsed) under the same flags the 4B is clean on; 1.5× slower. The vendor card's
  across-the-board benchmark lead does not transfer to this task. This also retires the "we never tried a
  bigger Qwen" thread — it was tried in June on N=8 ("no gain") and now on N=50 (a loss).
- **Spark** remains what the earlier note says: better rejecter, worse accepter, 1/3 Apply precision.

## Decision

**No change.** qwen3.5-4b is the only model in reach that finds most of the good jobs (4 of 5) while showing
almost nothing false (1 of 5 shown), and the shipped half-weight rubric is tuned around it (39/50). The
speed candidates (LFM, Granite) buy a 2–3× faster queue by never saying yes; the "smarter" candidates
(Gemma E4B, Qwen 9B) are either silent or less discriminating. The eval picker on the winc-jobdar branch
stays as is; nothing in `eval.go` changes.

Today's three downloads (Granite 2.3 GB, Gemma E4B 5.0 GB + mmproj, Qwen 9B 5.7 GB + mmproj, ~14.9 GB)
were removed the same evening on Sam's call (`winc -r`, plus the two orphaned mmproj files by hand).
LFM2.5-8B-A1B was already on disk (July 24, a winc catalog measurement fixture) and stays. Re-running any
of these is a `winc -d <alias>` away.

## What this tells us about the eval, not just the models

Every candidate except the 9B collapses toward Don't on this prompt; qwen3.5-4b is the *least*
conservative of the set and still misses #5. Combined with today's earlier finding (qwen uses 3 of 5 rating
rungs; the logistics/education criteria read differently per model), the picture is: **the v2 prompt is a
qwen3.5-4b prompt.** Two consequences, neither acted on here:

1. Any future model swap needs its own prompt pass before its bench result means anything — a candidate
   scored on a prompt iterated against another model is measured at a disadvantage we cannot size from one
   run. The fair experiment is "tune for X, then bench X", which costs a day per candidate.
2. Public benchmarks (IFEval, MMLU-Pro, GPQA) did not predict the ranking at all: the 9B beats the 4B on all
   of them and lost; LFM's 91.8 IFEval produced no usable verdicts. Rubric-grading résumé–JD fit with a
   deterministic clamp is its own task. Only the bench counts.

The next real gain is still the pending calibration on **N ≥ 50 real thumbs** (bands are a settled
decision; the labeled set has 5 Apply rows and one labeler), not a model change.

## Caveats

50 rows, 5 labeled Apply, one labeler, one quant (Q4_K_M) per model, one engine build, greedy decode. The
differences at the Apply end (4/5 vs 0–2/5) are large enough that none of these caveats plausibly reverse
the ranking, but the *per-class* numbers should not be read to a single row.
