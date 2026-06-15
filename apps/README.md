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
