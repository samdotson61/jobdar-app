# Jobfaro upgrade plan: winc.cpp 1.41.0-jobdar.1 + engine b11146

Written 2026-09-24 for the Jobfaro bot. Everything below was verified on the winc side today;
the Jobfaro-side work is what you own. Do it in order — each step gates the next.

## What changed on the winc side (facts, not to re-derive)

- winc-jobdar is at **1.41.0-jobdar.1** (commit 66262ba). Two merges shipped since your last
  pin: v1.40.0 (2026-09-03) and v1.41.0 (2026-09-24). **`internal/cli/eval.go` is byte-identical
  across both** — the eval profile (`winc serve --eval`, reasoning off, greedy, q8_0 KV,
  16384 ctx, `/v1/chat/completions` with `response_format=json_schema`, `/v1/messages`, `/health`)
  has not changed. This is a zero-code-change upgrade for the Jobfaro client.
- **Upstream llama.cpp changed its release scheme on 2026-08-21.** Any winc older than v1.40.0
  cannot install or update an engine (`/releases/latest` now returns a versioned pointer, and new
  engines print a `--version` line the old parser read as build 0). A fresh `jobfaro backend
  --install` on a machine with an old winc will fail at `winc setup`. winc >= 1.40.0 fixes it.
- **Engine fallback pin is now b11146** (llama.cpp v0.5.0). Between b10621 and b11146 upstream
  fixed Gated-DeltaNet normalization for the Qwen3.5 line — the family the eval model
  (`qwen3.5-4b`) belongs to — so eval verdicts on the new engine may shift slightly. Measured on the
  M4 Pro: +5% decode on a 9B, 4B flat. Upstream also REMOVED `--mmap`, `--mlock`, `--direct-io`.
- The Mac's installed engine is **still b10621**. The :8080 eval serve is **not running**.
- Catalog is 40 entries. The eval picker's own tier list (gemma4-e2b / e4b / 2b / qwen3.5-4b) is
  untouched. New entries relevant to you: `spark-x2.5-4b` (Apache, 1M-token context, measured
  +36% decode vs qwen3.5-4b on this Mac, tools + JSON pass, needs engine b10828+, thinking ON by
  default) and `ornith-1.5-9b`.

## Step 1 — Upgrade the Mac backend and re-canary (ops, ~15 min)

1. `cd ~/winc.cpp && git checkout winc-jobdar && git pull` (should land on 66262ba).
2. `make build VERSION=1.41.0-jobdar.1` then `winc --version` must print `1.41.0-jobdar.1`.
   Rule from memory: never restart :8080 on a master build (master has no `--eval`).
3. `winc update` — accept the engine refresh b10621 -> b11146. Confirm with
   `~/winc.cpp/bin/llama-server --version` (expect `build 11146`).
4. `winc serve --eval qwen3.5-4b`, then `jobfaro backend --check`. The canary must return a
   conformant JSON verdict (clear fit -> Apply band, clear non-fit -> Dont). Assert the engine
   behind the serve from the process list, not from the binary on disk.
5. Record in the Jobfaro CHANGELOG which winc + engine build the canary ran on.

## Step 2 — Re-run the eval bench on the new engine (the real gate, ~1 hour)

The GDN fix can move verdicts. Use the existing harness, unchanged:
`data/eval-bench-2026-08-28/ab-eval.mjs` against the live :8080 serve, same corpus and labels.
- Compare band distribution to the 2026-08-28 baseline (labels 5/9/36; shipped v2 prompt scored
  5/11/34). Acceptance: no Apply inflation (Apply count <= 6), Research band still alive, no verdict
  flips Apply<->Dont on the labeled rows.
- If it passes, note "eval bench re-validated on b11146" in CHANGELOG/ROADMAP. If it fails, stop
  and report the diff before touching the prompt — the prompt is not the variable that changed.

## Step 3 — Fix the stale pin in Jobfaro docs (docs-only, one commit)

ROADMAP.md (lines ~545, 561, 566, 571) and docs/eval-tuning-research.md still say the winc-jobdar
dependency is `1.21.3-jobfaro.4`. Update to `1.41.0-jobdar.1` and add one sentence: "winc >= 1.40.0
is required for engine install/update after llama.cpp's 2026-08-21 release-scheme change." Search
`docs/` and `README` for any `--mlock` or `extra_server_args` suggestion and drop it (flag removed
upstream). Version bump: patch (docs only) per the versioning rule.

## Step 4 — Harden `jobfaro backend --install` against old winc (small code change)

`lib/commands/backend.mjs` `install()` prints found-winc and delegates to `winc setup`. Add a
minimum-version check: if `wincVersion()` parses below 1.40.0, print that `winc setup` will fail to
fetch an engine and tell the user to run `winc update` (git clone) or reinstall the prebuilt first.
Add a unit test for the version comparison (a `-jobdar.N` suffix must compare by the base X.Y.Z).
Minor bump.

## Step 5 — Optional: evaluate Spark-X2.5-4B as an eval-tier candidate (research, do NOT ship)

Why: +36% decode at the same size as qwen3.5-4b would cut eval-queue time by a third.
Blockers to establish first, in this order:
1. It is not in winc's eval picker (that list lives in eval.go on the winc-jobdar branch; changing
   it is a winc-side change, coordinate before editing).
2. Thinking is ON by default; the eval profile passes `--reasoning off` — verify Spark honors it and
   that the json_schema path still returns conformant verdicts (its tokenizer and chat template are
   its own, not Qwen's).
3. Run the same ab-eval bench with `winc serve --eval` pointed at it (the picker would need to allow
   it; for the experiment, `winc serve Spark-X2.5-4B-Q4_K_M.gguf` with the eval flags by hand is
   acceptable as long as the harness asserts the engine's `-m` path).
4. Mobile is separate: the app bundles llama.rn 0.12.5, which may not carry the spark2_5 arch (needs
   llama.cpp b10828+). Check before assuming on-device parity.
Deliverable: a findings note under docs/, same format as eval-tuning-research.md. Ship nothing
from this step without Sam's call.

**Done 2026-09-24 → REJECTED.** See [`spark-x2.5-eval-candidate.md`](spark-x2.5-eval-candidate.md): 2/2/46 vs
qwen 5/11/34, 24/30 vs 27/30 agreement, 4 Apply↔Don't flips (3 real fits demoted), Research band 11→2,
only 18% faster end-to-end; llama.rn (b9769) can't run it on-device. qwen3.5-4b stays.

## Out of scope / do not do

- Do not switch the eval model. qwen3.5-4b stays until Step 5's bench says otherwise.
- Do not edit eval.go or anything in ~/winc.cpp from the Jobfaro session.
- Do not merge winc master into the branch or "fold" the branch — that is a rejected design.
- Do not empty Trash or delete models.

## Verification checklist to report back

- [x] `winc --version` = 1.41.0-jobdar.1 and `llama-server --version` = build 11146 (2026-09-24)
- [x] `jobfaro backend --check` canary green (apply 4.1 round-trip), engine asserted from the running llama-server
- [x] ab-eval bench: 5/11/34 on b11146 = baseline 5/11/34; 27/30 agreement both; 0 moves, 0 flips → **PASS** (CHANGELOG 1.61.1)
- [x] docs pin updated + CHANGELOG entry + version bump (v1.60.1; also restored rename-mutated historical tags)
- [x] backend --install minimum-version guard + test (v1.61.0; live-verified both ways)
