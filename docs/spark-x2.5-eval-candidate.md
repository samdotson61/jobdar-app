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
- Any re-test of Spark should wait for a chat template / quant revision from the publisher; nothing in
  this run suggests a prompt change on our side would fix under-acceptance (the prompt is the shipped v2
  that qwen scores 27/30 on).
