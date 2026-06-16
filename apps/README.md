# Jobdar apps (Phase 9)

Two surfaces over the engine. The app is now **driven by the real `@jobdar/engine`** (pnpm workspace, 9.0
partially landed) — not a re-implementation. Remaining: WebLLM/native on-device inference, live scan
wiring, and EAS native builds (see [`docs/phase9-architecture.md`](../docs/phase9-architecture.md)).

## `apps/jobdar` — the app (web PWA + native, one Expo codebase)

The three tabs are the workflow: **Search → Apply → Follow-up**. The app runs the **real engine** — the
exact level filter, prescreen gates, 0–5 score/clamp, band thresholds, and pay resolution the CLI runs,
imported from `@jobdar/engine` — on **bundled sample data**, so the whole UX is clickable with no network.
The rubric "judge" + tailor/outreach text are transparent keyword stand-ins until on-device WebLLM (9.3).
EN/ES toggle in the header.

```bash
# install ONCE at the repo root — it's a pnpm workspace (sets up @jobdar/engine for the app)
cd ../..        # repo root
pnpm install

cd apps/jobdar
pnpm web                # → http://localhost:8081  (test on your Mac browser)
```

- **Mac:** `pnpm web`, then open the printed URL.
- **iPhone / iOS Simulator (no Apple account):** the scaffold's Expo SDK is newer than the App Store
  **Expo Go** ("requires a newer version of Expo Go"), so use the **Safari PWA** path —
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

The scaffold uses a newer Expo SDK than the App Store **Expo Go** supports ("requires a newer version of
Expo Go"). For real native on the phone, build a **development build** (EAS, cloud — no local Xcode):

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

## Engine status (Phase 9.0 — partially landed)

**The app imports the real engine — there is no mirror.** The repo is a pnpm workspace; the private
**`@jobdar/engine`** package re-exports the pure (fs-free) `lib/` modules (`bands`/`levels`/`prescreen`/
`eval_engine`/`salary`/`dates`/`tailor`/`inference`/…), and `apps/jobdar/src/engine.ts` is a thin adapter
over it. So the app's Search runs the real `filterByLevel` + `prescreenRole` (level filter + every hard
gate), and Apply runs the real `prepEval` + `buildVerdict` (score math + clamp + band + pay). Fix a rule
in `lib/` once and the app inherits it (CLI `test-all.mjs` stays green — both consume the same code).

Metro bundles it via the standard Expo-monorepo setup (`apps/jobdar/metro.config.js`: `watchFolders` =
workspace root + `nodeModulesPaths`) — which is why the workspace was needed (a bare relative-escape
import is blocked). Still a stand-in until 9.3/9.4: the model "judge" + tailor/outreach generation (no
on-device model yet). Config/fs-coupled modules (the pipeline/outreach ledger stores) stay in `lib/` and
will be reached through injected `Store`/`InferenceClient` ports — the remainder of 9.0.
