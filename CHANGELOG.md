# Changelog

All notable changes to Jobdar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and Jobdar adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.45.0] — 2026-07-06

**Web–native parity + gap-plugging** — the web app and the native app now behave identically, and the
documented known-gaps list is brought up to what's actually true. App `@jobdar/app` **1.15.0**.

- **Native persistence (AsyncStorage).** State now persists on BOTH platforms: web keeps synchronous
  `localStorage` (same key — existing users keep their state, no hydration flash), native uses
  `@react-native-async-storage/async-storage` (was a no-op → native lost everything on restart). Same
  blank-first-boot / saved-after-first-use contract everywhere.
- **Native résumé upload.** The picked file's bytes are read per-platform — web: `fetch(blob:)` →
  `btoa` (unchanged); native: the SDK-56 `expo-file-system` `File.base64()` API (`fetch(file://)` is
  unreliable on native). Same `POST /import/upload` path and behavior on both.
- **Backend-down banner.** When `jobdar serve` is unreachable the Search tab (and onboarding) show an
  honest banner with the command to run and a one-tap **Retry** — a browser/native app cannot start a
  local process itself, so it says so instead of failing silently.
- **List pagination.** The Search list renders in pages of 30 with "Show more (N remaining)" — a
  several-hundred-row pipeline no longer renders in one go; any query/sort/filter change resets to page 1.
- **Honest signal labels.** Prescreen chips renamed from verdict-language to signal-language:
  "Likely fit" → **"Strong signals"**, "Worth a look" → **"Some signals"** (ES: "Señales fuertes" /
  "Algunas señales") — prescreen is keyword overlap + freshness; "fit" is the eval's word.
- **Known-gaps docs made true.** ROADMAP + phase9-architecture gap lists updated: onboarding /
  `POST /profile` / doctor-poppler / USAJobs / native persistence marked shipped; remaining honest gaps
  (per-device state, physical-phone serve URL, poppler host dep, keyless discovery scope, bimodal
  evaluator pending labeled data, 1.0 human decisions) restated as of 1.45.

## [1.44.0] — 2026-07-02

**Immigration-sponsorship toggle** — for the users Jobdar is built for (international students, new
Americans, workforce entrants). App `@jobdar/app` **1.14.0**; `test-all.mjs` **133**.

- **"Need visa sponsorship" toggle** (Search tab + onboarding, EN/ES). A personal status only the user
  can assert — never inferred from a résumé. Honest three-stance design because **most JDs are silent**:
  - toggle ON + JD explicitly refuses ("without sponsorship now or in the future", "unable to sponsor",
    "must be a U.S. citizen") → **screened out with the JD line quoted** (kind: `sponsorship`), same
    honesty contract as years/clearance/credential gates; the eval clamp hard-gates it too;
  - JD explicitly **offers** ("visa sponsorship available", "we sponsor H-1B") → a green **"✓ Sponsors
    visa"** indicator on the role card (positive channel — never a point-costing flag);
  - JD silent → untouched, no stance claimed either way.
  Toggle OFF keeps the old behavior (an explicit "no" is a soft flag — Jobdar can't know your status).
- **Engine:** `extractSponsorship` now three-stance (`no`/`sponsors`/`unknown`, negative wins, `flagged`
  kept for back-compat); `screenDecision` gates on `needs_sponsorship`; new profile default
  `needs_sponsorship: false`; serve `/prescreen` + `/evaluate` accept `needsSponsorship`; `POST/GET
  /profile` persist/return it; new pipeline column **`notes`** (positive JD-stated indicators, currently
  `sponsors-visa`; display-only, never a screen input; legacy files parse fine).
- **Fix:** CLI `jobdar prescreen` now passes the role **title** into the gate (`prescreenRole`), so the
  hard-identity field gate (accountant/nurse/attorney titles) fires on the CLI path like it already did
  via serve — it silently never fired on the CLI before.

## [1.43.0] — 2026-07-02

**Recommendations delivery** — closing out the eval-evaluation work: a real feedback loop, batch scoring,
a new coverage provider, and npm ship-prep. App `@jobdar/app` **1.13.0**; `test-all.mjs` **130** (+ a
`feedbackStats` unit test, a USAJobs fixture test, and a serve `/eval/feedback` round-trip in the
subprocess test).

- **Eval-feedback loop → labeled set → recalibration.** A 👍/👎 on any Apply verdict is a human label:
  the app persists it and `POST /eval/feedback` appends `(url, company, role, score, band, thumb, date)`
  to the local, gitignored `data/eval_feedback.tsv` (de-duped by url — you can change your mind). New
  `jobdar calibrate --feedback` reports the evaluator's real agreement rate + the list of roles it got
  wrong, **with no backend needed**. This is the data path to recalibrating the bimodal band thresholds
  *from evidence* instead of guessing them. New `lib/feedback.mjs`; serve `POST`/`GET /eval/feedback`.
- **Batch Apply scoring.** A "⚡ Score top N matches" button in the Apply tab evaluates the top relevant
  unscored roles with a bounded concurrency pool (3) so winc stays responsive; results land as they
  finish. Store `scoreTopN(n)` + a `scoring` flag. No more tapping every card.
- **USAJobs provider (opt-in, BYO free key).** A seventh scanner — the U.S. federal jobs aggregator, a
  large, public, entry-friendly source covering thousands of agencies in one endpoint. Needs a **free**
  key from developer.usajobs.gov + the registered email (User-Agent), both in the gitignored
  `data/credentials.env`; **dormant without a key** so it never breaks a scan. A "portal" is a saved
  search (`data.usajobs.gov/api/search?Keyword=…&LocationName=…`). New `providers/usajobs.mjs`,
  `loadUsaJobsCreds()` / `loadCredential()` in `lib/config.mjs`. **Not live-verified in-repo** (requires a
  real key) — the pure parse/map/assemble helpers are fixture-tested; the network path needs a live key.
- **npm ship-prep.** `prepublishOnly` gates publish on a green suite; `npm pack --dry-run` audited clean
  (95 files, no personal data — `eval_feedback.tsv` / `credentials.env` are under the ignored `data/*`).
  New `RELEASING.md` checklist. Confirmed the unscoped npm name `jobdar` is **available**. Flagged the
  human-only calls (claim-name-vs-scope, closed-beta timing, license) for Sam.

## [1.42.0] — 2026-06-16

**Eval-calibration pass** — from an honest evaluation of the scorer against a cross-persona matrix (PM /
SWE / analyst résumés × PM / ML-eng / marketing / VP roles). App `@jobdar/app` **1.12.0**; `test-all.mjs`
**128** (clamp/granularity tests updated).
- **5-level ratings** (`strong/good/partial/weak/none` = 1/.75/.5/.25/0, was 3-level). The extra steps
  smooth the score lattice so a genuine early-career fit can land in the **Research band (3.5–3.9)** instead
  of clustering at Apply/Don't. Back-compat: strong/partial/none keep their old values.
- **The clamp no longer cliffs on years.** A "X+ years" shortfall shapes the score (via the experience
  sub-criterion) but never force-clamps to Don't — transferable or not — since the prescreen ceiling already
  screens egregious over-reach. Genuine hard blockers (license / cert / clearance / excluded-degree /
  hard-identity field) still clamp. (Verified live: a 2-yr engineer vs a 3–6-yr role is now `clamped:false`,
  not force-zeroed.)
- **Prompt reserves `none`** for zero relevant signal (not merely below-target).
- **App defaults transferable-skills ON** — the users (new grads / career-changers) are exactly who need
  adjacent-skill credit.
- **`/evaluate` guards an empty JD** (added earlier this cycle) — an unfetchable listing returns an honest
  "couldn't assess" instead of a résumé-blind false Apply.
- **`jobdar calibrate` gained a score-distribution report** (Apply/Research/Don't population — surfaces a
  bimodal evaluator at a glance) and **per-item `cv`** so one calibration set can cover multiple personas.

  *Honest finding:* these fix the code-side calibration (the lattice can now reach Research, the clamp
  doesn't cliff), and discrimination is correct (right persona → right role; over-level rejected). But on a
  small live matrix the distribution is still bimodal — the model (qwen3.5-4b) still rates confidently at the
  extremes and over-uses `none`. Truly reviving the Research band needs a **labeled calibration set** (the
  `calibrate` distribution report + per-item cv + a future thumbs-up/down feedback loop are the enablers) —
  it can't be fixed by guessing thresholds.

## [1.41.0] — 2026-06-16

**Onboarding + profile persistence + a doctor check** (closes three documented gaps). App `@jobdar/app`
**1.11.0**; `test-all.mjs` **128** (+ POST /profile + doctor coverage).
- **First-run onboarding screen.** On a true first boot the app shows a welcome → upload-résumé (or set
  region/level/salary manually, or "continue as <name>" if a saved CLI profile exists) → start searching.
  Persisted `onboarded` flag so it shows once; the blank Search tab is no longer the bare entry point.
- **`POST /profile`** (serve) — saves the chosen identity (name, target_regions/levels/salary,
  transferable, language) to `config/profile.yml` (merge + atomic-write; **never** the API key or
  inference_url). The app calls it after a résumé upload, so an uploaded identity is durable across
  devices/cleared browser storage, and onboarding can offer "continue as <name>".
- **`jobdar doctor` now checks résumé-import tools** — detects `unzip` (.docx) and `pdftotext`/poppler
  (.pdf) and prints the exact install command when poppler is missing (the previously-undetected PDF-upload
  prerequisite).
- **`/evaluate` guards an empty JD** — a role whose description can't be fetched (expired / JS-rendered) no
  longer gets a confident résumé-blind score; it returns an honest "couldn't assess" (mirrors prescreen
  flooring expired listings). Found during a cross-persona matching validation (PM / SWE / analyst résumés
  vs PM / ML-eng / marketing / VP roles): the engine correctly tops each persona's appropriate role and
  rejects mismatches + the over-level VP role — but an unfetchable role's empty JD had scored a false Apply.

## [1.40.1] — 2026-06-16

**Docs — known gaps & limitations documented.** Marked and elaborated the current known gaps so they aren't
mistaken for bugs: a consolidated **"Known gaps & current limitations"** section in `ROADMAP.md` (and an
elaborated app-side version in `docs/phase9-architecture.md`), the **poppler/`pdftotext` prerequisite** for
PDF résumé upload/import in `docs/getting-started.md` + `docs/troubleshooting.md`, plus troubleshooting rows
for "couldn't read that file" and the blank-on-first-boot/browser-local-persistence behavior. Covers: no
onboarding screen yet; app profile persistence is browser-local (no `POST /profile`); PDF needs poppler;
discovery is keyless ATS-probing (aggregator/USAJobs = future Pro); 1.0 ship items (npm publish + closed
beta) still open. Docs only — no code change. (CLI banner also caught up from a 1.39.0→1.40.0 drift.)

## [1.40.0] — 2026-06-16

**State persists after first use (still blank on a true first boot).** The blank-start app was session-only
— a reload always returned to empty. Now the app's own state (profile, résumé text + file name, salary,
region/level choices, intent, results, verdicts, drafts, outreach ledger) is persisted to the browser via
zustand's `persist` middleware. A genuine **first boot has no stored key → blank**; once the user uploads a
résumé or makes a selection, it's saved and **restored on the next load**. Only durable user state is
persisted — transient runtime flags (serve-up, busy, progress) are not. App `@jobdar/app` **1.10.0**.

## [1.39.0] — 2026-06-16

**Blank-start app + target-salary selector.** App `@jobdar/app` **1.9.0**; `test-all.mjs` **128**.
- **The app no longer seeds any user identity on load.** It previously hydrated the local `config/profile.yml`
  (name/region/level) and `data/cv.md`, so it opened as "Sam Dotson." Now it starts **blank** — no name, no
  region/level selected, no résumé, no roles — and `hydrate()` only checks that serve is reachable. The
  profile is filled solely by an uploaded résumé or the user's own choices. (A real onboarding screen comes
  before any public release; this is the interim blank slate.)
- **The app holds its own state and sends it to serve.** Prescreen/evaluate now receive the app's résumé and
  target salary, so results reflect the user — not the server's saved `cv.md`/config. A blank search defaults
  to nationwide / all-levels rather than the saved config.
- **Target-salary selector** (Any / $40k / $60k / $80k / $100k / $120k) — a new `salary` profile field threaded
  into prescreen + evaluate (nudges rank + the pay band via the existing `target_salary` weighting).
- Empty Search list now shows a prompt instead of "—".

## [1.38.0] — 2026-06-16

