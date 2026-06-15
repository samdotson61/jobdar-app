# Jobdar apps (Phase 9)

Two surfaces over the engine. **Increment 1** (this commit): a runnable three-tab Expo app + the PII-free
scanner-proxy. The full `@jobdar/engine` fs-extraction, WebLLM/native on-device inference, live scan
wiring, and EAS native builds are the next milestones (see [`docs/phase9-architecture.md`](../docs/phase9-architecture.md)).

## `apps/jobdar` — the app (web PWA + native, one Expo codebase)

The three tabs are the workflow: **Search → Apply → Follow-up**. Increment 1 runs a faithful
deterministic engine (real band thresholds, rubric weights, prescreen gates, cadence, grounded tailoring)
on **bundled sample data**, so the whole UX is clickable with no model and no network. EN/ES toggle in the
header.

```bash
cd apps/jobdar
pnpm install            # first time only
pnpm web                # → http://localhost:8081  (test on your Mac browser)
pnpm start              # → QR code: open in Expo Go on your iPhone (same Wi-Fi)
```

- **Mac:** `pnpm web`, then open the printed URL.
- **iPhone:** install **Expo Go** (App Store), run `pnpm start`, scan the QR with the iPhone Camera. No
  build/signing needed for this dev workflow.

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

## Engine status (Phase 9.0)

The lib scoring path (`eval_engine`/`prescreen`/`salary`/`dates`/`tailor`/`inference` + new pure
`bands.mjs`) is now **decoupled from `node:fs`/`config.mjs`** — it imports zero config, so it's
**browser-bundle-ready** (CLI `test-all.mjs` stays green). The app currently mirrors the engine's
contracts (identical band thresholds + rubric keys/weights); wiring it to import the shared
`@jobdar/engine` directly is the remaining 9.0 step (needs the pnpm-workspace packaging — Metro blocks
relative-escape imports without it).
