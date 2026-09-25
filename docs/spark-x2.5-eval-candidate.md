# Spark-X2.5-4B as an eval-tier candidate — findings (2026-09-24)

> Step 5 of [`winc-1.41-upgrade-plan.md`](winc-1.41-upgrade-plan.md): research only, ship nothing.
> Question: does Spark-X2.5-4B (Apache, 1M ctx, measured +36% decode vs qwen3.5-4b on this Mac) buy back
> eval-queue time without costing verdict quality? **Answer: no — do not adopt.** qwen3.5-4b stays the
> eval model. Same format as [`eval-tuning-research.md`](eval-tuning-research.md).

## Setup (the model was the only variable)

- **Engine:** llama.cpp **b11146** for both runs (the same engine the qwen re-validation passed on the same
  day — CHANGELOG 1.61.1). winc `1.41.0-jobdar.1`.
- **Serve:** Spark is not in winc's eval picker (that list lives in `eval.go` on the winc-jobdar branch and
  was not touched). It was served with `llama-server` directly on :8080 using the eval profile's args
  **verbatim** from the running qwen serve — `--jinja -c 16384 -b 2048 -ub 512 --flash-attn on
  --cache-type-k q8_0 --cache-type-v q8_0 --reasoning off --temp 0 --top-k 1` — minus the Qwen-specific
  `--chat-template-file` (Spark's template ships in its GGUF). `-m` asserted from the process list.
- **Reasoning-off honored:** a json_schema probe returned conformant JSON with **no `reasoning_content`**
  and no `<think>` leak (Spark's thinking is ON by default; the template-level `--reasoning off` disables
  it). `jobfaro backend --check` canary: round-trip OK — but the fit probe scored **3.7 research** where
  qwen scores 4.1 apply, the first hint below.
- **Bench:** the existing harness unchanged — `data/eval-bench-2026-08-28/ab-eval.mjs`, shipped **v2**
  prompt arm, 50 live labeled rows, labels 5 apply / 9 research / 36 dont, greedy. Runs live in
  `data/eval-bench-2026-09-24-b11146/` (qwen) and `data/eval-bench-2026-09-24-spark/` (Spark) with a
  `compare-models.mjs` scripting the plan's acceptance rule. 0 errors, 0 parse failures on both.

## Result

| | apply | research | dont | label agreement (non-debatable) |
|---|---|---|---|---|
| labels | 5 | 9 | 36 | — |
| qwen3.5-4b @ b11146 | 5 | 11 | 34 | **27 / 30** |
| Spark-X2.5-4B @ b11146 | **2** | **2** | **46** | 24 / 30 |

- **Apply↔Don't flips: 4** (acceptance requires 0). Three demote **genuine labeled-Apply roles** to Don't:
  #3 Path Robotics — IT Systems Engineer (5.0 → 2.8), #46 Nationwide — Consultant, Technology Project
  Manager (5.0 → 3.3), #53 Kettering Health — CSS Tech II (5.0 → 3.4). One is in Spark's favor: #6 Path
  Robotics — Software Engineer, Fleet Platform (label dont) 4.4 apply → 2.8 dont — a qwen false-Apply
  Spark correctly rejects.
- **It also invents a wrong Apply:** #28 Nationwide Children's — Administrative Support III, Marketing
  (label dont) 3.5 → **4.6 apply**. So the miss pattern is not "uniformly stricter" — it is *less
  discriminating*: it drops real fits and lifts a mismatch.
- **The Research band goes** 11 → 2 (eight `3.5 → 2.4` moves on the Nationwide Children's admin-support
  rows). *Correction below:* those eight rows are labeled Don't — this is Spark being right and qwen being
  soft, not a strike against Spark.
- Score deltas: mean **−0.31**, max |Δ| **2.5**.
- **Speed, measured end-to-end:** Spark 50 rows in **8m34s (~10.3 s/eval)** vs qwen **10m30s (~12.6
  s/eval)** → **18% faster**, not 36%. Eval calls are prompt-heavy (~800-token prompts, ~150-token
  outputs), so decode speed is only part of the wall clock.

## Re-scored on the actual goal: good jobs, not more jobs (correction, same day)

The acceptance rule above ("Apply ≤ 6, Research alive, no flips") was written for Step 2 to detect *engine
drift*; reused for a model swap it carries a recall bias and mis-credits one thing. Re-scored on precision:

| | Apply shown | truly Apply | precision | real fits found (of 5) |
|---|---|---|---|---|
| qwen3.5-4b | 5 | 4 | **0.80** | 4 |
| Spark-X2.5-4B | 2 | 1 | **0.50** | 1 |

Spark is not "stricter" — it is less discriminating: its one extra Apply is a labeled Don't (#28) and its
three demotions are the most on-target roles in the set. The decision holds on the goal that matters.

**What the eval got wrong (the finding worth keeping):** per-class agreement — qwen matches the label on
only **2 / 9 Research rows** (Spark 1/9); on Don't rows qwen 26/36 vs Spark **34/36**. Eight of the eleven
"Research → Don't" moves counted against Spark above were Spark being *right*: admin-support roles labeled
Don't that qwen parks in Research — all eight at **exactly 3.5**, the band floor. qwen's Research band is
padded with mismatches and its score lattice has a plateau on the threshold. That is calibration evidence
for the pending "N ≥ 50 real thumbs" recalibration (bands are a settled decision — not changed here).

## Model fail or eval fail? Both — quantified (same-day follow-up)

Sam's question: are qwen-designed tweaks being misapplied to Spark? Diagnostics on the stored per-criterion
ratings (zero model time; recomputed scores match the stored ones exactly):

**The eval is qwen-shaped — two criteria penalize Spark on every row.** Per-criterion mean notch delta
(Spark − qwen): skills **+0.22**, experience **+0.54**, level_fit −0.36, **logistics −2.44** (lower on 43/50
rows, higher on 0), **education −1.52**. A penalty that lands regardless of the job is a *reading* mismatch
(v2's "location wiring" was iterated against qwen's reading), not fit judgment; at 0.10 weight each it costs
≈0.9 points per verdict — enough to turn 4.x Applies into Don'ts. And qwen barely uses the 5-level scale
(250 ratings: strong 113 / none 81 / partial 53 / **good 3** / weak 0) while Spark uses all five — the
3.5 plateau is qwen collapsing to three rungs; the bands and labels have been tuned around that.

**Counterfactual re-scores (Spark's own ratings, mismatch neutralized):**

| variant | bands | Apply precision | real fits found |
|---|---|---|---|
| qwen as run | 5/11/34 | 4/5 | 4 |
| Spark as run | 2/2/46 | 1/2 | 1 |
| Spark, logistics+education taken from qwen | 5/1/44 | 2/5 | 2 |
| …and requirements clamp ignored (#53) | 6/4/40 | 3/6 | 3 |
| qwen, logistics+education zero-weighted | 5/3/42 | 4/5 | 4 (agreement 32→**39**/50) |
| Spark, logistics+education zero-weighted | 2/4/44 | 0/2 | 0 |

**Reading:** about half of Spark's gap is the eval (the two mismatched criteria + one requirements-gate
verdict); the other half is Spark's judgment on the *high-weight* criteria — after neutralizing the eval
side it reaches 3/6 Apply precision, still short of qwen's 4/5 under the same treatment (e.g. #3 IT Systems
Engineer: skills strong→partial, experience strong→partial — a real fit under-read). On the Don't-heavy
corpus overall Spark agrees with labels *more* (36–37/50 vs 32/50): it is the better rejecter and the worse
accepter, and "good jobs" is decided at the Apply end.

**What we can and cannot claim:** the current eval is not model-neutral (certain). Spark is worse than qwen
at the Apply end *under this prompt* (certain on this corpus, N=5 Apply rows). Whether a Spark-tuned prompt
would close the remaining gap is **unknown** — we have not tuned for it the way v2 was tuned for qwen.
Spark's headline benchmarks (coding, tools, JSON) measure a different task than rubric-grading fit.

**Eval improvement surfaced for qwen itself:** zero-weighting logistics+education raises qwen's label
agreement from 32/50 to 39/50 with Apply precision unchanged — those two criteria are mostly noise for both
models as currently specified. Candidate follow-up (weights are a shipped decision; not changed here).

## The zero-weight fix, tried on both models (Sam's follow-up, same day)

Weights are post-hoc math over unchanged ratings, so "trying" the fix is exact and costs no model time.
Three weightings, both models, same 50 rows:

| | bands | Apply P / R | agreement | Research band holds (labels) |
|---|---|---|---|---|
| qwen shipped (.35/.25/.20/.10/.10) | 5/11/34 | 4/5 · 4/5 | 32/50 | 2 research, **9 dont** |
| qwen half (.05/.05) | 5/3/42 | 4/5 · 4/5 | **39/50** | 1 apply, 1 research, 1 dont |
| qwen zero | 5/3/42 | 4/5 · 4/5 | **39/50** | same |
| Spark shipped | 2/2/46 | 1/2 · 1/5 | 36/50 | — |
| Spark half | 3/3/44 | 1/3 · 1/5 | 37/50 | — |
| Spark zero | 2/4/44 | **0/2 · 0/5** | 36/50 | — |

**What changes for qwen (shipped → zero):** the eight Nationwide Children's admin-support rows fall
3.5 → 3.1 (research → dont) — all labeled Don't, all now right; one real loss, #1 May Mobility Simulation
Ops Manager (label research) 3.5 → 3.1 now wrong; one non-event, #5 Project Coordinator (label apply)
3.4 → 3.7 — moves *toward* the label but not far enough. Apply precision and recall are untouched. Half
weights (.05/.05) give the identical outcome — the whole benefit arrives without zeroing the criteria.

**What changes for Spark:** it gets *worse* at the Apply end — #7 IS Project Manager II (the one real fit
it found) drops to research; #46 Tech PM rises only to research; #14 Employee Recognition Assistant
(label dont) rises to apply. Its Don't-side accuracy is unchanged (34/36).