**Uploading a résumé now updates the profile, not just the cv.** Previously an upload set the résumé text
but left the displayed identity unchanged — so after uploading "Alex Rivera" the app still showed jobs for
"Sam Dotson." Now `POST /import/upload` also extracts identity fields (name, location, level) via the
backend and returns them, and the app **seeds the profile from the résumé**: the name always updates; the
**region** (derived from the résumé's location via new `regionForLocation`) and **level** update too — but
only when the user hasn't manually chosen them, so a chip the user toggled always wins. If the résumé moves
the region/level, the search re-scans for the new scope; either way the roles are re-fit to the new résumé.
App `@jobdar/app` **1.8.0**; `test-all.mjs` **128**. (Profile changes are session-scoped — a reload re-reads
the saved `config/profile.yml`; persisting an uploaded identity back to config is a future option.)

## [1.37.0] — 2026-06-16

**Résumé upload actually handles .docx and .pdf.** The app previously read uploads as text and rejected
anything binary ("Paste your text or use a .txt"). Now the GUI reads the picked file's bytes and serve
parses them with the real `docparse` extractor. App `@jobdar/app` **1.7.0**.
- **New serve `POST /import/upload {name, base64}`** — writes the bytes to the confined `data/uploads/` dir
  (sanitized name), runs `importDocument` (docx via `unzip`, pdf via `pdftotext`, txt/md direct), persists
  the extracted text as the active résumé, and returns it. A file it can't read returns an honest error
  (e.g. a scanned/image PDF → "couldn't read that file").
- **App upload rewired:** the Search tab's Upload button now reads the file → base64 → `/import/upload` →
  shows "✓ <filename>" green and re-ranks the list against the new résumé. (PDF needs `pdftotext`/poppler on
  the serve host; `.docx` needs `unzip` — both standard.)

## [1.36.1] — 2026-06-16

**Honest résumé status (no fake "loaded").** The Search tab showed a green "✓ Résumé loaded" whenever any
résumé existed on disk — even if the user hadn't loaded one this session. Now the green ✓ + file name shows
**only for a résumé the user actually uploaded this session**; a pre-existing saved résumé is disclosed
neutrally ("Using your saved résumé"); and when there's genuinely none it prompts to upload. App **1.6.1**.

## [1.36.0] — 2026-06-16

**Search-tab refinements.** App `@jobdar/app` **1.6.0**; `test-all.mjs` **127** (+1 regionPriority test).
- **The 0–100 score is gone from the Search tab** — each role shows only its **fit indicator** (Likely
  fit / Worth a look / Skip). The numeric score is reserved for the evaluation (Apply) stage; the prescreen
  score is still computed internally (it drives the fit tier + a hidden ranking tiebreak). The "Score" sort
  is relabeled **"Best match."**
- **Region selection now changes priority by timezone.** New `regionPriority` (engine) ranks roles
  physically in the selected region first, then timezone-aligned roles, and **deprioritizes remote roles
  anchored outside the region's timezone** — e.g. a "Columbus, OH (remote)" Machine-Learning role no longer
  floats to the top when **West** is selected. (It's a re-rank, not a cut — remote roles stay reachable.)
- **The uploaded résumé file name is shown in green** under the Upload button (e.g. "✓ Jen_Doe_Resume.pdf")
  instead of the previous uninformative "Résumé loaded" text. `loadResume` now records the file name (it no
  longer mis-assigns it to the candidate's profile name).

## [1.35.1] — 2026-06-16

**Search speed.** Finding jobs was slow; the dominant cost was the scan re-fetching every company board.
- **`/prescreen` fetches JDs concurrently** (pool of 8) and writes the pipeline **once** per batch
  (`upsertPrescreenMany`) instead of a 200 ms-paced one-at-a-time fetch + a full-file rewrite per row — a
  batch dropped from ~7 s to ~1 s.
- **`/scan` parallelism 4→12 + a 12 s per-portal timeout** so one slow board can't stall a wave — a 50-board
  scan dropped from ~58 s to ~15 s.
- **Refining the search no longer re-scans.** The scan (the slow part) now runs only when the **scope**
  (region/level) changes or the pipeline is empty; editing the intent just re-ranks + prescreens the
  already-discovered roles. Scan results also render immediately (relevance-ranked) before prescreen enriches.
- **Smoother progress.** The "Find matching roles" bar now advances continuously (a 250 ms ticker, monotonic)
  between server round-trips instead of jumping per batch. App `@jobdar/app` **1.5.1**.

## [1.35.0] — 2026-06-16

**Phases 9.3+/9.4 — tunable search, BM25-lite relevance, and intelligent company discovery.** Builds on
the LinkedIn/Indeed retrieve-then-rank methodology, adapted to local-first + winc. Lands as `@jobdar/app`
**1.5.0**; `test-all.mjs` **126** (+2 discovery tests).

### Tunable controls (Search tab)
- **Selectable regions** (Midwest/Northeast/Southeast/Southwest/West/Nationwide) and **adjustable level**
  (entry/mid/senior) as multi-select chips. They filter the visible list **live** (same `levelDecision` +
  `locationMatches` the scan uses) and the next "Find matching roles" **re-scans** the new scope.
- **Résumé re-upload now changes results:** the upload re-prescreens the relevant roles against the new
  résumé (new `rescore` path; serve `/prescreen {rescore:true}` re-scores already-scored rows).

### Relevance tuning
- `relevanceScore` is now **BM25-lite**: a title-phrase match dominates, keyword hits weigh by specificity
  (longer ≈ rarer, a cheap IDF proxy), and matching multiple distinct intent terms earns a coverage bonus —
  so a real "Product Manager" clearly outranks a generic "Manager, Workforce Management."

### Intelligent discovery — `lib/discover.mjs` + serve `POST /discover`
- The local model **suggests real employers** for the intent + region; Jobdar deterministically probes their
  **Greenhouse/Lever/Ashby** slug patterns and keeps **only boards that actually return jobs** (live-verified
  via the real provider fetch — a hallucinated company simply never resolves). Verified boards are added to
  the portal seed (`savePortals`) and scanned. Keyless, local, privacy-preserving — no crawler, no API key.
- App: a **"Discover more companies (winc)"** button runs discovery + ranks the newcomers, with the same
  progress bar. (An opt-in aggregator/USAJobs provider can plug into this same seam later as a Pro feature.)

## [1.34.0] — 2026-06-16

**Phase 9.3 — intent-driven search.** The Search tab now leads with *"Tell us what you're looking for"*
instead of a résumé box, and uses winc + the scanner to find and rank matching roles. Lands as
`@jobdar/app` **1.4.0**; `test-all.mjs` **124** (+2 search tests; serve test covers `/search/parse`).

- **New `lib/search.mjs`** (re-exported via `@jobdar/engine`): `parseIntent` turns the free-text request
  into `{titles, keywords, exclude, level?, regions?}` with **one winc call** (expands "PM" → product
  manager / product owner / program manager / associate PM …), degrading to a deterministic keyword parse
  when winc is down — search never 503s. `relevanceScore`/`expandQueryTerms` are pure + instant.
- **`serve`:** new `POST /search/parse {intent}`; `POST /prescreen` accepts parsed `terms` and spends its
  limited budget on the **intent-relevant** roles first (and skips roles the intent excludes).
- **App (`apps/jobdar`):**
  - The top of Search is now a *"Tell us what you're looking for…"* field + an **Upload résumé** button
    (the editable résumé box and the **Refresh** button are removed).
  - **Progress on "Find matching roles":** the button fills 0→100% as the staged search runs (parse intent
    → scan → prescreen in batches). It **validates incrementally** — re-running the same intent skips the
    scan and only prescreens what's left, and a changed intent re-ranks the list instantly client-side.
  - **More relevant, fewer irrelevant:** the list is ranked by relevance to the intent and roles that don't
    match it are cut from the Search tab (an explicit "Likely fit" is always kept); the uploaded résumé is
    persisted to serve so it sharpens ranking and enables scoring.

## [1.33.0] — 2026-06-16

**Security + correctness hardening pass** (from a full multi-agent bug audit of the 9.x surface). The
`serve` HTTP façade and a handful of pure-logic gates got fixed; `test-all.mjs` **122** (+6 regression
tests; the serve subprocess test now also covers the security fixes). App lands as **`@jobdar/app` 1.3.0**.

### Security — `lib/commands/serve.mjs`
- **`POST /import` is now path-confined.** It passed the request-body `file` straight to `readFileSync`,
  so any reachable local file (`~/.ssh/id_rsa`, `~/.aws/credentials`, …) could be read over HTTP. It now
  rejects (403) any path outside the jobdar data home.
- **CORS no longer reflects arbitrary Origins.** The Origin is echoed only for private/loopback/LAN hosts,
  so a public website the user has open can't read `/cv·/profile·/pipeline` cross-origin on the default
  loopback bind. (The header comment claimed this was already the case — now it actually is.)
- **`POST /tracker/set` validates the status** through `resolveState` (mirrors the CLI). An arbitrary
  status could demote a row to `scanned` → eligible for prune **deletion** of an applied/interviewing role.
- **`POST /eval/save` requires a finite numeric score**, and `readBody` caps the body (2 MB) + settles on
  a mid-stream abort (no OOM / hung request).
- **New `POST /cv`** persists the GUI's résumé to `data/cv.md`, and `/tailor`·`/outreach/draft` accept an
  in-band `cv` — so scan/prescreen/eval all judge against the résumé the user actually uploaded.
- SSRF: `assertAllowedUrl` (`lib/http.mjs`) now refuses IP-literal loopback/private/link-local + cloud
  metadata hosts even when a provider's allowlist matches (closes the JSON-LD same-host SSRF).

### Correctness
- **prescreen:** a "N years experience **preferred**/a plus/ideally" ask no longer hard-screens an
  applicable entry/mid role (soft-context aware, like the credential gate); bare "Controller" titles
  (Quality/Document/Air-Traffic) are no longer mis-gated as accounting (now `financial controller`/
  `comptroller`); a leading "CPA preferred" no longer masks a later "active CPA license **required**".
- **regions:** "Washington, DC" files to the Northeast (was Washington-state/West); two-letter words that
  double as state codes (`ONSITE OR HYBRID`, `IN-PERSON`) aren't misread as Oregon/Indiana;
  `canonicalLocation` is state-qualified so same-named cities (Columbus OH vs GA) don't collapse in dedup.
- **pipeline:** alias URLs are space-delimited (a URL with a comma — `?locations=us,ca` — no longer
  fragments dedup/lookups); `recordEval` never writes a literal `NaN` score / wrongly-`evaluated` row.
- **outreach:** `businessDaysBetween` steps in UTC (a follow-up no longer fires a day early across the
  spring-forward DST week); `lintDraft` also catches leftover `[email]`/`[phone]`/`[url]` PII sentinels.
- **docparse:** entity decode reuses the single-pass, codepoint-guarded `decodeEntities` (a `.docx` with a
  numeric entity > U+10FFFF no longer throws `RangeError`; literal entities aren't double-decoded).
- **ReDoS:** bounded the salary comma-group, the iCIMS location, and the `parseVerdict` regexes.
- **app:** the uploaded résumé reaches serve; a failed scan no longer blanks the list; the per-op spinner
  no longer clears for a still-running action; a server-rejected outreach log reverts the optimistic entry.
- **CLI:** `jobdar init --transferable=no` is honored (was coerced to `true`).
- **`apps/server`** `/scan` calls the provider correctly (`resolveProvider` returns `{provider, match}`).
- Docs: ROADMAP status banner corrected to the real CLI version (was drifted at 1.31.0).

## [Unreleased]

### Phase 9.0 — the apps now run the REAL engine (no mirror) — `@jobdar/app` 1.1.0

The repo is now a **pnpm workspace**. A new private **`@jobdar/engine`** package re-exports the pure
(fs-free) `lib/` modules, and the Expo app (`apps/jobdar`) imports it — so the web/native app is driven by
the **exact** level filter, prescreen gates, decomposed-rubric weights, 0–5 score math, band thresholds,
clamp, and pay resolution the CLI runs. The app's hand-written engine *mirror* is **deleted**; `src/engine.ts`
is now a thin adapter over `@jobdar/engine`. A rule fixed in `lib/` is inherited by the app for free.

- **Fixes the level mismatch** an entry/mid candidate was shown senior/director roles. The app's Search
  now calls the real `filterByLevel` → "Director Data Science", "Senior Director, FP&A", "Sr. Applied
  AI/ML Scientist", etc. are dropped (6 of 21 seeded roles); the app defaults to `levels: ['entry','mid']`
  (mid is first-class per scope) so "Specialist"/"Analyst" roles stay while senior/exec are excluded.
- **Hard gates are single-source.** Credential (CPA/RN/PE/bar/CDL) + hard-identity field (accounting/
  nursing/legal) gates now come from the real `prescreenRole`/`screenDecision`/`clampVerdict` — never
  bypassed by the transferable toggle. The duplicated gate maps in the app are gone.
- **Apply scoring uses the real math.** `prepEval` + `buildVerdict` (real `scoreFromJudgments` + clamp +
  band + `paySummary`); only the rubric "judge" remains a transparent keyword stand-in until on-device
  WebLLM (9.3). Nothing fabricates; the gates can't be bypassed.
- CLI runtime unchanged — `lib/`, `bin/`, `commands/` byte-identical; `test-all.mjs` green (**115**).
  CLI semver stays **1.31.0** (no CLI runtime change); the change lands as `@jobdar/app` **1.1.0**.
- Infra: `pnpm-workspace.yaml`, `packages/engine/`, `apps/jobdar/metro.config.js` (workspace-aware Metro),
  `apps/jobdar/types/jobdar-engine.d.ts`. Config/fs-coupled modules (pipeline/outreach stores) stay in
  `lib/` and are reached through the app's own Store adapter — they are not part of the engine surface yet.

## [1.32.0] — 2026-06-15

**Phase 9.1 — `jobdar serve` becomes the full pipeline façade (the GUI backend), + LAN access.** The
locked Phase 9 architecture: all surfaces (web, desktop, mobile) are thin GUIs that point **by default at
the local jobdar CLI + winc engine as the entire full stack** — the model is always server-side; cloud
model API keys become a pluggable **Pro-tier** upgrade later (see ROADMAP). `serve` (the HTTP façade over
`lib/engine.mjs`) grew from 3 endpoints to the whole pipeline so the apps just call it:

- **New endpoints** (all JSON, reusing the real engine verbs + pipeline.tsv): `GET /pipeline`
  (`?status=`/`?pending=true`), `GET /profile` (secrets redacted — never the API key or `inference_url`),
  `GET /cv`, `GET /outreach/due`; `POST /scan` (live discovery → `upsertScanned`), `POST /prescreen`
  (zero-token gate + rank via `prescreenRole`/`upsertPrescreen`, polite paced JD fetches), `POST /eval/next`
  + `POST /eval/save` (`pendingQueue` → real-model score → `upsertEval`, status→evaluated), `POST
  /tracker/set` (`updateStatusByUrl`), `POST /outreach/log` (cadence-checked `canContact`/`canFollowup` →
  `appendOutreach`). Existing `/health`, `/evaluate`, `/import` unchanged.
- **LAN access for the phone:** `jobdar serve --host 0.0.0.0` flips on a **required bearer token**
  (auto-minted and printed, or `--token <x>`); CORS reflects the caller's Origin and allows `Authorization`.
  Default stays **loopback 127.0.0.1** (open, localhost-pinned) — opening the LAN is a deliberate, gated act.
  Prints the Mac's LAN URL so the iPhone on the same Wi-Fi can drive it.
- **Tests:** `test-all.mjs` **116** (+1: a subprocess, `JOBDAR_HOME`-isolated serve integration test —
  auth gate 401/200, pipeline/profile/cv reads, a real `pipeline.tsv` status mutation, 404; no external net).
- **Model-generation endpoints added** (`POST /tailor`, `POST /outreach/draft`) — real-model grounded CV/
  cover + outreach note, `503 {reason}` when winc is down. CORS now reflects the caller's Origin (the GUI is
  served from a different port than serve) so the app can actually reach it.
- **App repointed onto serve (`@jobdar/app` 1.2.0):** `apps/jobdar/src/serve.ts` (typed client) + `store.ts`
  rewired so every action calls serve — Search hydrates from `/pipeline·/profile·/cv`, scan→`/scan`+`/prescreen`,
  score→`/evaluate`+`/eval/save`, tailor→`/tailor`, draft→`/outreach/draft`, log→`/outreach/log`. Verified in
  the iPhone 14 simulator: Search renders the **746 real pipeline roles** + the real profile/résumé from serve.
  `@jobdar/engine` is now used only for derived UI. Then cleaned up: **deleted the dead stand-ins**
  (`engine.ts` trimmed to types + band + cadence + i18n; `data.ts`/`SAMPLE_*` removed), fixed the stale
  "demo data" banner, and gave the Search tab a **search bar + sort (Score default / Newest / A–Z) +
  filter chips (All/Fit/Maybe/Skip)** — auto-sorts by score, stays searchable/filterable.

## [1.31.0] — 2026-06-15

**Hard entry-requirement gating + real-job seeding** (fixes "an IT-support résumé got recommended a Junior
Accountant role"). Engine + app; CLI `test-all.mjs` green (**115**, +4).

Engine (`lib/prescreen.mjs` — deterministic, code-owned, NEVER bridged by the `transferable_skills` toggle):
- **Credential gate** (`extractCredential`) — a named license/cert in *required*-context (CPA / RN / PE /
  bar / CDL / series / DEA / medical) that's absent from the résumé → **screened**. "preferred" / "a plus"
  / "ability to obtain" never gates.
- **Field gate** (`extractField` + `cvHasField`) — a hard-identity occupation by TITLE (Accountant /
  Auditor / Controller; Nurse / RN; Attorney / Paralegal) where the résumé shows **<2 distinct field
  signals** → screened. Software / data / marketing / sales / ops are deliberately NOT hard-identity, so
  genuine transferable fits stay open. The ≥2-signal threshold stops one stray "Excel" from faking
  accounting.
- Reasons flow through the existing `clampVerdict` → forced to "dont"; `prepEval` now threads the
  job title + résumé so the eval path gates identically. `extractGates(jd, title)` / `prescreenRole({…,
  title})` gain an optional title (additive — `ENGINE_VERSION` unchanged).
- **+4 tests** including a NEGATIVE (a real accountant still passes a plain accountant role — no
  over-gating) and "transferable cannot bypass a required CPA".

App (`apps/jobdar`):
- Mirrors the same hard gate in `src/engine.ts` (prescreen + the evaluate clamp).
- **Seeds real jobs**: `SAMPLE_JOBS` is now **20 real public postings** (from the validated salary corpus —
  Relativity, Enova, Sprout Social, 84.51°, Carvana, Censys… spanning finance / IT / engineering / data /
  sales / marketing, entry→senior) **+ one CPA-required role**, replacing the handful of fakes. Live scan
  via the proxy remains the 9.1/9.2 path.

## [1.30.0] — 2026-06-15

**Phase 9.0 — engine decoupled (extraction foundation) + native dev-build setup.**

Engine (CLI behavior-neutral — `test-all.mjs` green, 111):
- The scoring path is now **config-free**. Band thresholds extracted to a new pure
  [`lib/bands.mjs`](lib/bands.mjs); [`lib/inference.mjs`](lib/inference.mjs) no longer imports `config.mjs`
  (the API key reads from env; `bin/jobdar` seeds it from the gitignored `data/credentials.env` at startup
  so `jobdar init`'s saved key still works); `eval_engine` imports `band`/`BANDS` from `bands.mjs`;
  `evaluations.mjs` re-exports them for back-compat. Result: `eval_engine` / `prescreen` / `salary` /
  `dates` / `tailor` / `inference` import **zero** config — the whole scoring closure is now
  **browser-bundle-ready**. This is the unblock for the apps to run the *real* engine; the remaining wiring
  needs the pnpm-workspace packaging (Metro blocks relative-escape imports), so the app currently mirrors
  the engine contracts 1:1 (identical band thresholds + rubric keys/weights).

App (`apps/jobdar`):
- **Native development build** configured: `expo-dev-client` + `eas.json` (development /
  development-simulator / preview / production profiles) + iOS/Android bundle id `com.jobdar.app`. Build on
  a real iPhone via EAS (cloud, no local Xcode) — guide in [`apps/README.md`](apps/README.md); works around
  the Expo Go SDK mismatch. Web output switched to a client-rendered SPA (`single`) — right for a PWA.

`ENGINE_VERSION` unchanged (1.0 — verb signatures/shapes unchanged; internal refactor only).

## [1.29.1] — 2026-06-15

**Phase 9 app — UX (increment 1 follow-up).** App-only; CLI unchanged (`test-all.mjs` green, 111).

- `apps/jobdar`: NEW **Upload résumé** button (`expo-document-picker`) — reads `.txt`/`.md` résumés on web
  and loads them into the pipeline. PDF/DOCX (binary) files are detected and the user is told the
  deterministic parse (unpdf/mammoth) arrives in Milestone 9.2 — paste text or use a `.txt` for now.
- **Load a sample** now **cycles through 5 distinct personas** (data / marketing / customer-success /
  finance / IT) on each click — so you can see how scoring shifts across backgrounds.
- Loading a new résumé (upload or sample) **clears stale scores**; the loaded persona's name is shown. The
  job set grew to 6 (added a Junior Accountant role) for more variety across personas.

## [1.29.0] — 2026-06-15

**Phase 9 — apps, increment 1.** The web + mobile app surfaces enter the repo. (CLI code unchanged; this
minor marks Phase 9 execution starting.)

- New **`apps/jobdar`** — an Expo (React Native + react-native-web) three-tab app (**Search → Apply →
  Follow-up**), one codebase for web PWA + native iOS/Android. Runs on Mac (`pnpm web`) and iPhone
  (`pnpm start` → Expo Go). Increment 1 uses a faithful TypeScript port of the **deterministic contracts** —
  band thresholds (Apply ≥4.0 / Research ≥3.5), the decomposed-rubric weights, prescreen gates, cadence
  rules, grounded tailoring — over **bundled sample data**, so the whole UX is clickable with no model and
  no network. EN/ES toggle, dark UI. Compiles + exports cleanly (`expo export -p web`).
- New **`apps/server`** — the PII-free scanner-proxy (Phase 9.1, local form): a zero-dependency Node
  service reusing `providers/*.mjs` **unchanged**; `GET /health` lists the live providers, `POST /fetch-jd`
  + `POST /scan` carry **no résumé/score field** (privacy by structure). Deploys to Fly/Render in prod.
- Run guide: [`apps/README.md`](apps/README.md); architecture: [`docs/phase9-architecture.md`](docs/phase9-architecture.md).
- **Remaining (next milestones):** the `@jobdar/engine` fs-extraction so the apps share the *real* engine
  (9.0), WebLLM/WebGPU + `llama.rn` on-device inference (9.3/9.4), live scan wiring + résumé upload→parse,
  EAS native builds + push (9.5). CLI `test-all.mjs` still green (111).

## [1.28.2] — 2026-06-15

**Docs (Phase 9 plan):** persist the finalized web + mobile app build plan as the canonical spec — no code change.

- New [`docs/phase9-architecture.md`](docs/phase9-architecture.md): the full Phase 9 architecture — one
  shared `@jobdar/engine` package (CLI + apps), one **Expo** codebase (React Native + react-native-web → web
  PWA + native iOS/Android), the PII-free scanner as an **always-on Node service (Fly/Render)**, the additive
  `kind:'local-embedded'` inference backend (WebLLM/WebGPU on web, `llama.rn`/MLC on native) that resolves
  the loopback-URL guard, the three-tab UX mapped 1:1 to engine verbs, the `Store`/`DocExtract` ports, and
  the 9.0→9.7 milestone ladder + verification gates. Privacy stays structural: the résumé and every score
  never leave the device; the proxy's request schema has no résumé field.
- [`ROADMAP.md`](ROADMAP.md) Phase 9 updated to the finalized ladder (replaces the older Capacitor/PWA-first
  sketch) and points at the spec. Decisions locked with Sam: **web + native together** in v1, **always-on
  Fly/Render** host, **per-platform quant** (accuracy measured per surface), native runtime → `llama.rn`
  (confirmed in the 9.0 spike). Engine extraction (the gating task) is **Milestone 9.0**.

Docs-only; 111 tests green. **Phase 9 execution awaiting go.**

## [1.28.1] — 2026-06-15

**Fix (tailor/outreach — placeholder sign-off):** `jobdar tailor` could emit a cover letter that signed off
with the literal `[name]` placeholder instead of the candidate's name (observed live 2026-06-15:
`"Sincerely,\n[name]"`). Root cause: the résumé is run through `stripPII` for eval fairness, which replaces
the candidate's name with the sentinel token `[name]`, so a small model copies that token into the sign-off
rather than inventing a name. This was a send-blocking UX bug, **not** a groundedness failure.

- **New pure helper `fillSignature(text, name)`** ([`lib/tailor.mjs`](lib/tailor.mjs)) deterministically
  restores the candidate's name into any leftover `[name]`-style placeholder (the stripPII sentinel + the
  `[Your Name]`/`[Full Name]`/`[Candidate's Name]` variants small models emit). For **tailoring** the
  candidate's own name is not a fairness concern (unlike eval scoring), so supplying it is safe.
- **`tailorRole`** now fills the sign-off before returning, so the engine seam (`engineTailor`) yields a
  clean cover letter for **every** caller (CLI + the Phase 9 web/mobile apps) — not just the CLI command.
- **`draftOutreach`** applies the same fill before `lintDraft`, so a slipped sender signature isn't
  false-flagged as a placeholder; the recipient name and company/role come from the prompt, so any leftover
  `[name]` is the sender's. `lintDraft` still catches `[company]`/`[role]` and a missing recipient name.
- One new offline test (111 total, 0 fail/skip).

## [1.28.0] — 2026-06-15

**Feature (Phase 8f.2 — model-drafted outreach):** `jobdar outreach --draft` generates a **grounded,
steerable** networking note via the same engine as `tailor`, completing Phase 8f. Outreach previously had
no model draft — only people-finder links, a `lintDraft` validator, and the AI-CLI brain prompt.

- **`jobdar outreach --draft <company|url|--jd file> --person "Name" [--channel linkedin|email]`** — a new
  grounded `draftOutreach` engine verb ([`lib/outreach.mjs`](lib/outreach.mjs)) mirrors `tailorRole`:
  guaranteed-JSON on capable local backends, ONE real fit reason drawn from the résumé + ONE low-pressure
  ask, addresses the recipient by first name, at `temperature: 0`.
- **`--instruct "<directive>"`** steers it (warmer/casual/shorter), layered per role like `tailor`; writes
  versioned `…-outreach-vN.md`; idempotent (unchanged résumé + JD + directives + recipient/channel = a
  no-op). Directives + variant persist under the `outreach` artifact in `data/customize.yml`.
- **Gated through the existing `lintDraft`** — one firmer retry on a length/placeholder/missing-name
  failure, and any remaining problems are surfaced (never a silent "looks good"). Cadence (`canContact`)
  **warns** when the role's contact cap is used but never blocks: **drafting ≠ sending**, so `--draft`
  never touches the cadence ledger (you still send it yourself and `jobdar outreach --log`).
- `contentHash` gains an optional `extra` arg (folds recipient + channel into the outreach hash; tailor
  hashes unchanged). `draftOutreach` is exported on the engine contract (additive — engine stays 1.0).
- **Tests:** +2 (grounded prompt + JSON message + lint gate via a mock backend; `contentHash` extra
  distinguishes recipient/channel). **110 passing, 0 failing.** Verified end-to-end against a mock backend
  (draft → no-op re-run → `--instruct` new variant); a live-model groundedness check is pending a backend.

_Phase 8f complete (8f.1 + 8f.2). Next: Phase 9 (the three-tab app) over the 8e engine + these verbs._

## [1.27.0] — 2026-06-14

**Feature (Phase 8f.1 — steerable customization):** `jobdar tailor` is now **re-runnable and steerable
with natural-language directives**, at low temperature so re-running is deterministic.

- **`--instruct "<directive>"`** — shape tone, emphasis, length, or structure ("warmer," "one paragraph
  shorter," "lead with my data work"). Directives **accumulate per role** and each run **re-derives from
  the résumé + JD + the full directive stack** — the draft is never fed back, so grounding can't erode.
- **Grounded by construction.** Directives are appended *after* the grounding rules with a fixed clause:
  they may only shape the writing, never add employers/titles/dates/degrees/skills/metrics absent from the
  résumé (`directiveBlock` in [`lib/tailor.mjs`](lib/tailor.mjs)).
- **Low temperature.** The tailor path now pins `temperature: 0` across **all** backends — Jobdar
  previously sent no sampling param, so ollama/llamafile/API ran at provider defaults. New `temperature`
  passthrough in `callMessages`/`callOpenAI` ([`lib/inference.mjs`](lib/inference.mjs)); normal eval/agent
  calls are unchanged.
- **Versioned variants + idempotency.** Each meaningfully-changed run writes `…-cv-vN.md` /
  `…-cover-letter-vN.md`; an unchanged `(résumé + JD + directives)` hash is a **no-op** (prints "no change
  — vN is current"), so a re-run only produces a new variant when you actually steer it. Directives + the
  latest variant persist per role/artifact in the gitignored `data/customize.yml` (new
  [`lib/customize_store.mjs`](lib/customize_store.mjs), crash-safe via `atomicWrite`).
- **New flags:** `--instruct`, `--list` (show stored directives + current variant), `--reset` (clear and
  start clean), `--revise` (re-emit the current variant). No flags ⇒ today's behavior — **backward
  compatible** (directives `[]`, v1). EN/ES strings at parity; engine `tailor` gains an optional
  `directives` param (additive — engine contract stays 1.0).
- **Tests:** +3 (directive layering / deterministic hash / per-artifact variant bump; grounding stays
  authoritative over directives in the assembled prompt; the low-temp path forwards `temperature` into
  both request bodies). **108 passing, 0 failing.** Verified end-to-end against a mock backend (layer →
  no-op re-run → new variant → `--list`); a live-model adversarial-groundedness check is pending a
  running backend.

_Next: Phase 8f.2 (`1.28.0`) — a grounded `draftOutreach` verb behind `jobdar outreach --draft`._

## [1.26.2] — 2026-06-14

**Fix (durability + robustness):** make every persistent write crash-safe and stop a malformed
`profile.yml` from taking down the CLI.

- **Atomic writes.** New `atomicWrite(file, data, opts)` in [`lib/config.mjs`](lib/config.mjs) renders to a
  sibling `<file>.<pid>.tmp` and `rename`s it over the target, so a crash mid-write leaves the previous
  file intact (worst case, an orphan `.tmp`) instead of truncating it. Every store/config writer now uses
  it: the pipeline store ([`lib/evaluations.mjs`](lib/evaluations.mjs)), the outreach ledger
  ([`lib/outreach.mjs`](lib/outreach.mjs)), and the `profile.yml` / `portals.yml` / `cv.md` /
  `credentials.env` writers in [`init`](lib/commands/init.mjs), [`import`](lib/commands/import.mjs),
  [`seed`](lib/commands/seed.mjs), and [`resume`](lib/resume.mjs). The pid in the temp name keeps
  concurrent sessions (this repo is shared) from clobbering each other's temp file. Regenerable render
  outputs (`pdf`, `tailor`) are left as-is by design.
- **Friendly invalid-YAML error.** `readYaml` ([`lib/config.mjs`](lib/config.mjs)) now wraps `yaml.load`
  and throws a `userFacing` error (`<file> is not valid YAML — <reason>. … re-run \`jobdar init\``); the
  top-level handler in [`bin/jobdar`](bin/jobdar) prints `userFacing` messages as a clean one-liner
  instead of a raw `YAMLException` stack trace. Previously a single typo in `profile.yml` crashed every
  command with a stack trace.
- **Tests:** +2 (`atomicWrite` overwrites in place / leaves no orphan `.tmp`; a malformed `profile.yml`
  raises a clean `userFacing` error, not a `YAMLException`). **105 passing, 0 failing.**

No behavior change to the data plane — `import`/`scan`/`prescreen`/`eval` remain idempotent (upsert by
stable URL key through the alias map); this hardens *how* the bytes hit disk.

## [1.26.1] — 2026-06-14

**Docs:** an adversarial cross-repo doc audit found the Getting Started guides still omitted the new
`jobdar tailor` command (shipped 1.26.0). Step 7 of [`docs/getting-started.md`](docs/getting-started.md)
and [`.es.md`](docs/getting-started.es.md) now cover `jobdar tailor` (AI summary + cover letter) → `jobdar
pdf` (render), EN/ES at parity. Everything else (version lockstep, engine/eval/tailor docs, READMEs,
CHANGELOG, ROADMAP, and winc-jobdar docs) audited current.

## [1.26.0] — 2026-06-14

**Apply-stage tailoring + web-app-readiness tweaks.** Found while driving the full 3-stage stack on a new
grad's résumé across all three local tiers: the CV/cover-letter tailoring had no driver, imported `cv.md`
rendered flat, and the 4B sometimes truncated its cover letter. All three fixed.

### Added
- **`tailor` engine verb + `jobdar tailor` command** — the Apply-stage "Customize" model step (previously
  only an AI-CLI prompt with no driver). Produces a grounded, role-targeted CV summary + a complete cover
  letter + truthful keywords via the guaranteed-JSON path, so even the 2B stays GROUNDED (selects/
  summarizes from the résumé — never fabricates; verified 0 fabrications across 2b/e2b/4b). Returns
  `tailoredCv` (summary led in). `lib/tailor.mjs`; engine verb in `docs/engine.md`; i18n EN+ES.
- **Cover-letter completeness guard** — `coverIsComplete` + one firmer retry when a model returns a
  truncated letter (the 4B was stopping early at ~96 words / no sign-off); flags `coverComplete:false` if
  still short rather than shipping a stub.

### Changed
- **`import` now lightly markdown-structures `cv.md`** (`structureCv`: name → `#`, recognized sections →
  `##`, bullets → `-`) — deterministic, no model rewrite, no words changed. Fixes flat rendering and lets
  the tailored summary lead the CV instead of landing at the bottom.

### Tests
- New offline assertions for `structureCv`, `coverIsComplete`, `assembleTailoredCv`, and the tailor
  schema/verb export (103 tests, all green). EN/ES i18n parity maintained.

## [1.25.0] — 2026-06-14

**Guaranteed-JSON evals on local backends** — the Jobdar half of the low-end tuning win (pairs with
winc `1.21.4-jobdar.4`'s greedy eval profile).

### Changed
- Local eval backends (winc / ollama / llamafile — `active.jsonEval`) now run evals through the
  **guaranteed-JSON endpoint** (`response_format=json_schema` on `/v1/chat/completions`) **by default**,
  eliminating parse failures. `callBackend` routes any `responseFormat` call to `callOpenAI` (so winc's
  Messages-protocol backend still reaches its JSON endpoint); `evalRole` auto-selects it with a graceful
  fallback to `/v1/messages` on error. The Anthropic api stays on Messages (no `/v1/chat/completions`).
  Opt out with `eval_grammar: false`. Centralized in `evalRole`, so the CLI, `jobdar serve`, and the
  engine contract all benefit. No engine-contract signature change (`ENGINE_VERSION` stays 1.0).
- New `eval_grammar` profile default (`true`); `active.jsonEval` capability on backends.

### Verified on-device (end-to-end through Jobdar's real pipeline, N=3)
With winc's greedy eval profile, **qwen3.5-2b-Q4: 100% / 0 parse-fails / 0 dangerous** (24 evals, was
65% / 4-fails) — at **half the e2b footprint** (1.6 vs 3.1 GiB); **e2b + 4B held 100% / 0-fails** (no
regression); greedy confirmed (`--temp 0 --top-k 1`) on the server. **Caveat (per adversarial review):**
this is one 8-JD set (24 evals) — promising, not production-proof. Before making the 2B-Q4 the eval floor,
validate on a larger diverse JD set + human spot-check + a temp>0 comparison (see
[`docs/eval-tuning-research.md`](docs/eval-tuning-research.md) §6).

### Added
- New offline assertions in the existing inference tests (101 tests, all green): `jsonEval` capability
  (local true / api false), `callBackend` routes `responseFormat` to `/v1/chat/completions` even on a
  Messages backend, and the `eval_grammar` default.

## [1.24.4] — 2026-06-14

**Docs:** persist the full nano-model benchmark + the low-end tuning study. No code change.

### Documentation
- [`docs/eval-tuning-research.md`](docs/eval-tuning-research.md) §6: the 6-model nano sweep
  (disk / resident footprint / accuracy / parse-fail / dangerous-accepts / speed) and the
  **low-end tuning study** — `temp-0 + guaranteed-JSON` takes qwen3.5-2b-Q4 to a stable
  **100% / 0 parse-fails / 0 dangerous** at **half the e2b footprint** (1.6 vs 3.1 GiB), which
  would drop the trustworthy-eval floor to a 2 GB-class machine. Records that neither lever works
  alone and that shipping needs a coordinated winc temp-0 pin + Jobdar JSON-schema routing.
- (winc side, separately: `winc-jobdar` 1.21.4-jobdar.3 corrected two stale eval-picker claims —
  e2b is not "half the VRAM" of the 4B, and 2B-Q8 is not less accurate than Q4.)

## [1.24.3] — 2026-06-14

**Low-end verification:** confirmed the transferable toggle stays consistent on the lowest-tier default
model. No code change — a verification pass + the resulting doc note.

### Verified on-device — `gemma4-e2b` (Gemma Effective-2B, the nano tier)
Doubled JD set (12 roles × OFF/ON × N = 5 = **120 evals** on the 2B). The toggle is directionally
correct at the very low end:
- **Direct fits** — neutral, 3/3 stay in-band (meanΔ +0.06).
- **Clean-gate adjacent** — lift-or-hold, **5/5 reach Research/Apply when ON** (meanΔ +0.12). The 1.24.1
  anti-inversion fix holds on 2B — no demotion of strong adjacent fits.
- **Years-clamped adjacent** — 2/2 not demoted (the transferable-aware clamp works on 2B).
- **Stretches** — **10/10 ON runs stayed Don't** (no inflation; meanΔ −0.52, more decisive refusal).

Two low-end caveats (now documented in [`docs/eval-tuning-research.md`](docs/eval-tuning-research.md)):
a **~1.7% parse-failure rate** (2/120 — the 2B occasionally emits invalid JSON; the pipeline drops that
run via `ok:false`, never recording a wrong score), and the 2B runs **slightly more generous** + noisy
near band edges, so the same N ≥ 5 averaging applies. Net: e2b is a viable lowest default for the toggle;
production should retry/skip on a parse miss and prefer a ≥ 4B backend where accuracy matters.

## [1.24.2] — 2026-06-14

**Docs:** bring the whole doc set in line with the transferable-skills toggle (1.24.0/1.24.1) — no code change.

### Documentation
- **Engine contract** (`docs/engine.md`): documented the additive `transferable?` param on `evaluate`,
  `preConfirm`, and the `POST /evaluate` body (no `ENGINE_VERSION` bump — backward-compatible).
- **README** (EN + ES): added a "Transferable-skills toggle" feature bullet.
- **Getting Started** (EN + ES): added a "switching fields / fresh out of school?" note under *Evaluate*.
- **Eval-tuning research** (`docs/eval-tuning-research.md`): dated banner correcting the as-shipped bands
  (Apply ≥ 4.0 · Research ≥ 3.5 · Don't < 3.5) and verdict schema, plus the two on-device findings —
  transferable mode and the **measured ~±1-pt 4B variance** (judge transferable behavior on the mean of
  N ≥ 5 runs; treat sample-ensembling as load-bearing on a 4B local backend).
- **AGENTS.md**: noted `transferable_skills` in the profile read; refreshed a stale "Next up: Phase 8c"
  status line (8a/8b/8c/8d/8e all shipped → next is Phase 9).
- `modes/_shared.md` (EN + ES) wording was aligned with the 1.24.1 credit-forward rubric in that release.

## [1.24.1] — 2026-06-14

**Make the transferable toggle actually deliver** — two fixes found by an on-device, multi-run audit of
1.24.0. The toggle steered the prompts but its effect was being erased downstream, and on the strongest
adjacent fit it was *lowering* the score. Both are corrected; the bar is unchanged.

### Fixed
- **The clamp is now transferable-aware.** The deterministic clamp (forces Don't on an unmet HARD
  requirement) was the real gatekeeper and ignored the toggle — it floored career-changers to Don't on
  `"X+ years in [field]"` even with strong adjacent experience (it clamped an HR candidate on *his own
  field*). Now, when transferable mode is on, a years-in-field shortfall **no longer drives the clamp**
  (exact parity with how `no_degree` already exempts the degree gate). Genuine hard credentials — an
  active license, certification, or clearance — still gate, even when the note mentions a year count.
  Threaded `transferable` through `clampVerdict` ← `buildVerdict` ← `evalRole` + the batch path.
- **Reworked the eval prompt so it lifts instead of caps.** The 1.24.0 wording (*"a transferable skill
  is at most 'partial'"*) made the local 4B model down-rate legitimately strong bridges — on-device it
  *demoted* a genuine fit (Sam's PM résumé vs an entry BI Analyst role: OFF mean 4.02 → ON 3.36, Δ −0.66
  over 5 runs). The note now rates each skill on the **strength of the bridge** (a clear, evidenced
  adjacent skill earns the same rating a direct one would; no genuine bridge → "none"). Anti-inflation
  intent preserved ("never invent a bridge", "quality over quantity").

### Verified on-device (winc / Qwen3.5-4B, N=5 means)
- Sam/BI Analyst (strong adjacent): OFF 3.82 → **ON 4.06** (+0.24) — the −0.66 demotion is gone.
- Jacob/Customer Success (adjacent): OFF 2.36 → **ON 2.98** (+0.62 lift; 1/5 ON runs promoted to Research).
- Sam/Consumer Insights (genuine non-fit): flat (~−0.04), stays Don't — correctly not forced.
- Stretch guard intact: Data Scientist roles stay firmly Don't ON (0.3–0.8), no inflation.
- **Caveat:** the 4B model is noisy (±~1 pt run-to-run); the *mean* behavior is now correct, but any
  single eval is unreliable near a band edge — a calibration note for the local-AI-default architecture.

### Added
- 1 new offline test (101 total) covering the transferable-aware clamp end-to-end through `buildVerdict`.

## [1.24.0] — 2026-06-14

**Transferable-skills toggle** — strongly-targeted cross-field matching for new grads & career changers.

### Added
- **`transferable_skills` profile toggle** (+ `eval --auto --transferable`; `jobdar init` defaults it ON
  for the `career_changer` / `no_degree` profiles). When on, BOTH AI layers credit transferable/adjacent
  skills that genuinely map to a role — the Search **pre-confirm** (passes real cross-field bridges, still
  skips stretches) and the **eval rubric** (skills/experience sub-judgments cite the résumé item and the
  requirement it bridges). Threaded through `lib/engine.mjs evaluate` + the `jobdar serve /evaluate` body;
  exposed as the Phase 9 Search-tab toggle.
- **It does NOT lower the bar** — it changes WHAT counts as a fit, not how many roles pass: a transferable
  (not direct) skill is at most a partial match, aspirational stretches are still skipped, "quality over
  quantity" is in both prompts. Documented in `modes/_shared.md` (EN + ES).
- 1 new offline test (100 total); EN/ES + modes parity maintained.

### Verified on-device
Jacob's HR résumé vs a Collections Support Specialist role on winc (Qwen3.5-4B): transferable OFF →
2.1 Don't (clamped); ON → 3.3 Don't — the transfer (conflict-resolution, communication) earns a real
score lift, yet it stays below the Research band (selective, not inflated to a false Apply).

## [1.23.0] — 2026-06-14

**Phase 8d (core) — the keyless pay resolver + offer rubric.** The de-skew engine: a role's pay is never
blank and never model-produced.

### Added
- **`lib/pay.mjs` `resolvePay` (8d.2a):** three layers, highest-confidence first — STATED (from the JD) →
  COMPARABLE (median of same-SOC/metro in-scan roles, n ≥ 3) → BLS (wage-cache percentile by seniority:
  entry→p25 / mid→median / senior→p75). Always returns `{ annualMin, annualMax, source, confidence, band,
  label }` with a mandatory source label; never blank. `socForTitle` is the deterministic title→SOC router.
- **National wage seed floor** `data/seed/wages-national.yml` + `data/seed/soc-map.yml` — keeps pay fully
  offline; the model routes SOC + seniority, software owns every number.
- **`modes/offer.md` (8d.3, EN + ES):** the offer rubric — comp-vs-market (cite the source label),
  benefits, growth, entry-level factors → strong/fair/below + negotiation levers + questions; the model
  never invents pay. `resolvePay` is exposed on the engine contract.
- 2 new offline tests (97 → 99). EN/ES + modes parity maintained.

Deferred (Phase 8d remainder): `jobdar offer` interactive capture (8d.1), the live BLS bulk-download
(`lib/bls.mjs`, 8d.2b — the seed floor substitutes offline), and multi-offer `--compare` (8d.4).

## [1.22.0] — 2026-06-14

**Phase 8e — the engine contract — + 8a.9 escalation ladder.** Freezes the headless pipeline behind one
programmatic seam so the CLI, web, and mobile are thin callers — readying Phase 9.

### Added
- **`lib/engine.mjs` (8e.1) — the engine contract:** import → scan → evaluate → track → build as
  no-console-I/O functions (structured returns + `onProgress`). `importDocument`, `scan`, `evaluate`
  (with optional pre-confirm + escalate), `preConfirm`, track verbs (`recordVerdict` / `advanceStatus` /
  `prune`), `buildCv`, backend selection. `jobdar import` is now a thin caller over it (extract, not rewrite).
- **`jobdar serve` (8e.2):** the verbs as JSON over localhost (default `127.0.0.1:4320`; CORS localhost) —
  `GET /health`, `POST /evaluate`, `POST /import`. The one socket the web/mobile front-ends talk to.
- **`docs/engine.md` (8e.3):** the versioned contract — verb signatures + the Job/Verdict/Import shapes;
  `ENGINE_VERSION` bumps on a breaking change. Phase 9 builds against this doc, never internals.
- **Conformance test (8e.4):** a full pipeline (import → evaluate → record → track → build) driven through
  `lib/engine.mjs` only — no CLI — asserting every shape.
- **8a.9 escalation ladder (`eval --auto --escalate`):** re-scores a borderline local verdict on the api
  backend (the accuracy upgrade); `isBorderline` flags near-band, never-clamped verdicts; api-key gated.
- 3 new offline tests (95 → 97). EN/ES parity maintained.

Remaining Phase 8: 8d (offer evaluation + keyless BLS pay resolver) — the offer-stage feature.

## [1.21.0] — 2026-06-14

**Phase 8c — document understanding — + the light AI pre-confirm (the Search-tab queue thinner).**
Verified end-to-end on-device (winc / Qwen3.5-4B) with two real résumés.

### Added
- **`lib/docparse.mjs` (8c.1):** deterministic text extraction — DOCX via the system `unzip`
  (word/document.xml, macOS `textutil` fallback), PDF via `pdftotext` when present (else an honest
  DOCX/text hint), `.txt`/`.md` passthrough; near-empty/image PDFs fail honestly (8c.4). No new npm
  deps; the web/serverless path swaps unpdf/mammoth in behind `extractText()`.
- **`jobdar import <file>` (8c.2):** extract locally → the inference backend structures the PROFILE
  (name / metro / level / skills) → writes `data/cv.md` (the real extracted text — the model NEVER
  rewrites the résumé) + a prefilled `config/profile.yml`; confirm summary, saves on `--write`. Falls
  back to a deterministic heuristic with no backend. `jobdar eval <file.pdf|docx>` (8c.3) reads a local JD too.
- **Light AI pre-confirm (`eval --auto --confirm`):** a cheap on-device yes/maybe/no triage between the
  zero-token `prescreen` and the heavy decomposed `eval` — skips clearly-wrong roles (with a quoted
  reason, never silently) to cut full-eval passes. This is the Phase 9 Search-tab thinner, shared by CLI + app.
- 4 new offline tests (91 → 95). EN/ES parity maintained.

### Verified on-device
Imported `Dotson_Samuel_Project_Manager.docx` and `Jacob_Homer_HR_Resume.docx` on winc — each parsed to a
distinct structured profile. On a Creative & Design Operations Lead role: Sam's PM résumé scored 2.1
(Don't); Jacob's HR résumé was pre-confirm-skipped ("HR vs Ops/Design mismatch") with no wasted eval —
the queue-thinning working as designed. Zero external network on the eval path.

Remaining Phase 8: 8a.9 (escalation, optional), 8d (offer + keyless BLS pay), 8e (engine contract).

## [1.20.0] — 2026-06-14

**Phase 8a — automated evaluation (the daily-use unlock); Phase 8 is now feature-complete (8a + 8b).**
Jobdar scores roles itself: the MODEL judges fit on a decomposed rubric while CODE owns the number and
the gates. Live-verified against `winc serve --eval` (Qwen3.5-4B) — the model returned conformant
decomposed JSON and the §3 pipeline clamped a non-matching role to Don't.

### Added
- **`lib/eval_engine.mjs` — the §3 eval pipeline:** normalizeDates → extract (prescreen) → gate (screen)
  → judge (model, fit-only) → clamp (+merge pay) → verdict. The model rates 5 weighted sub-criteria
  (skills 35 / experience 25 / level-fit 20 / logistics 10 / education 10) strong/partial/none with quoted
  evidence and fills a requirements-check block FIRST (8a.4b) against facts prescreen already extracted;
  CODE computes the 0–5 (`scoreFromJudgments`) and applies the shipped band thresholds (8a.4). A hard gate
  or unmet requirement clamps to Don't — reusing `prescreen` + `levels` (no new `gate.mjs`); the eval JSON
  never contains a salary number — pay is merged post-model from `lib/salary.mjs`. Robust JSON parse with
  optional `response_format` guaranteed-JSON (8a.4a). Fairness (8a.6): the CV slice is PII-stripped and a
  degree requirement never auto-zeros under `no_degree`.
- **`jobdar eval --auto [<url> | --next | --all-pending]` (8a.1–8a.3)** — scores roles against the
  configured backend and records each verdict via the existing `--save` path; walks the prescreen-ranked
  queue, one JD per request; minimal-slice (JD + PII-stripped CV excerpt only).
- **`jobdar calibrate` (8a.5)** — opt-in live scorer over a hand-banded set (`data/calibration.json`),
  reporting per-tier band agreement; every clamp override is logged to a gitignored `data/clamp-log.jsonl`
  (no CV text). The pure agreement/scoring functions are unit-tested; the live scorer is a command, never `npm test`.
- **Batch economics (8a.7) + prompt caching (8a.8):** `eval --auto --all-pending --batch` submits one
  Message Batches job on the api backend (50% price) instead of N live calls; the byte-stable rubric prefix
  is marked `cache_control` on the api path. (`lib/eval_ops.mjs` + `inference.submitBatch`.)
- 19 new offline tests (74 → 93) via loopback mocks — scorer, clamp/gate, pay-merge, no-degree fairness,
  JSON parse, batch wire-format, agreement. Still fully offline; EN/ES parity maintained.

### Fixed
- Hardening from an adversarial review (15 findings triaged): the CV PII-strip no longer eats résumé date
  ranges like `2019-2023` (it matched them as phone numbers, corrupting the experience/level-fit signal);
  `eval --auto <url>` now scores the named URL (the value-less flag had swallowed it into `flags.auto`);
  `clampVerdict`/`buildEvalUser` are null-safe on partial gate objects and `clampVerdict` accepts stringy
  negatives; `parseEvalJson` falls back to a balanced-brace scan past trailing prose; the batch path counts
  JD-fetch failures and attributes the model; `submitBatch` checks every HTTP status; `bandAgreement`
  ignores out-of-tier expected bands; and stale "next: Phase 8a" framing was cleared from AGENTS.md + the
  ROADMAP banner.

Deferred: 8a.9 (targeted escalation ladder) — the roadmap marks it optional; a follow-up. The grammar-JSON
path (8a.4a) is wired but defaults to robust prompt-parse on backends without `response_format` (this
machine's winc.cpp jobdar.3).

## [1.19.0] — 2026-06-13

**Phase 8b — on-device inference via winc.cpp (the new default backend).** The model becomes a swappable
backend: the same evaluation brain runs against a fully local model with no key and no cost. Verified
end-to-end on macOS against a live `winc serve --eval` (Qwen3.5-4B) — `/health` + a real eval round-trip
scoring a canary role, zero external network.

### Added
- **`lib/inference.mjs` — one Messages-API client for both backends.** winc.cpp serves `/v1/messages`
  natively on localhost, so a single tiny client covers local and api (BYO key) — only the base URL and
  auth header differ. `resolveBackend`/`selectActive` resolve `inference: local | api | auto` (auto =
  local when winc is up, else api when a key exists); `backendHealth` probes `GET /health`; `evaluate`
  runs one role and `parseVerdict` reads the modes/eval.md score/band/recommendation; the Messages-API
  `usage` block is captured for per-eval token transparency. Loopback-only for the no-TLS local path;
  HTTPS + key enforced for api.
- **`jobdar backend` command (EN/ES)** — `backend` (status: backend, URL, live-or-not), `backend --check`
  (the verification gate: `/health` + one real eval round-trip, printing score/band/model/tokens), and
  `backend --install` (delegates the model pull + serve to winc; jobdar orchestrates + verifies, and
  prints the exact install path when winc is absent).
- **8b.3 — alternate local runtimes (Ollama / llamafile).** `inference_runtime: winc | ollama | llamafile`
  behind the same interface: winc speaks the Messages API; Ollama/llamafile speak OpenAI chat-completions,
  so a `callOpenAI` shim (with the usage block mapped back to the Messages shape) covers them. Per-runtime
  default URL + liveness path (Ollama has no `/health` → `/api/tags`); new `local_model` field for the
  runtimes that need a model id (winc `--eval` auto-picks). winc stays the documented happy path. 10 new
  offline tests via loopback mock servers (74 → 85 passing, still no network).

### Changed
- **Default backend flipped to `local` (winc.cpp)** in `PROFILE_DEFAULTS` and the `jobdar init` wizard
  (local is now listed first and is the default; api is the opt-in accuracy upgrade) — private, no key,
  no cost out of the box. New `inference_url` profile field (blank → winc default `http://127.0.0.1:8080`).

### Fixed
- Hardening from an adversarial review (21 findings triaged): `parseVerdict` now reads the band from the
  score line's tag only (preamble prose like "don't rule it out…" can't hijack it) and rejects
  off-rubric numbers (a `10`/`50` from a drifting model is unparsed, not a truncated wrong score);
  `resolveBackend` threads the injected env to the API key (true pure function); `callMessages` never
  stringifies an odd content shape to `[object Object]`; the `--check` canary points at `winc serve
  --eval` when a healthy server replies empty (the bare-`winc serve` trap); and stale "Phase 8 / arrives
  in Phase 8" framing was cleared from `init`, `AGENTS.md`, `SECURITY.md`, `docs/legal.md`, and ROADMAP 6.4.

Scope notes: 8b.5 (confidential-cloud) remains future (documented-only); the full
`eval --auto` batch UX is Phase 8a, which reuses this exact client with a different base URL. winc.cpp
itself ships from its own repo (the `winc-jobdar` branch) — these are the Jobdar-side integration pieces.

## [1.18.1] — 2026-06-13

Patch: harden Phase 7.8 against 7 findings from an adversarial multi-agent self-review — all latent at
shipped defaults (none broke the 1.18.0 tests), now covered by new regression assertions.

### Fixed
- **`lib/html.mjs decodeEntities` is single-pass** — no double-decode of `&amp;#x…;` (stays `&#x…;`),
  and capital-`X` hex entities (`&#X2014;`) decode correctly.
- **`lib/dates.mjs normalizeResumeDates` fires only in a true range context** (right after a dash, or a
  4-digit year + connector), so résumé prose like "promoted to present role", "to current standards",
  or "present-day" is no longer rewritten to a date. `monthYear` rejects an out-of-range month (`2026-13`)
  instead of clamping it.
- **`lib/prescreen.mjs blendSalary` floors the blend at 1** — a high `score_weights.salary` can no longer
  push a non-screened, below-target role to score 0 (where 0 means "screened"). The 4.5-honesty
  invariant — pay nudges rank but never screens a role out — now holds at any weight.

## [1.18.0] — 2026-06-13

**Phase 7.8 — deterministic data quality (salary, dates, dedup).** The zero-token cleanup pass before
the Phase 8 inference work: it makes the pipeline's pay, dates, and rows trustworthy without a model.
Validated against a 100-JD corpus fetched live from 17 Greenhouse boards on macOS (committed as the
acceptance set), then adversarially verified — 95% extraction precision after the fixes below.

### Added
- **`lib/salary.mjs` — deterministic STATED-pay extraction (7.8.1, rec-spec §1).** `extractPay(jd)`
  reads pay via five ordered rules (hourly range ×2080, single hourly, annual range with K-suffix +
  20k–600k sanity bound, single annual, location-tiered non-HCOL selection for a Midwest/SE
  candidate); the model never produces a number. `bandVsTarget(pay, target)` scores fit against
  `target_salary` with a **lenient `near` band** — a role whose top pay is within `SALARY_TOLERANCE`
  (5%) under target is caught (not rejected) at a slightly reduced score, ramping linearly to 0 at
  `SALARY_FLOOR` (15%) under. Bands: **above / within / near / below**. Wires the previously-dormant
  `target_salary` + `score_weights.salary`. **Never a gate** — pay only nudges the prescreen rank.
- **`lib/dates.mjs` — résumé date normalization (7.8.2, rec-spec §3a).** `normalizeResumeDates(text,
  today)` resolves an open-ended "Present"/"Current" in a date range to today's month-year (prose
  untouched), so an eval can't misread "Mar 2025 – Present" as future employment. `jobdar eval` now
  prints the current date; `modes/eval.md` instructs the model to use it.
- **Near-duplicate dedup (7.8.3, rec-spec §5).** `mergeScanned` now collapses a second posting of the
  same role (normalized company + title + canonical metro, via the new `regions.mjs canonicalLocation`)
  into an **alias on the survivor** (tracked > evaluated > earliest first-seen) instead of a duplicate
  row; `recordEval`/`recordPrescreen`/`setStatus` resolve an alias URL to its survivor before writing,
  and `prune` keeps a survivor whose alias is still live. New `pay` + `aliases` pipeline columns.
- **Committed salary acceptance corpus** at `test/fixtures/salary-corpus.json` (100 live JDs) + 13 new
  offline tests covering the five rules, leniency, false-positive guards, entity/USD ranges, dedup,
  dates, and `canonicalLocation`. `npm test`: 74 passing, 0 failing, still fully offline.

### Fixed
- **`lib/html.mjs decodeEntities` now decodes `&mdash;`/`&ndash;` (and `&rsquo;`/`&ldquo;`/`&rdquo;`/
  `&hellip;`/`&bull;`/`&deg;`/… + hex `&#x…;`).** Greenhouse encodes salary ranges as
  `$73,125&mdash;$117,000`; leaving the dash entity undecoded made a range parse as its floor only —
  it silently truncated 34% of extractions in testing. The fix helps every JD consumer, not just pay.
- Salary extraction is robust to a `USD`/`US$` suffix between a figure and the separator
  (`$143,000 USD - $177,000 USD`), rejects OTE/on-target-earnings ranges as base pay, rejects bare
  numeric ranges (percentages, year-counts, headcounts), and skips foreign-currency figures.

### Changed
- **`modes/_shared.md` (+ Spanish peer): removed the stale `lib/scoring.mjs` pre-score reference
  (7.8.4)** — that module was already deleted; over-experience screening is the zero-token prescreen
  (`YEARS_CEILING`), and the model does the nuanced read. Documented the new STATED-pay band there and
  in `modes/eval.md`. `target_salary`/`score_weights.salary` are now live (no longer dead config).

## [1.17.1] — 2026-06-13

Roadmap: resolve the two open build-blocking decisions so Phase 7.8/8 implementation starts unblocked.
Planning only — no code.

### Changed
- **Eval bands DECIDED:** the eval verdict uses the **shipped** `lib/evaluations.mjs` `BANDS`
  (Apply ≥ 4.0 / Research ≥ 3.5 / else Don't). The 8a.4 draft's ≥3.5/≥2.0 is dropped; the reconcile
  warning is removed.
- **BLS data source DECIDED — keyless OEWS bulk download, no key, no account.** Verified that the BLS
  v2 API requires per-user registration (not out-of-the-box) and keyless v1 caps at ~10 requests/day,
  while OEWS data is a keyless direct download (XLSX/TXT at `download.bls.gov` / `bls.gov/oes`). So 8d.2
  ships a national-by-SOC seed floor + grows `data/cache/wages.yml` from keyless bulk downloads sliced
  locally; 8d.2b's `lib/bls.mjs` drops all API-key/registration logic; SECURITY.md outbound hosts become
  `download.bls.gov` / `www.bls.gov`. Open Decision #8 resolved; the 8d Risk row narrows to bulk-file
  size/format/cadence.
- **New governing principle — "out of the box with winc":** no feature may require an external account
  or manual key generation to work; prefer the keyless path even at the cost of more code. Operationalized
  by 8b.0 (auto-install), 8b.4 (local inference default), and 8d.2 (keyless wages).

## [1.17.0] — 2026-06-13

Roadmap: reconcile with the updated `rec-spec.md` + winc-jobdar `1.21.3-jobdar.4`. Planning only — no
code. Brings the measured §3 eval-pipeline refinements (a 72-eval A/B/C/D study) and the now-shipped
winc grammar path into the Phase 8 plan so implementation can begin against a flush roadmap.

### Added
- **8a.4a — grammar-constrained structured output:** the eval call uses winc's
  `POST /v1/chat/completions` with `response_format=json_schema` (the 8a.4 schema) for guaranteed valid
  JSON. **Winc side is already shipped** (winc-jobdar 1.21.3-jobdar.4: the eval profile advertises the
  endpoint on ready; the router preserves `response_format` across both paths, regression-tested). Other
  jobdar calls stay on `/v1/messages`.
- **8a.4b — in-band requirements-check (measured win):** the eval schema adds a `required` block
  (`{min_years, certs[], degree, candidate_meets_all}`) filled FIRST; best form passes prescreen's
  quote-backed requirements into the prompt and has the model fill only `candidate_meets_all`. Measured
  +reqcheck: Qwen-4B 4/6→6/6, gemma 2/3→3/3, Qwen-2B 1/3→2/3 gating (~+90 tokens). Few-shot examples
  **rejected** (backfired — leniency + JSON corruption 6/6→4/6).
- **8a.9 — targeted escalation ladder (optional):** run gemma on every role, re-score only borderline/
  negative verdicts on Qwen-4B — recovers the small model's over-strict misses without paying 4B latency
  everywhere.
- **8a.4 cert gate:** extend `lib/prescreen.mjs extractLicense` to promote a stated-**required** cert
  (e.g. "PMP required") from flag → hard gate for users who lack it.

### Changed
- **winc dependency pinned to `1.21.3-jobdar.4`** (was jobdar.3) and the 8b contract note now documents
  **two surfaces** — `/v1/messages` (general) + the guaranteed-JSON `/v1/chat/completions` eval path.
- Milestone-table eval-tuning range widened `8a.4–8a.8` → `8a.4–8a.9`.
- `rec-spec.md` now carries a STATUS header marking it absorbed into the roadmap (roadmap is
  authoritative; the doc remains the measured evidence + the winc-side contract).

## [1.16.0] — 2026-06-13

Roadmap: fold in the 2026-06-13 eval + pay-data study (`rec-spec.md`) and pin the winc dependency to
the `winc-jobdar` branch. Planning only — no code yet; every item is a roadmap step for the phases
below. Verified against the live code + the newest winc-jobdar (`1.21.3-jobdar.3`) by a 7-track
cross-analysis.

### Added
- **NEW Phase 7.8 — Deterministic eval-precision primitives (zero-token, NEXT BUILD, before Phase 8):**
  `lib/salary.mjs` (deterministic pay extraction + `bandVsTarget`; the model never produces a number),
  `lib/dates.mjs` (résumé date normalization — fixes the "Mar 2025–Present read as future" defect),
  near-duplicate dedup in `mergeScanned` (company+title+canonical-location, alias-on-survivor), a
  config/rubric cleanup of the removed-`lib/scoring.mjs` residue, and the Windows test-fixture
  migration. Drawn from the study's measured defects; reuses the shipped prescreen conventions.
- **Phase 8b — new step 8b.0:** `jobdar backend --install` one-command bootstrap (winc setup → tiered
  model pull → `winc serve --eval` → `/health` canary), target fully-featured < 10 min; the Phase 9
  first-run prototype. Plus the cross-repo ask for prebuilt `-jobdar.N` releases.
- **Phase 8d — new sub-steps 8d.2a/8d.2b:** `lib/pay.mjs` three-layer `resolvePay` (stated → comparable
  → BLS, mandatory source label) and `lib/bls.mjs` on-demand fetcher with a national-adjusted fallback;
  the §2c hard split (model routes SOC/seniority, software owns every number).
- **New Open Decision (#8):** BLS API-key model (recommend ship-no-key + national seed floor +
  user-paste on init). **New Risk row:** BLS live-API-vs-annual-bulk + rate-limit + new outbound host.

### Changed
- **Phase 8 reordered earlier still:** Phase 7.8 (zero-token) now precedes the 8b winc build; the
  milestone table renumbers around it.
- **8b dependency pinned to the `winc-jobdar` branch** (`1.21.3-jobdar.3`) + `winc serve --eval`; the
  stale "origin/master v1.4.5 / `winc serve`" note is replaced (master is now v1.21.2, and bare `serve`
  runs reasoning ON → empty content). 8b.2 liveness = `GET /health`; model choice delegated to winc's
  tiering (gemma4-e2b < 5 GiB / qwen3.5-4b ≥ 5 GiB; qwen3.5-2b floor-only). 8b.1 surfaces Messages-API
  `usage` as a per-eval cost; 8b.4 flips `PROFILE_DEFAULTS.inference` `api`→`local` (Open Decision 2).
- **REVISE 8a.4:** lock the eval JSON to exclude `salary_fit` (band merged post-model); the requirement
  gate/clamp **reuses the shipped `lib/prescreen.mjs` extractors — no new `lib/gate.mjs`**; reconcile the
  draft band thresholds (Apply ≥3.5) against the shipped scale (`BANDS`: Apply ≥4.0 / Research ≥3.5).
- **REVISE 8a.5:** add the clamp-override log + per-tier agreement; move the live-backend scorer out of
  `npm test` into an opt-in `jobdar calibrate` (preserves the offline-test invariant).
- **REWRITE 8d.2:** from a static shipped `data/seed/wages.yml` to an on-demand growing
  `data/cache/wages.yml` (+ a small national-by-SOC seed floor); preserve the metro COL index 8d.3/8d.4
  depend on.

## [1.15.0] — 2026-06-12

Phase 7.7 — apply-likelihood. Stop evaluating jobs you were never going to get; start warming up
the ones you might. Built from real beta pain (evals wasted on hard-gated roles).

### Added
- **`jobdar prescreen`** (`lib/prescreen.mjs`, `lib/commands/prescreen.mjs`) — the zero-token gate
  between scan and eval. Fetches each pending role's JD politely (sequential, 800 ms pacing) and:
  - **screens hard gates with a QUOTED reason** — years-required vs your level(s) (entry >2 /
    mid >5 / senior >10; the lowest stated floor counts; "10 years of innovation" never matches),
    an ACTIVE security clearance (TS/SCI etc.), and degree gates (`yes/no/unclear`, with
    "or equivalent experience" downgrading to unclear). Under `no_degree` a degree ask flags a
    stretch and **never** screens (the 4.5 rule); `include_degree_required_roles: false` makes it
    a screen. Soft signals (obtainable clearance, no-sponsorship, license/cert) only flag.
  - **ranks the rest 0–100** by skill overlap (cv.md ∩ JD vocabulary, identical extraction on both
    sides) + posting freshness (`posted`/`first_seen`) + headroom minus soft flags. An unreachable
    JD scores neutral and is never screened.
  - Nothing is hidden silently: screened rows keep `screen_reason` on the pipeline (new
    `prescreen` + `screen_reason` columns; old pipeline files read fine), print with their quoted
    reason, and `eval --next --include-screened` re-admits them.
- **`eval --next` now serves the prescreen-ranked queue** (likelihood desc, then freshness) and
  skips screened + human-tracked rows by default; tells you how many are screened out and why.
- **`jobdar outreach`** (`lib/outreach.mjs`, `lib/commands/outreach.mjs`) — the referral lever,
  polite by construction:
  - **people-finder**: deterministic LinkedIn people-search LINKS (recruiters/TA; likely hiring
    manager via a level-stripped role title; company people). The user browses and picks —
    **Jobdar never scrapes LinkedIn and never sends a message.**
  - **cadence enforced in code**: a gitignored ledger (`data/outreach.tsv` — name/title/channel/
    date only) caps contacts at 2 per role, one thread per person, ONE follow-up ripe after ≥5
    business days (`--due` says when), hard stop after — no override flag exists for the stop.
  - **draft lint** (`--lint <file|->`): rejects >300-char LinkedIn notes, leftover
    `{placeholders}`, and drafts missing the recipient's name. Refusals exit non-zero.
- **modes/outreach.md + modes/es/outreach.md** — full paste-to-personalize flow: the user pastes a
  person's public headline; it feeds ONE draft and is never written to disk (on the winc.cpp
  default backend it never leaves the device at all). Cadence + lint steps spelled out for the
  model; EN/ES parity maintained, 47 new i18n strings per language.
- 11 new tests (62 total): gate extraction, screen decisions, scoring, queue ordering, pipeline
  columns, people-finder links, business-day math, cadence enforcement, draft lint.

### Changed
- **ROADMAP restructured: Phase 8b (winc.cpp on-device inference) is now the NEXT build**, ahead
  of 8a — it's the default backend everywhere and the engine the Phase 9 web + iOS/Android apps
  embed. 8a follows as the opt-in accuracy upgrade and gains two steps: **8a.7** bulk evals via
  the Message Batches API (one role per request — never multi-JD prompts — at 50% price) and
  **8a.8** prompt-caching the byte-stable rubric+CV prefix. New Phase 7.7 section records this
  release.

### Fixed
- `bin/jobdar` now respects a command's `process.exitCode` — refusals (outreach cadence, tracker
  `--set` misuse) previously printed an error but exited 0.

## [1.14.1] — 2026-06-10

Docs: the roadmap now shows at a glance what's shipped — plus the pending portability-test fix.

### Changed
- **ROADMAP completion marks** — every phase now carries an explicit status line (✅ shipped /
  🔶 partial / ⬜ not started), and the two mixed phases mark per step: 0.2 is 🔶 (name locked;
  the trademark/domain/GitHub-org externals stay open — the sole 7.5 blocker), and Phase 7 reads
  7.1–7.4 ✅ / 7.5 🔶 blocked / 7.6 ⬜ ready-to-start. Not-yet-started phases (8a–8e, 9) point at
  their milestone row in the build-order guide. No code changes.

### Fixed
- **Portability test no longer assumes a personal `config/profile.yml` exists** — that file is
  gitignored, so on a fresh clone (and CI) the 1.14.0 test failed even though the code was correct.
  The test now asserts the resolution *rule*: profile present → repo-local home; absent → `~/.jobdar`.

## [1.14.0] — 2026-06-10

Portability: one relocatable user-data home; no path coupling to the install dir.

### Added
- **`JOBDAR_HOME`** — one variable relocates ALL user data (config + data + output). Resolution:
  `JOBDAR_HOME` → repo-local mode (a checkout with its own `config/profile.yml` stays a self-contained,
  movable unit) → **`~/.jobdar`** (the default for global installs, so user data never lives inside
  `node_modules` where an update would wipe it). Per-dir `JOBDAR_CONFIG_DIR`/`JOBDAR_DATA_DIR`/
  `JOBDAR_OUTPUT_DIR` overrides still win. Moving devices = copying one folder — verified end-to-end
  (fresh init → scan → copy home → doctor/tui read everything on the "new device").
- `jobdar doctor` now prints the active user-data home.

### Fixed
- **i18n tables decoupled from the user config dir** — they're a package asset and now always load from
  the install root. Previously, pointing `JOBDAR_CONFIG_DIR` (or running with a fresh home) degraded
  every UI string to its raw key (`cli.usage`). Regression-tested via subprocess.
- `jobdar init` / `jobdar seed --write` create the config dir if missing (first run against a fresh
  `JOBDAR_HOME` / `~/.jobdar` no longer assumes the repo's `config/` exists).
- `jobdar pdf` prints output paths relative to your cwd instead of the install dir.
- Version lockstep: `.claude-plugin/plugin.json` and the doc banners caught up (the 1.13.0 release bumped
  `package.json` only).

### Notes
- Audit found **zero hardcoded absolute paths/usernames** in code or installers; ports are
  flag-overridable. The flaws were all *install-dir coupling*, now removed.

## [1.13.0] — 2026-06-10

The build-order implementation guide: every remaining phase mapped step-by-step, eval-tuning
research in hand, and a slightly faster scan.

### Changed
- **Scan concurrency pool raised 3 → 4** (`scan.mjs`) — one more employer board overlapped per scan;
  per-provider politeness pacing is unchanged.
- **Default inference backend decided: local via winc.cpp, everywhere** (ROADMAP 8b.4; Open Decision 2
  resolved) — private, free, no key. BYO-key API becomes the opt-in accuracy upgrade.

### Added
- **ROADMAP: build-order implementation guide** covering everything unfinished — closed beta (7.6) →
  8a automated eval (+ new 8a.5 calibration set, 8a.6 fairness guards) → 8b winc.cpp-default backend →
  **new Phase 8c** (PDF résumé/JD understanding via deterministic extraction + model structuring),
  **new Phase 8d** (offer evaluation with shipped BLS wage context, `jobdar offer`), **new Phase 8e**
  (the headless engine contract — `lib/engine.mjs` + `jobdar serve` — that the web **and mobile** apps
  plug into) → 7.5 npm publish → Phase 9 (retitled web **and mobile** apps, new step 9.8).
- **Eval-tuning research notes** (`docs/eval-tuning-research.md`) — decomposed rubric design with
  weights and band thresholds, calibration-set practice, fairness guards for the no-degree path,
  offer-evaluation data sources, and the PDF-extraction library survey backing 8c.

## [1.12.1] — 2026-06-09

Privacy hotfix: personal config must never reach git or npm.

### Security
- **`config/profile.yml` and `config/portals.yml` are now gitignored and untracked** (plus any
  `profile.yml.*` backups). The profile carries PII — name, metro, target salary — and the portal list
  reveals your job-search targets; both are created locally by `jobdar init` (from your answers or an
  uploaded résumé) and stay on your machine. The repo ships PII-free **`config/profile.example.yml` /
  `config/portals.example.yml`** templates instead.
- **npm `files` no longer packs `config/` wholesale** — only `config/i18n/` + the two example templates
  ship, so a published tarball can never include a real profile.
- **Git history scrubbed**: all past commits of `config/profile.yml`, `config/portals.yml`, and a tracked
  profile backup were removed from history and the remote was force-updated — previously, real names,
  metros, and a salary target were visible on GitHub.
- Added a privacy regression test (gitignore coverage + npm whitelist + templates present).

## [1.12.0] — 2026-06-09

Phase 5.5 — provider expansion. Six scanner providers, one contract.

### Added
- **Lever provider** (`providers/lever.mjs`) — unauthenticated `api.lever.co` postings list + per-role
  detail (`descriptionPlain`) for eval; detects `jobs.lever.co/{site}` (and `jobs.eu.lever.co`).
  Live-verified: Spotify (147), Zoox (220), Octopus Energy (163), with JD text flowing.
- **Ashby provider** (`providers/ashby.mjs`) — unauthenticated `api.ashbyhq.com/posting-api/job-board/{org}`;
  detects `jobs.ashbyhq.com/{org}`; JD from the board's `descriptionHtml`. Live-verified: Ramp (110, 4.2k-char
  JD), Replo. Covers the small/midsize startup long tail alongside Lever.
- **Generic JSON-LD provider** (`providers/jsonld.mjs`, **explicit opt-in** via `provider: jsonld`) — reads
  schema.org JobPosting/ItemList embedded in any careers page, SSRF-pinned to that page's own host. The
  escape hatch for Phenom/SmashFly-style portals that server-render JSON-LD. (Tested: TriHealth's SmashFly
  listing is JS-only — no SSR JSON-LD — so the big Cincinnati systems still need a dedicated reader; see
  ROADMAP 5.5.5.)

### Notes
- Workday quirk tenants diagnosed: `allina`/`methodisthealthsystem` (HTTP 500) and `hca` (HTTP 422) reject
  the standard CXS POST **even with a browser User-Agent** — not UA-gating; needs deeper request
  replication. Tracked as ROADMAP 5.5.4; those portals fail visibly per-portal in a scan, nothing silent.
- ROADMAP restructured per review: new **Phase 5.5** (this release), **Phase 8 split into 8a** (BYO-key
  automated eval — the key `init` stores finally gets used) **and 8b** (on-device via
  **[winc.cpp](https://github.com/samdotson61/winc.cpp)** as the PRIMARY local backend — its
  `llama-server` speaks the Anthropic Messages API natively on localhost, so 8a's client serves both;
  planning tracks the **GitHub repo**, verified against origin/master v1.4.5); 7.5 marked blocked on
  Step 0.2 only; 7.6 beta can start pre-npm.

## [1.11.0] — 2026-06-09

The TUI becomes a workspace, the tracker becomes real, and the pipeline learns freshness.

### Added
- **TUI scrolling overhaul** — mouse-wheel support (alternate-scroll mode `?1007h`), PgUp/PgDn,
  Home/End, `g`/`G`, a **cursor row** (inverse-video) with **⏎/`o` = open the posting in your browser**
  and **`a` = mark applied**, plus a `from–to of N` position indicator. Scroll/cursor clamp against the
  *filtered* view (no more scrolling into blank space under a band filter).
- **Tracker unified with the pipeline** — `applied` (and any canonical state: interviewing, offer, …) is
  now a pipeline **status**: set it from the TUI (`a`) or `jobdar tracker --set <url> <state>` (ES aliases
  accepted). `jobdar tracker` and the dashboard's tracker card + funnel "Applied" stage read straight from
  the pipeline — the dead never-written `tracker.tsv` is gone, and an eval refresh never demotes a
  human-tracked status.
- **Freshness** — the pipeline persists each role's **`posted`** (board date) and **`first_seen`** (when
  scan found it); `scan --prune` drops stale `scanned` rows that left every board (your evaluated/applied
  rows are never pruned; ignored under `--company` scans where it would over-prune).
- **`jobdar eval --next`** — pops the freshest pending role (posted desc, then first_seen) and prints its
  JD, so the model loop is "next → score → save" with no URL copying.
- **Dashboard**: each pipeline row's role now links to the live posting.

### Changed
- `scan` runs portals through a polite ×3 concurrency pool (per-provider page pacing unchanged) — a
  38-board healthcare scan no longer crawls one employer at a time.
- Pipeline columns: + `posted`, `first_seen` (header-based reads keep old files compatible; the next scan
  rewrites the file in the new shape).

## [1.10.0] — 2026-06-05

Dashboard polish: sortable columns + sector & location breakdowns.

### Added
- **Click-to-sort columns** on the dashboard pipeline table (score · band · role · company · location) —
  a tiny inline vanilla-JS sorter (no libraries), with a ▲/▼ indicator, persisted in `sessionStorage` so
  the sort survives the page's auto-refresh. Score sorts numerically, band by rank, the rest alphabetically.
- **Two analytics charts** — **By sector** (joins pipeline companies to the seed catalog's sector metadata)
  and **By location** (buckets each role's location into state / Remote / Intl / Other). Both stacked by
  band, server-rendered inline SVG like the rest — still no JS libraries, nothing leaves your machine.

### Changed
- `analyze()` / `renderDashboard()` accept the employer `catalog` to power the sector breakdown;
  `runDashboard` passes `loadEmployers()`.

## [1.9.0] — 2026-06-05

`jobdar dashboard` now mirrors the TUI and adds an analytics section with charts.

### Added
- The web dashboard surfaces the **scored pipeline** (TUI parity): every role with its fit score, band,
  role, company, and location; **Apply / Research / Don't / Pending count cards** that double as band
  filters (click → `?band=…`, refresh-safe); pending roles read "pending eval" until the model scores them.
- An **Analytics** section with four server-rendered **inline-SVG charts** — no JS libraries, no CDN,
  nothing leaves your machine: **band distribution**, **score histogram** (0–5), **top companies** stacked
  by band, and a discover → evaluate → apply-tier → applied **funnel** — plus an "X of Y evaluated · avg
  fit Z" summary.

### Changed
- `renderDashboard` now takes `{ pipeline, tracker, view }` (was a single `rows` = tracker). The
  application-tracker and portals cards remain; the page still auto-refreshes and never phones home.

## [1.8.0] — 2026-06-05

Real Midwest & Southern employers via Workday + iCIMS. Greenhouse skews startup/tech, so the regional
economy — especially **healthcare** — was missing. Added 35 live-verified health systems & large employers.

### Added
- **35 live-verified employers** in `data/seed/employers.yml`, on Workday + iCIMS (the ATSs that run
  hospitals, insurers, manufacturers, retail):
  - **Midwest +21** (catalog 17 → 38): Cleveland Clinic, OhioHealth, Nationwide Children's, Bon Secours
    Mercy (Cincinnati), Corewell, Trinity, Advocate, Sanford, Gundersen, ThedaCare, Kettering, Carle, OSU
    Physicians, The Methodist Hospitals, Children's Mercy KC, Ascension WI, Aspire Indiana, Benedictine +
    Nationwide (insurance), Caterpillar (manufacturing), Kohl's (retail).
  - **Southeast (new region coverage) +11**: Vanderbilt UMC, Ochsner, Baptist Health (KY / Jacksonville /
    Montgomery), AdventHealth, Methodist Le Bonheur, Prisma, Piedmont, Bayfront + Lowe's.
  - **Southwest +3**: Cook Children's, USAA, Banner Health.
- Each was verified live **against Jobdar's own Workday/iCIMS providers** (not just curl) and its identity
  confirmed by job location — excluding token traps (e.g. an HCA tenant serving only UK roles, Aurora-NJ
  vs Aurora-WI) and JS-only/empty boards the zero-token path can't read.

### Fixed
- **`jobdar seed` curation filters**: `--sector` is now honored, and `--metro` matches case-insensitively as
  a *contains* (so `--metro Cincinnati` finds "Cincinnati, OH"), with `;` separating multiple metros
  (a metro is itself "City, ST", so the old comma-split was wrong).

### Notes
- These are large employers — a full multi-region scan now fetches a lot. Curate with
  `jobdar seed --region <r> [--sector healthcare] [--metro "Cincinnati"] --write`, or scan one via
  `jobdar scan --company "<name>"`. Some systems run Taleo/Phenom/Oracle (not Workday/iCIMS) and were
  excluded; a couple of iCIMS tenants are JS-only and need `--playwright`.

## [1.7.0] — 2026-06-05

Expanded the Midwest seed catalog with smaller & midsize employers — markets where applicant
competition is lighter (the career-ops "apply local/smaller first" strategy).

### Added
- **12 live-verified Midwest employers** in `data/seed/employers.yml` (catalog goes from 5 → 17):
  **84.51°** (Cincinnati), **Path Robotics** (Columbus), **May Mobility / Censys / Workit Health**
  (Ann Arbor), **Greenlight Guru** (Indianapolis), and **SpotHero / Amount / Sprout Social /
  Civis Analytics / Cameo / Kalderos** (Chicago).
- Each was verified live against the Greenhouse API and its identity confirmed by job location, so token
  collisions (e.g. `relativity` → Relativity **Space** in California) and offshore-only boards (Sezzle,
  Nerdy) were excluded rather than added blind.

### Notes
- `jobdar seed --region midwest --write` materializes all 17 into `config/portals.yml`. A live scan
  discovered **~120** entry/mid Midwest + remote-US roles across them (up from ~48) — much of the new
  volume from less-fierce metros (Columbus, Ann Arbor, Indianapolis).

## [1.6.0] — 2026-06-05

Provider parity: Greenhouse, Workday, and iCIMS now share one contract — uniform discovery + an
eval-time JD fetch — so evaluation works the same regardless of which ATS a role came from.

### Added
- **`fetchJob(url)` on every provider** — pulls one role's full job description for the model's `eval`:
  Greenhouse via the board detail API, Workday via the CXS `…/job{externalPath}` detail endpoint, iCIMS
  via the role page's JSON-LD (in the `?in_iframe=1` view, where the JobPosting actually lives). A new
  `fetchJobDescription(url)` registry helper routes any job URL to the right provider.
- **`jobdar eval <url>` now fetches the JD for you** and prints it, so the model can score it without its
  own fetch tool (and the API / on-device backends in Phase 8 get the JD uniformly). Verified live:
  Greenhouse ~5.5k, Workday (Salesforce) ~7.5k, iCIMS (Covenant Health) ~4.1k chars.

### Changed
- **Discovery is now uniform across all three providers** — `fetch()` returns the same lightweight shape
  (`title · url · company · location · postedOn`, no JD). Greenhouse no longer pulls full descriptions in
  its bulk list (dropped `?content=true`), so scans are lighter; the JD is fetched per-role at eval time.
- `decodeEntities` now also handles `&nbsp;`, so stripped JD text reads cleanly.

### Notes
- iCIMS JD coverage is best-effort (JSON-LD in the iframe view); JS-only tenants still need `--playwright`.
  Workday and Greenhouse JDs come straight from their JSON endpoints.

## [1.5.0] — 2026-06-05

Scan-vs-score split (career-ops architecture): the deterministic tool only **discovers** roles — the
**model** scores them. No score appears anywhere until an actual `eval` has run.

### Changed
- **`scan` no longer scores.** It discovers + filters roles (by level — including the executive drop — and
  region) and writes them to the pipeline as `status: scanned` with **no fit score**. The old
  "Scored N → Apply/Research/Don't" summary is gone; scan now points you to `eval`.
- **`jobdar tui` shows discovered roles as "pending eval"** — no band/score until the model has scored
  them. Evaluated roles show the model's score + Apply/Research/Don't band, color-coded; a new `p` key
  filters to pending. (The web `dashboard` only ever showed the application tracker — unchanged.)
- The eval rubric (`modes/_shared.md` + `modes/eval.md`, EN + ES) now scores on the **0.0–5.0** scale with
  **Apply / Research / Don't** bands (was 0–100 / Strong-Good-Stretch-Skip), matching the pipeline + TUI.

### Added
- **`jobdar eval` is no longer a stub.** Evaluation is model-backed (run it via your AI CLI); the model
  records its verdict with **`jobdar eval --save --url <u> --score <0.0–5.0> [--band …] [--company …]
  [--role …] [--note …]`**, flipping the row to `status: evaluated`. Discovery stays authoritative for
  company/role/location, and a re-scan never clobbers a recorded verdict.
- Pipeline store reshaped to `company · role · url · location · score · band · recommendation · status ·
  updated`, read by header name (tolerant of older files).

### Removed
- The **deterministic fit scorer** (`lib/scoring.mjs`) and its résumé/location/salary/seniority composite.
  Level-fit is still enforced as a **filter** (executive / above-target titles are dropped during `scan`),
  but judging fit is the model's job now. Recoverable from git if a deterministic pre-rank is wanted later.

### Notes
- Delete or re-scan `data/pipeline.tsv` to move to the new shape; `scan` regenerates it.

## [1.4.0] — 2026-06-05

Scoring tuning — surface only the roles your résumé could realistically land. Fixes a case where a
**Vice President, Product** role scored **4.1 (Apply)** under an entry/mid target, and where a broad
résumé matched almost every role equally.

### Added
- **Executive tier in level classification** (`lib/levels.mjs`): VP / SVP / EVP / "Vice President" /
  President / Chief / C-suite / "Head of" / Director / GM / Founder now read as `exec` — always above the
  highest selectable level, so they're filtered out of an entry/mid (or even senior) scan. The old
  `SENIOR` rule only matched the abbreviation `vp`, so a spelled-out "Vice President" slipped through as
  "unclear" and could ride a keyword match into Apply.
- **Level-fit gate in scoring** (`lib/scoring.mjs` → `levelCap`): a role above your top selected level is
  hard-capped into the **Don't** band (one level over → 2.5; two+ → 1.0), so seniority is a real gate —
  not one weighted term a high keyword overlap can outvote.

### Changed
- **Résumé fit now drives the score and actually discriminates.** Greenhouse postings carry the full JD
  through to scoring — the provider requested `?content=true` but was *dropping* `content`, so fit was
  computed on the **title alone** and saturated at 5.0 for every role. The fit score is now
  **title-dominant and de-boilerplated** (generic JD language like "stakeholder / cross-functional /
  strategy" no longer inflates a match), with lenient stem matching so "architect" lines up with
  "architected". Default `score_weights` rebalanced to **résumé 0.7 / location 0.15 / seniority 0.1 /
  salary 0.05** — after the level + region filters run, location and seniority are near-constant, so fit
  should lead the ranking.
- **Unknown salary drops out** of the composite (renormalized) instead of injecting a flat 3.0 that
  inflated every score; the above-target seniority penalty is steeper; an unclear title scores a cautious
  3.0 (was a near-pass 3.5).

### Notes
- The deterministic fit score is a **coarse first-pass filter**, not the final word: it ranks true fits to
  the top (product / data / engineering) and sinks off-domain roles (marketing / legal / sales / finance),
  but a few keyword coincidences can still reach Apply. Run **`jobdar eval <url>`** for the model's
  semantic fit — the real "would this résumé land it?" read (on-device model arrives in Phase 8).
- Re-run `jobdar scan` to re-score your pipeline under the new tuning.

## [1.3.1] — 2026-06-05

### Fixed
- Stale **"Status:" banners** at the tops of `README.md`, `README.es.md`, `AGENTS.md`, `CLAUDE.md`,
  `commands/jobdar.md`, and `.agents/skills/README.md` still read "Phase 0 scaffold" / "Phase 1" — they
  now reflect **Phases 0–7 complete (1.3.x)**. Notably, `commands/jobdar.md` no longer claims the `modes/`
  brain is "skeletons until Phase 1"; it's fully authored (EN + ES). Docs-only — no code change.

## [1.3.0] — 2026-06-05

Résumé build (career-ops "Customize" stage) — completes the pipeline shape: **scan → score → build**.

### Added
- **`jobdar pdf [company]`** — renders your `cv.md` into a clean, **ATS-friendly HTML résumé** (single
  column, standard fonts, semantic headings, no tables/images) under `output/`, tailored/flagged to a
  pipeline role (`--company` / `--url` / positional). Renders to **PDF when Playwright is installed**
  (lazy-imported, opt-in — the heavy dep stays optional); otherwise writes the HTML to print yourself.
- `lib/cv_render.mjs` (zero-dependency markdown → ATS-HTML + role keyword matching). Deep content
  tailoring stays the model's job (the `apply` mode); this stage renders it. `jobdar pdf` is no longer
  a stub.

## [1.2.0] — 2026-06-05

Scan → **score** pipeline (career-ops method): scanned roles are scored 0.0–5.0 and surfaced in the TUI.

### Added
- **Scoring engine** (`lib/scoring.mjs`): a 0.0–5.0 weighted composite from four dimensions — résumé,
  location, salary, seniority — mapped to **Apply (≥4.0) / Research (3.5–3.9) / Don't (<3.5)** bands,
  used as a filter. Location/seniority/salary are deterministic; the résumé dimension is a keyword
  *estimate* (flagged) until a model eval replaces it. Weights are editable in `profile.yml`.
- **Salary** in `jobdar init` + `profile.yml` (`target_salary`, `score_weights`).
- **Scored pipeline store** (`lib/evaluations.mjs` → `data/pipeline.tsv`): one row per job (url · 4
  sub-scores · composite · band · status), deduped by URL, status preserved on re-scan.
- `jobdar scan` now scores every kept role and writes the pipeline, reporting Apply/Research/Don't counts.
- `jobdar tui` now surfaces the scored pipeline: color-coded by band, sort (score / company / band) and
  filters (1/2/3 band · 0 all · c company), with band counts.

### Notes
- Without a `cv.md` and a `target_salary`, those two dimensions read neutral (3.0), so roles cap around
  3.9 (Research) — add them (or run a model eval) to surface Apply-tier roles.

## [1.1.0] — 2026-06-05

### Added
- **`jobdar tui`** — an interactive, zero-dependency terminal dashboard: region/level/language, a
  scrollable application tracker, and the configured portals. Keys: `r` refresh, `q` quit, ↑/↓ scroll.
- The **web dashboard** now lists each portal (company · provider · clickable career link), shows a
  name pill, and auto-refreshes.
- The dashboard link is surfaced everywhere — after `init`/`scan` and in the agent layer (AGENTS.md +
  scan mode): `jobdar tui` or `jobdar dashboard` (http://localhost:4319).

### Fixed
- `jobdar init` no longer skips prompts at a real terminal (stray type-ahead was consumed by the next
  question, blanking the name). Selecting "My own API key" now prompts for the key and stores it in a
  **gitignored** `data/credentials.env` — never in the tracked `profile.yml`.

## [1.0.0] — 2026-06-05

Phase 7 — quality, dashboard, and the 1.0 CLI. **First stable release of the Jobdar CLI.**

### Added
- **`jobdar dashboard`** — a zero-dependency localhost web view (bilingual) of your pipeline: active
  region + level(s) + language, the application tracker, and configured portals. Read-only; never
  phones home.
- **Security policy** (`SECURITY.md`) and a **legal / privacy / responsible-use** page (`docs/legal.md`).
- Security + dashboard tests; CI runs `doctor` + tests + a dry-run scan.

### Security
- Reviewed every provider: per-host SSRF allowlists (Greenhouse / Workday / iCIMS), HTTPS-only,
  `redirect:'error'`, no embedded credentials, per-request timeouts, polite sequential pacing.
  **Zero telemetry** — the only outbound requests are to the public job boards you configure.

### Release notes (EN)
Jobdar 1.0 is a bilingual (English / Español) US job-search CLI for new grads and people entering the
workforce — including no-degree paths. It scans Workday, iCIMS, and Greenhouse employers (live-verified),
filters by your level and region (Midwest by default), tracks applications, and onboards you in minutes
with `jobdar init`. Your résumé stays on your machine.

### Notas de la versión (ES)
Jobdar 1.0 es una CLI bilingüe (inglés / español) de búsqueda de empleo en EE. UU. para recién
graduados y personas que se incorporan al mundo laboral — incluida la vía sin título. Escanea
empleadores de Workday, iCIMS y Greenhouse (verificados en vivo), filtra por tu nivel y región (Medio
Oeste por defecto), registra solicitudes y te configura en minutos con `jobdar init`. Tu currículum se
queda en tu máquina.

### Pending (external)
- npm publish + Claude Code marketplace submission (needs the org from Step 0.2).
- Closed beta (Phase 7.6) with a new grad, a no-degree candidate, a career-changer, and a
  Spanish-preferring user.

## [0.7.0] — 2026-06-05

Phase 6 — effortless install & onboarding. Completes the MVP cut line.

### Added
- **`jobdar init`** — a bilingual interactive setup wizard (`lib/commands/init.mjs` + a zero-dep
  prompt helper that buffers piped input so it's scriptable). Asks language / metro / region / level /
  tuning / inference, then writes `profile.yml` AND materializes `portals.yml` from the region seed
  catalog — no YAML editing. Non-interactive `--defaults`/`--yes` + flag overrides (`--region`,
  `--levels`, `--name`, …) for installers and the agent layer.
- **Zero-config first scan:** after `init`, `jobdar scan` works immediately (seeded portals;
  Playwright/PDF stay optional).
- **One-command install:** `install.sh` (macOS/Linux), `install.ps1` (Windows), and a `.devcontainer/`.
- **Résumé bootstrap** (`lib/resume.mjs`): a pasted/text résumé → `data/cv.md` + prefilled name/metro
  (never invents); PDF/DOCX deferred to the agent layer.
- **Onboard mode** (`modes/onboard.md`, EN + ES) — conversational guided first run.
- **Getting Started** docs (EN + ES) + a troubleshooting page under `docs/`.

### Verified
- The wizard ran end-to-end via scripted input in **both languages** → wrote a valid profile and 5
  seeded Midwest portals, and `jobdar scan` worked immediately. No YAML editing on the non-dev path.

## [0.6.0] — 2026-06-05

Phase 5 — region toggle (Midwest default) + region-aware employer seeds + geo location filtering.

### Added
- `lib/regions.mjs`: US region taxonomy (midwest default; northeast, southeast, southwest, west,
  nationwide, custom) → states + metros, and a deterministic **location filter** that keeps roles in
  the selected region(s) plus remote-US and drops out-of-region / offshore roles (coarse; ambiguous
  locations pass through). `scan` applies it; `scan --regions southwest` overrides per run.
- `data/seed/employers.yml`: a region-tagged employer catalog, **Midwest seeded first** (Enova,
  project44, Hudl, StockX, Jamf — Chicago / Lincoln / Detroit / Minneapolis) plus a partial Southwest
  set — all live-verified to return public postings.
- `jobdar seed [--region <r>] [--metro <m>] [--write]` (`lib/seed.mjs` + `lib/commands/seed.mjs`):
  previews or materializes matching employers into `config/portals.yml` — no hand-editing.
- Region + seed tests covering the gate (Phoenix→AZ, Columbus→OH, offshore blocked, remote-US kept,
  nationwide, midwest↔southwest swap).

### Verified
- Live: `seed --region midwest --write` → scanning the five real Greenhouse boards kept 78 Midwest +
  remote-US roles and filtered out 87 out-of-region/offshore roles. Toggling to `southwest` swaps to
  Carvana / Axon / Self Financial.
- The location filter was checked against **every provider's** real format (Greenhouse, Workday, iCIMS).

### Fixed
- Cross-provider location parsing so region filtering works regardless of which ATS a role came from:
  Workday country-first ("US, Texas, Austin"), Greenhouse bare metros ("Chicago" → IL) plus a broader
  offshore list (e.g. Czechia), and iCIMS `US-{ST}-{City}` — previously empty, so iCIMS roles bypassed
  the region filter; now 50/50 live iCIMS rows resolve a location.

### Changed
- `.gitignore` now ships `data/seed/` while still ignoring runtime `data/`.

## [0.5.0] — 2026-06-05

Phase 4 — level toggle (entry default, mid first-class, senior opt-in) + no-degree tuning.

### Added
- `lib/levels.mjs`: a coarse, deterministic **title pre-filter** derived from `target_levels`.
  Classifies a title (entry / mid / senior / unclear), drops clear out-of-band titles, and passes
  ambiguous titles through to the rubric. `scan` now filters by level and reports what it dropped;
  `scan --levels entry,mid` overrides per run.
- Rubric (modes/_shared.md, EN + ES): level-fit ranking (selected levels rank on merit; only
  above-target leakage is flagged, never hidden), **level archetypes & strategy** (entry/mid/senior,
  incl. skilled-trades/apprentice for no-degree & career-changers), **candidate tuning profiles**
  (new_grad / early_career / no_degree / career_changer), the **no-degree variant** (degree as a soft
  signal; surface "or equivalent experience"; never hide degree-gated roles), and **compensation**
  tuned per level + regional cost of living.
- Eval report now emits `degree_required: yes | no | unclear`; `include_degree_required_roles`
  (default on) keeps degree-gated roles visible (flagged).
- Level tests covering the gate: entry excludes "Senior Engineer" and surfaces "Analyst I",
  `[entry,mid]` admits "Engineer II", `senior` ranks on merit, only above-top is out-of-band.

### Fixed
- **Workday job URLs** were missing the required `/{site}` segment and returned 404. They now build
  `{base}/{site}{externalPath}`. Caught by full live testing and verified against real tenants
  (Intel, Cadence, NVIDIA). `fetch()` also gained an optional `maxPages` bound.

## [0.4.0] — 2026-06-05

Phase 3 — iCIMS provider. Covers the second big US enterprise ATS (health systems, insurers,
manufacturers). iCIMS has no public JSON API, so the default path parses public career pages.

### Added
- `providers/icims.mjs` (`{ id, detect, fetch }`): detects `*.icims.com`, fetches the public
  `/jobs/search` HTML and parses **JobPosting JSON-LD first**, with a DOM job-card fallback that
  parses real iCIMS `iCIMS_JobCardItem` rows (h3 title, query-stripped URLs); paginates via `pr`,
  dedupes by URL, resolves relative URLs, decodes entities.
  SSRF-guarded (`*.icims.com`, HTTPS) and politely paced.
- Opt-in **Playwright** render path for JS-rendered iCIMS widgets (`jobdar scan --playwright` or
  `JOBDAR_PLAYWRIGHT=1`), sequential and lazy-imported so the default install stays light.
- Documented (off-by-default) OAuth2 Job Portal API stub for users with employer credentials.
- `lib/html.mjs` (JSON-LD extraction, entity decode, tag strip) + iCIMS fixture tests.

### Verified
- Live against three real iCIMS hospital tenants (Covenant Health, Prime Healthcare, Northside
  Hospital): 20–50 postings each parsed, normalized, and deduped from server-rendered HTML.

### Notes
- iCIMS is best-effort by nature; coverage varies per employer. In practice the iframe search
  pages are server-rendered HTML (the DOM job-card path handles them, zero-token); JSON-LD tends
  to live on detail pages. Truly JS-rendered tenants need `--playwright` (implemented, not yet
  live-exercised). Location is best-effort and often absent in iCIMS search rows.

## [0.3.0] — 2026-06-05

Phase 2 — Workday provider. Jobdar can now scan the single most common US enterprise ATS,
zero-token, through the public Workday CXS API.

### Added
- `providers/workday.mjs` (`{ id, detect, fetch }`): detects `*.wd{N}.myworkdayjobs.com`, parses
  tenant/shard/site (explicit `site:` wins, else probes common names), POST-paginates
  `/wday/cxs/{tenant}/{site}/jobs`, and normalizes postings to the shared Job shape with absolute
  URLs. SSRF-guarded (HTTPS, host allowlist, `redirect:'error'`) and politely paced between pages.
- `scan --company <name>` filter to scan a single configured employer.
- Workday fixture tests (detect, SSRF host-allowlist rejection, POST pagination + normalize) and
  a documented Workday portal format in `config/portals.yml` (`provider: workday`, `site:`).

### Verified
- Live smoke test against a real public Workday tenant (NVIDIA) returned postings. (A job-URL bug —
  the missing `/{site}` segment — was later caught and fixed via fuller live testing; see Unreleased.)

## [0.2.0] — 2026-06-05

Phase 1 — American-English-first bilingual core. English is canonical; Spanish is a full,
first-class peer; no display strings are hardcoded in code.

### Added
- Authored the agent **brain**: `modes/_shared.md` (rubric, 0–100 scoring bands, level-fit and
  no-degree principles, the rules that never bend) plus `scan`, `eval`, `apply`, `outreach`, and
  `pipeline` modes — in canonical American English.
- **Full Spanish parity** for every base mode under `modes/es/` (natural US Spanish, localized
  output section headers), enforced by a modes-parity test.
- Canonical application **state IDs** in English with Spanish + variant input aliases
  (`lib/states.mjs` + `templates/states.yml`); the tracker now stores IDs and shows localized labels.
- Bilingual docs: `README.es.md` (full parity) + a 🇺🇸/🇲🇽 language switcher on both READMEs.

### Changed
- Bumped to 0.2.0; the AGENTS.md mode table reflects the authored modes.

### Notes
- Generated artifacts (cover letters, outreach, reports) follow the user's `language` via the
  parallel EN/ES mode files. The prose itself is produced by the configured inference backend
  (your AI CLI/API today; the on-device model lands in Phase 8).

## [0.1.0] — 2026-06-05

Phase 0 — Foundation & branding. The repo installs, passes `doctor`, and runs a dry-run
scan; Jobdar-branded throughout; scope locked to EN/ES with a Midwest-default region and an
entry-default level.

### Added
- Two-layer scaffold: a deterministic Node.js layer (`scan.mjs` + `providers/`, `doctor.mjs`,
  tracker) and the Markdown agent brain (`AGENTS.md`, `CLAUDE.md`, `modes/`).
- `jobdar` CLI entrypoint (`bin/jobdar`) with a subcommand router; `scan`, `doctor`, and
  `tracker` implemented; `init`/`eval`/`pipeline`/`pdf`/`dashboard`/`update` are honest stubs
  that name the phase delivering them.
- Greenhouse scanner provider (reference implementation), the `{ id, detect, fetch }`
  provider contract + registry, and an SSRF-guarded HTTP helper (`lib/http.mjs`).
- Bilingual i18n string tables (`config/i18n/{en,es}.yml`) — no hardcoded display strings;
  a test enforces EN/ES key parity.
- Default config: `config/profile.yml` (Midwest region, entry level, English; no PII) and a
  stub `config/portals.yml`; canonical application states in `templates/states.yml`.
- `doctor` treats PDF and Playwright as **optional** (warn, never fail).
- Claude Code plugin manifest (`.claude-plugin/`), the `/jobdar` slash command, and the
  `.agents/skills/` placeholder.
- Repo hygiene: Apache-2.0 `LICENSE` + `NOTICE`, `.gitignore`, a GitHub CI workflow, and
  issue/PR templates. Zero-dependency test runner (`test-all.mjs`).

### Notes
- The GitHub org/repo (`getjobdar/jobdar`) and the npm name are placeholders pending Step 0.2
  (formal trademark search + domain/org grab).
- The plugin manifest should be validated against the current Claude Code plugin spec before
  publishing (Phase 7.5).
