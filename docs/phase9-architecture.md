# Phase 9 — Web + Mobile Apps: Architecture & Build Plan

> **Canonical spec.** Thin clients over the frozen Phase 8e engine. **One UI codebase** (Expo: React
> Native + react-native-web) → web PWA **and** native iOS/Android. **One scanner codebase** (the existing
> `providers/*.mjs`) → an always-on Node scanner-proxy **and** `jobdar serve`. Privacy is structural: the
> résumé and every score stay on-device; the only server is a PII-free scanner whose request schema
> *cannot* carry a résumé. On-device model default, Midwest/entry defaults, EN/ES parity, version-lockstep.
>
> Finalized 2026-06-15 (multi-agent design workflow + decisions locked with Sam). Execution awaiting go.

## Locked decisions

| # | Decision | Choice |
|---|---|---|
| 1 | UI stack / code-sharing | **Expo (React Native + react-native-web)** — one codebase → web PWA + native iOS/Android. `expo-router` tabs, Zustand + TanStack Query. |
| 2 | Scanner-proxy hosting | **Always-on Node service on Fly.io/Render** (Dockerized; the shared `scanHandler` wrapped in a thin HTTP server). No edge-CPU cap → HTML-heavy iCIMS/Workday parse freely. `jobdar serve` keeps loopback for power users. |
| 3 | v1 scope | **Web + native together.** Native is on the critical path; the 9.0 spike must prove the native runtime before UI. |
| 4 | On-device model | **Per-platform quant** — larger on web/desktop, smaller on mobile. The 9.7 harness reports accuracy **per surface** (honest, not asserted parity). |
| 5 | Native runtime | **Decide in the 9.0 spike; bias `llama.rn`** (shares winc's GGUF/quant lineage → keeps the guaranteed-JSON Verdict shape closest to the web path). |
| 6 | Engine extraction timing | **Milestone 9.0 prelude** (not reopening the frozen 8e). CLI re-pointed at the extracted package with `test-all.mjs` green proves behavior-neutral; `ENGINE_VERSION` bumps when the ports land. |

## Feasibility — verified against the code before locking the stack

- **Provider purity:** `providers/*.mjs` + `lib/http.mjs` + `lib/html.mjs` contain **zero** `node:`/`Buffer`/`process`/`child_process` references — pure Web-standard `fetch`/`URL`/`AbortController`. They run **byte-for-byte** in a Node server, in `jobdar serve`, and in a native-fetch context. "One scanner codebase" is real.
- **Scoring-core purity:** `eval_engine`, `prescreen`, `salary`, `pay` (compute), `tailor`, `outreach` (`draftOutreach`/`lintDraft`), `cv_render`, `regions`, `levels`, `dates` import **zero** node builtins. The rubric is **inlined JS constants** in `eval_engine.mjs` — *not* read from `modes/*.md` via fs at runtime. The whole scoring path drops into a browser unchanged.
- **fs coupling is exactly 9 modules**, all routed through the `paths` chokepoint in `lib/config.mjs`: `config`, `evaluations`, `outreach`, `customize_store`, `resume`, `docparse`, `pay`, `i18n`, `eval_ops`. **That is the entire port surface.**
- **`inference.mjs` is pure `fetch`** to a Messages-API shape; `selectActive()`/`callBackend()` already *are* the `InferenceClient` interface.

## Two conflicts resolved

1. **The loopback guard blocks an embedded model.** `inference.mjs` hard-throws for any `kind:'local'` whose `baseUrl` is not loopback (`isLoopbackUrl`). WebLLM-in-browser and `llama.rn`-on-device are not HTTP servers — no URL. **Resolution:** add a third backend kind **`local-embedded`** to `selectActive`; `callBackend` dispatches it to an injected `InferenceClient.complete(opts)` returning the same `{text,usage,model}` shape, bypassing the URL guards. `kind:'local'` (loopback HTTP) stays for `jobdar serve`/winc; `kind:'api'` (BYO key) unchanged. Additive at the 8e seam, not a fork.
2. **Capacitor framing → Expo.** Native fetch (Expo `fetch`/RN `fetch`) also has no browser CORS, so `providers/*.mjs` can be called directly from the native build as a *9.x optimization* — but the **default transport for both surfaces is the Fly/Render proxy** (one path, central rate-limiting).

## Architecture — shared core + three surfaces + one proxy

```
                         ┌──────────────────────────────────────────────┐
                         │  @jobdar/engine  (packages/engine)            │
                         │  ENGINE_VERSION-pinned, ZERO node:* imports    │
                         │  PURE: eval_engine, prescreen, salary, pay,    │
                         │  tailor, draftOutreach/lintDraft, cv_render,   │
                         │  regions, levels, dates, evaluations(compute), │
                         │  inference(+ local-embedded), i18n             │
                         │  PORTS (injected): Store, DocExtract,          │
                         │         InferenceClient, discover/fetchJd      │
                         └──────────────────────────────────────────────┘
            ┌──────────────────────────┬──────────────────────────┬───────────────┐
   CLI (apps/cli, Node)        Web PWA (apps/jobdar)       Native iOS/Android   @jobdar/scanner
   Store=fs, extract=          Store=IndexedDB/OPFS        (same Expo source)   (packages/scanner)
   pdftotext/unzip,            extract=unpdf/mammoth       Store=expo-sqlite +  providers/*.mjs
   Inference=loopback HTTP     Inference=WebLLM/WebGPU      expo-file-system     UNCHANGED
   (winc) or api              (local-embedded) or api      extract=native +     │
                                                            unpdf-wasm           ▼
                                       │ public search params + job URLs only    Always-on Node service
                                       └────────────────────────────────────────▶ Fly.io / Render
                                       (résumé + scores NEVER cross this line)    /scan, /fetch-jd
                                                                                  (also: jobdar serve)
```

**Privacy by architecture (the verification gate):** every model verb — `importDocument`, `preConfirm`,
`evaluate`, `tailor`, `draftOutreach` — runs **100% client-side**. The proxy's request bodies have **no
field** for résumé text or scores; it is *structurally incapable* of seeing PII. Egress is only the
per-provider ATS host allowlist enforced by `assertAllowedUrl` (HTTPS-only, `redirect:'error'`). The Phase
9 gate — *non-technical Spanish-preferring user, phone, uploads résumé, reaches ranked matches + tailored
CV, network trace shows the résumé never left the browser* — is met because the only egress is
`POST /scan {portals, region, title, level}` and `POST /fetch-jd {url}`.

## The canonical three-tab UX → engine verbs

`expo-router` file-based tabs, byte-identical on web + native. Zustand holds profile/toggles/language;
TanStack Query wraps each async verb and surfaces `onProgress` events as live status.

### Tab 1 — Search (onboarding lives here)
Onboarding: *"Upload your résumé and tell us what you want."* Free-form intent box + structured toggles
(region default **Midwest**, level default **entry**, `transferable_skills` off).

| Step | Verb | Where | Notes |
|---|---|---|---|
| Upload + parse | `importDocument(file,{active})` | **client** | Deterministic extract (unpdf/mammoth); model only *structures* fields, never rewrites. Writes `cv.md` + `profile.yml` to the **Store**, not a server. |
| Infer intent | `local-embedded` structuring | **client** | Free-form intent → field/title/level/region. Heuristic (`parseResumeText`) fallback if no WebGPU. |
| Discover roles | `scan({portals, discover})` | **engine; discover→proxy** | `POST /scan` → `[{title,url,company,location,postedOn}]`. Zero-token, PII-free. |
| Zero-token gate + rank | `prescreenRole` | **client** | 7.7 hard gates (years/degree/clearance) + likelihood 0–100; screened roles kept with a quoted reason, not hidden. |
| **Light-AI pre-confirm** | `preConfirm({active,jd,cv,profile,transferable})` | **client** | The NEW thinning layer **between** prescreen and heavy eval — cheap yes/maybe/no, **not a score**. `skip` drops the role before scoring. `fetch-jd` pulls each survivor's JD lazily via the proxy. |
| Ranked candidates | `pendingQueue` / `band` | **client** | Feeds Tab 2. |

### Tab 2 — Apply
| Step | Verb | Where | Notes |
|---|---|---|---|
| Score the thinned queue | `evaluate({active,jd,cv,profile,confirm,transferable,escalate})` | **client (`local-embedded`/`api`)** | 8a decomposed rubric (skills 35 / exp 25 / level 20 / logistics 10 / edu 10), categorical judgments + quoted JD evidence. **Code** computes 0–5, applies gates/clamp, merges pay (STATED→COMPARABLE→BLS, mandatory source label). Apply ≥4.0 / Research ≥3.5 / else Don't. Borderline → `escalate` to a second backend (BYO API). |
| Record verdict | `recordVerdict` → Store | **client** | Pure rows-in/rows-out. |
| One-tap tailored CV + cover | `tailor({…,directives})` → `buildCv` | **client** | temp 0, grounded (directives steer tone/length only, never facts), versioned `-vN`, idempotent. `buildCv` → HTML; PDF via client-side print/`pdf-lib`. |

### Tab 3 — Follow-up
| Step | Verb | Where | Notes |
|---|---|---|---|
| Draft cold contact | `draftOutreach({…,recipient,directives})` | **client** | One real fit reason + one ask, addresses recipient by name, temp 0. Surfaces LinkedIn *links* — no scraping, no sending. |
| Lint before it leaves | `lintDraft` | **client** | length <300, no `{name}` placeholder, recipient first-name present. |
| Polite cadence (code-enforced) | `appendOutreach` → Store ledger | **client** | `maxContactsPerRole=2`, `followupAfterBusinessDays=5`, `maxFollowupsPerPerson=1` — hard stop, no override. Ledger: name/title/channel/date only. Drafting ≠ logging. |
| Status tracking | `advanceStatus` / `readPipeline` | **client** | Tracker is a view over the pipeline store. |

## Inference tiers + fallback ladder (per surface)

One `InferenceClient` interface matching the `inference.mjs` Messages-API shape
(`complete({system,user,maxTokens,temperature,responseFormat}) → {text,usage,model}`), `kind ∈
{local-embedded, local, api}`.

| Surface | Default (`local-embedded`) | Fallback ladder | `api` upgrade |
|---|---|---|---|
| **Web PWA** | WebLLM on WebGPU, winc-class quant; guaranteed-JSON eval via WebLLM's grammar/`response_format`. | WebGPU present → run · absent/low-RAM → **smaller quant** · still infeasible → **explicit-consent** confidential-cloud (never silent). | BYO Anthropic key → `/v1/messages`, prompt-cached rubric. |
| **Native** | `llama.rn` (or MLC), **smaller per-platform quant**. | capable device → run · constrained → smaller quant · explicit-consent cloud. | BYO key, identical. |
| **Power-user / CLI** | winc.cpp loopback (`kind:'local'`, unchanged). | api when key present. | BYO key. |

**Inviolable:** the résumé is never silently sent to a server — the cloud fallback shows a blocking
consent dialog and is testable via the network-trace gate. **Guaranteed-JSON parity is the 9.0 gating
spike:** WebLLM (web) and `llama.rn`/MLC (native) must both yield an identical Verdict shape + valid
grammar-constrained JSON vs. winc — one eval per adapter, before any UI.

## Local-first persistence behind a Store adapter

Refactor the 9 fs-bound modules to call an injected `Store` instead of `node:fs`, through the `paths`
chokepoint in `config.mjs`.

```
interface Store {
  read(key): Promise<string|null>   // key ∈ {pipeline, outreach, customize, cv, profile, portals}
  write(key, data): Promise<void>   // atomic where supported
  append(key, line): Promise<void>  // outreach ledger / eval_ops
  exists(key): Promise<boolean>
}
interface DocExtract { extractText(fileOrBuffer): {ext, text, error?} }
```

| Surface | Store impl | DocExtract impl |
|---|---|---|
| CLI (Node) | fs + `atomicWrite` (current) | `pdftotext`/`unzip`/`textutil` (current) |
| Web | **IndexedDB** (rows) + **OPFS** (`cv.md` blob) | **unpdf** (pdf.js) + **mammoth** + txt/md |
| Native | **expo-sqlite** + **expo-file-system** | native pickers + **unpdf-wasm**/mammoth |

Migration order inside `@jobdar/engine`: `config` (paths→keys) → `evaluations` → `outreach` →
`customize_store` → `resume` → `pay`/`i18n` (asset reads become **bundled imports**) → `eval_ops`. The
CLI keeps the fs Store so one logic path serves all surfaces — no fork. Schema migration follows the
existing TSV pattern (columns appended at the end, missing-cols read as `''` → backward-compatible).
Portability: a `JOBDAR_HOME`-style export/import bundle (the "copy the folder to migrate" idea), optional
encrypted backup.

## Bilingual, accessibility, offline

- **Bilingual:** load `config/i18n/{en,es}.yml` **verbatim** (already key-mirrored, enforced by
  `test-all.mjs`) as a bundled import — no hardcoded strings. Language = `profile.language` in Zustand +
  per-run override. EN canonical for state IDs; ES aliases on input (reuse `templates/states.yml`).
- **Accessibility (WCAG):** RN a11y props compile to ARIA on web; honor `prefers-reduced-motion`, ≥4.5:1
  contrast, full keyboard nav, 44×44pt touch targets, screen-reader-announced progress. The non-technical
  phone persona is the design center.
- **Offline:** Metro web export is a real installable PWA (manifest + service worker caching the shell +
  model weights); native is offline-by-default. Only role discovery needs network.

## Monorepo / file structure

pnpm workspace; the CLI also consumes `@jobdar/engine` (one source of truth, lockstep with
`ENGINE_VERSION`).

```
jobdar/                                  (repo root → workspace root)
├─ pnpm-workspace.yaml
├─ packages/
│  ├─ engine/   @jobdar/engine  (pinned to ENGINE_VERSION; zero node:*; ports injected)
│  │  ├─ src/   migrated lib/*.mjs   ├─ ports/ store.d.ts docextract.d.ts inference.d.ts
│  │  └─ assets/ i18n/{en,es}.yml, states.yml, wages-national.yml  (bundled imports)
│  └─ scanner/  @jobdar/scanner
│     └─ providers/*.mjs + http.mjs + html.mjs (UNCHANGED) + scanHandler.mjs (/scan, /fetch-jd)
├─ apps/
│  ├─ cli/      Node CLI → engine fs-Store + loopback inference
│  ├─ jobdar/   Expo app (web PWA + iOS + Android)
│  │  ├─ app/(tabs)/{search,apply,followup}.tsx
│  │  ├─ adapters/ store.web.ts (IndexedDB/OPFS), store.native.ts (sqlite/fs),
│  │  │            extract.web.ts, extract.native.ts,
│  │  │            inference.web.ts (WebLLM), inference.native.ts (llama.rn)
│  │  ├─ state/  zustand (profile, toggles, language, backend)
│  │  └─ app.json / metro.config.js / public/manifest.webmanifest + sw
│  └─ server/   Node HTTP service for Fly.io/Render
│     └─ src/index.ts  imports @jobdar/scanner scanHandler → /scan, /fetch-jd
│        + Dockerfile + fly.toml / render.yaml  (CORS locked to prod origin, rate-limited)
└─ (existing modes/, docs/, CHANGELOG.md, ROADMAP.md — version-lockstep across all)
```

**Hosting:** one always-on Node service (Fly.io or Render), Dockerized, CORS locked to the production
origin, per-IP + per-provider rate-limit + stable `jobdar` User-Agent as the central choke point. The app
reads a `backendBaseUrl` setting: hosted proxy by default, `127.0.0.1:4320` when `jobdar serve` is up. A
conformance/lint test keeps the scanner provider-pure so the same code stays portable to native fetch.

## Milestones (v1 = web + native; each independently shippable)

| # | Milestone | Deliverable |
|---|---|---|
| **9.0** | Foundation + engine extraction + **dual-adapter spike** | pnpm monorepo; `lib/*` → `@jobdar/engine` behind `Store`/`DocExtract`/`InferenceClient` ports (9 fs-modules via the `config.mjs` chokepoint); CLI re-pointed (`test-all.mjs` green = zero behavior change); `ENGINE_VERSION` bump; **one-eval-per-adapter spike proving WebLLM *and* `llama.rn` give an identical Verdict + valid guaranteed-JSON vs winc** (native runtime decided here). |
| **9.1** | Scanner-proxy (Fly/Render) | Always-on Node service bundling `@jobdar/scanner`; `/scan` + `/fetch-jd`; Dockerized, CORS-locked, rate-limited; **live-verified vs real Workday/iCIMS/Greenhouse tenants** (URLs resolve 200). `jobdar serve` keeps loopback. |
| **9.2** | Web adapters + upload→parse | IndexedDB/OPFS Store + unpdf/mammoth extract; résumé upload→`importDocument`→`cv.md`+profile prefill fully client-side; clean network trace. |
| **9.3** | Web PWA | Three-tab shell over the verbs + WebLLM `local-embedded` + the WebGPU→smaller-quant→consent-cloud ladder; installable/offline; EN/ES parity; WCAG pass. |
| **9.4** | Native adapters | expo-sqlite + expo-file-system Store, native pickers, `llama.rn` `local-embedded` inference. |
| **9.5** | Native iOS/Android (EAS) | Same Expo source → EAS build → iOS + Android + **new-match push notifications** + store-submission prep. |
| **9.6** | API tier + consent-cloud | BYO-key `api` upgrade + explicit-consent confidential-cloud fallback across both surfaces; blocking consent dialog. |
| **9.7** | Privacy + measurement gates | Network-trace privacy gate in CI (no résumé/score in any request body; egress only `/scan`+`/fetch-jd`); **per-surface** match accuracy (vs the 100-JD corpus) + task success + time-to-first-match + server-cost monitor; end-to-end verification (Spanish-preferring phone persona). |

## Verification / testing

- **Engine conformance:** extend `test-all.mjs`'s engine-only path (`importDocument → evaluate →
  recordVerdict → advanceStatus → buildCv`) to run against **injected mock Store + mock InferenceClient** —
  proves the ports are behavior-neutral. `ENGINE_VERSION` bumps on any shape change.
- **Adapter parity (9.0):** one eval per inference adapter (WebLLM, `llama.rn`) → identical Verdict + valid
  guaranteed-JSON vs winc.
- **Scanner conformance:** provider-purity lint + **live** ATS-tenant checks (per the live-test-scanners
  discipline — real Workday/iCIMS/Greenhouse URLs resolve 200, not just fixtures).
- **Privacy gate (blocking, CI):** Playwright/Detox network trace — no résumé/score in any request body;
  egress only `/scan`+`/fetch-jd`. This is the Phase 9 gate, encoded as a test.
- **i18n parity:** key-mirror test + lint for hardcoded JSX literals.
- **A11y:** axe-core on web + manual VoiceOver/TalkBack on the Spanish phone persona.

## Top risks → mitigations

- **Engine extraction is the gate** (9 fs-modules behind ports before any app). → Do it at 9.0 through the
  single `config.mjs` chokepoint; keep the CLI on the fs-Store so `test-all.mjs` proves zero behavior
  change; never fork the logic.
- **Two on-device runtimes** (WebGPU vs `llama.rn`/MLC) differ in model format, memory, JSON path. → The
  9.0 spike confirms identical Verdict + valid grammar JSON on **both** before UI; pick native runtime from
  the spike, not in advance.
- **The loopback guard** hard-throws for a non-loopback local backend. → `kind:'local-embedded'` dispatches
  to the injected client, bypassing URL guards; verify the api HTTPS guard and the embedded path are
  mutually exclusive so the privacy invariant can't be bypassed.
- **WebGPU isn't universal** (older phones, some Safari) + large weights — risks the non-tech-phone target.
  → Wire the fallback ladder from day one (never silent cloud); code-split + lazy-load model/parser; cache
  weights in the service worker; measure bundle/first-match time against the persona.
- **Privacy regression** (a careless adapter puts résumé/score in a request). → The network-trace gate
  blocks merge in CI; the proxy request schema literally has no résumé field.
- **react-native-web bundle** is heavier than a hand-rolled PWA; Metro SW tooling less mature than Vite. →
  Confirm installability + offline cache early as a spike; code-split routes; measure bundle vs the target.
- **Always-on host cost/uptime** (Fly/Render bills idle, you patch it). → Stateless single service, easy to
  scale/redeploy; the central rate-limiter caps abuse; revisit serverless only if cost warrants.