**Verdict on the conditional ("if Spark is always better, tune for Spark"):** it is not. The fix that
helps qwen hurts Spark, because Spark's remaining errors live in skills/experience/level_fit — the
criteria the fix leaves alone. Spark's one durable edge is rejection (34/36 Don't rows, where qwen with the
fix reaches the same 34/36). No case to pivot.

**Recommendation:** ship the *half*-weight form (renormalized so weights still sum to 1) — +7 correct
verdicts on 50 with Apply precision unchanged, the Research band stops being a parking lot for
labeled-Don't admin roles, and the two criteria stay visible in the rubric instead of vanishing. It is a
shipped-rubric change (engine weights, app WEIGHTS display constant, engine.md/modes docs, tests) — held
for Sam's go. Caveat as always: 50 rows, 5 labeled Apply, one labeler.

## Mobile parity (blocker 4 of the plan)

The app bundles **llama.rn 0.12.5, whose llama.cpp is build 9769** (`LLAMA_BUILD_NUMBER` in its cpp/).
Spark's `spark2_5` architecture needs **b10828+**. On-device Spark is impossible without a llama.rn
bump — and a bump is its own validation project (the L0 parity spike would need re-running). Moot given
the result above, but recorded so nobody assumes parity later.

## Decision

**Do not adopt.** An 18% queue-time gain does not pay for three missed genuine fits, one invented Apply,
and a dead Research band. qwen3.5-4b remains the eval model; the eval picker on the winc-jobdar branch
stays as is.

## Possible follow-ups (not planned; would need their own bench)

- Spark's correct rejection of #6 is a single data point that a second opinion on *borderline Apply*
  rows could catch qwen false-Applies. That is the 8a.9 escalation seam (`isBorderline`), and it would be
  measured, not assumed — the current labeled set has too few Apply rows (5) to size it.
- Same-day sequel: four more candidates (Granite 4.2 3B, Gemma 4 E4B, LFM2.5-8B-A1B, Qwen3.5-9B) benched
  the same way in [`eval-model-alternatives.md`](eval-model-alternatives.md) — all worse than qwen3.5-4b at
  the Apply end; Spark's row is reproduced there for reference.
- Any re-test of Spark should wait for a chat template / quant revision from the publisher; nothing in
  this run suggests a prompt change on our side would fix under-acceptance (the prompt is the shipped v2
  that qwen scores 27/30 on).
