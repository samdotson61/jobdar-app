# Jobdar apps (Phases 9–10)

Two surfaces over the engine, driven by the real **`@jobdar/engine`** (pnpm workspace) — not a
re-implementation. As of **1.47 (Phase 10 L1–L5)** the native app is **fully local on the phone**: it
scans real boards directly, stores the pipeline in CLI-format files on-device, and runs
evaluate/tailor/outreach-drafts through **llama.rn** with the same eval profile winc serves. Web stays
serve-backed. Remaining: **L6 TestFlight** (account steps), then jobdar.ai + Android — see
[ROADMAP Phase 10](../ROADMAP.md#phase-10--fully-local-iphone-active-direction-locked-2026-07-08) and
[`docs/phase9-architecture.md`](../docs/phase9-architecture.md).

## `apps/jobdar` — the app (web PWA + native, one Expo codebase)

The three tabs are the workflow: **Search → Apply → Follow-up**. The app runs the **real engine** — the
exact level filter, prescreen gates, 0–5 score/clamp, band thresholds, and pay resolution the CLI runs,
imported from `@jobdar/engine`. **Native defaults to the on-device backend** (`src/local/backend.ts` over
the `src/local/files.ts` file store — no serve, no Mac; Settings can switch to the Mac-serve companion
mode). **Web** talks to `jobdar serve` / `apps/server`. The Settings tab is also the **model manager**:
confirm-gated resumable GGUF download (RAM-tiered 4b/2b), delete, and the backend chooser. EN/ES toggle
in the header.

```bash
# install ONCE at the repo root — it's a pnpm workspace (sets up @jobdar/engine for the app)
cd ../..        # repo root
pnpm install

cd apps/jobdar
pnpm web                # → http://localhost:8081  (test on your Mac browser)
```

- **Mac:** `pnpm web`, then open the printed URL.
- **iPhone / iOS Simulator (no Apple account):** the native app's on-device model (llama.rn) doesn't run
  in **Expo Go**, so the no-build path is the **Safari PWA** —
  `pnpm exec expo export -p web`, serve `dist/` (`cd dist && python3 -m http.server 8799`), then open it
  in Safari on the phone (`http://<mac-LAN-ip>:8799`) or the simulator
  (`xcrun simctl openurl "iPhone 14" http://localhost:8799`). For true native, build a dev build (below).

## `apps/server` — the scanner-proxy (Phase 9.1, local form)

Zero-dependency Node service that reuses `providers/*.mjs` unchanged. Two routes — `POST /scan`,
`POST /fetch-jd` — whose request bodies have **no field for a résumé or score** (privacy by structure). In
production this deploys to an always-on Node host (Fly/Render) with CORS locked to the app origin.

```bash
cd apps/server
node index.mjs          # → http://127.0.0.1:4320   (GET /health lists live providers)
```

## Running natively on iPhone — a development build (not Expo Go)

The on-device model (**llama.rn**) is a custom native module, so **Expo Go can't run the native app** —
build a **development build** (EAS, cloud — no local Xcode; profiles in `eas.json`, including
`development-simulator` for the iOS Simulator):

```bash
cd apps/jobdar
npx eas-cli@latest login                                  # free Expo account
npx eas-cli@latest build --profile development -p ios     # cloud build; follow the Apple-credentials prompts
# when it finishes, open the install link on your iPhone (or scan the QR) to install the dev app
npx expo start --dev-client                               # then open the installed "jobdar" app on the phone
```

Profiles live in `eas.json` (`development` = device, `development-simulator` = iOS Simulator,
`preview`/`production` for distribution). Bundle id: `com.jobdar.app`. No-build path for quick testing
stays the **Safari PWA** above (`pnpm web` → `http://<mac-LAN-ip>:8081` on the phone).

## Engine status (9.0 engine contract → Phase 10 on-device: landed)

**The app imports the real engine — there is no mirror.** The repo is a pnpm workspace; the private
**`@jobdar/engine`** package re-exports the pure (fs-free) `lib/` modules (`bands`/`levels`/`prescreen`/
`eval_engine`/`salary`/`dates`/`tailor`/`inference`/…), and `apps/jobdar/src/engine.ts` is a thin adapter
over it. So the app's Search runs the real `filterByLevel` + `prescreenRole` (level filter + every hard
gate), and Apply runs the real `prepEval` + `buildVerdict` (score math + clamp + band + pay). Fix a rule
in `lib/` once and the app inherits it (CLI `test-all.mjs` stays green — both consume the same code).

Metro bundles it via the standard Expo-monorepo setup (`apps/jobdar/metro.config.js`: `watchFolders` =
workspace root + `nodeModulesPaths`) — which is why the workspace was needed (a bare relative-escape
import is blocked); llama.rn is platform-split (`llm.native.ts` / `llm.web.ts`) so it never enters the
web bundle. **The 9.0 ports landed in 1.47:** the pipeline/outreach stores run on-device through
`src/local/files.ts` (CLI-identical formats) and the model verbs run through llama.rn (grammar-JSON +
greedy — the winc eval profile). Honest on-device limits: intent parse = deterministic keyword fallback,
`/discover` = not available, PDF résumé parse asks for `.docx`/`.txt` (no pdftotext on iOS).
