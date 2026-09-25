# Releasing Jobdar

The CLI ships to npm as the `jobdar` package (the Expo app in `apps/jobdar/` is **not** part of the
npm package — it's a separate GUI over `jobdar serve`). This checklist covers a CLI release.

## Every release — the mechanical checklist

1. **Sync first.** `git fetch origin && git status -sb`. Multiple sessions work this repo; reconcile
   before you cut a release, and never reuse a version origin already published.
2. **Version lockstep.** One bump by size (patch/minor/major) across **all** of:
   - `package.json` + `package-lock.json`
   - `.claude-plugin/plugin.json`
   - `CHANGELOG.md` (new dated entry at top)
   - `ROADMAP.md` line-10 status banner + `README.md` / `README.es.md` / `CLAUDE.md` status lines
   A bump that touches only `package.json` is a bug.
3. **Green tests.** `npm test` must be `0 failed`. `prepublishOnly` also runs it, so a broken suite
   blocks `npm publish` automatically — but check first.
4. **Clean tarball.** `npm pack --dry-run` and confirm:
   - the new files you added are present;
   - **no** personal data — `config/profile.yml`, `data/cv.md`, `data/pipeline.tsv`,
     `data/uploads/*`, `data/credentials.env`, `data/eval_feedback.tsv` must **never** appear
     (all are under `data/*`, which `.gitignore` excludes except `data/seed/`).
5. **Docs current.** Getting-started + troubleshooting reflect any new prerequisites or commands.

## Publishing (maintainer, manual)

```sh
npm login                 # once per machine
npm publish --access public
git tag v$(node -p "require('./package.json').version") && git push --tags
```

Then draft a GitHub release from the tag, pasting the CHANGELOG entry.

## Decisions that are NOT mine to make — flagged for Sam

These gate a real 1.0 and need a human call; the checklist above is ready the moment they're settled:

- **npm name / namespace.** `jobdar` (unscoped) is **available** on the registry as of 2026-09-25 (re-verified at the Jobdar revert)
  (`npm view jobdar` → 404). Options: claim `jobdar` now, or publish under a scope
  (`@sdotson/jobdar` / an org scope). Unscoped is the cleaner install (`npm i -g jobdar`) but is a
  land-grab you can't undo casually. Decide before first publish.
- **Public vs. closed beta.** The repo is already public, but publishing to npm invites `npm i -g`
  installs from strangers. Recommend a **closed beta** first (share the tarball or a scoped prerelease
  `1.0.0-beta.0` with `--tag beta`) so the eval quality and onboarding get real-user feedback before a
  headline 1.0. The feedback loop (`jobdar calibrate --feedback`) is built precisely to harvest that.
- **License confirmation.** Currently Apache-2.0. Fine to ship; just confirm it's the intended license
  for a public tool that touches employer job data.
- **GitHub home.** Everything (installers, docs, package metadata, the scanner User-Agent) points at
  the real public repo, `samdotson61/jobdar-app` — so install instructions work today. If you claim a
  branded org for 1.0 (ROADMAP Step 0.2 suggests e.g. `getjobdar`), transfer the repo (GitHub redirects
  the old URLs) and sweep the references in one pass:
  `grep -rn "samdotson61/jobdar-app" --include="*.md" --include="*.json" --include="*.mjs" --include="*.sh" --include="*.ps1" .`

## TestFlight (the iOS app) — the exact sequence

App-side prep is DONE (bundle `com.jobdar.app`, icons/splash, `ITSAppUsesNonExemptEncryption:false`,
eas.json profiles, Release config verified compiling locally). The four account-bound steps:

```sh
cd apps/jobdar
eas login                       # your Expo account (free)
eas init                        # mints the Jobdar project id (the pre-rename one was removed)
eas build -p ios --profile production   # cloud build; first run walks Apple credentials (paid account)
eas submit -p ios --latest      # uploads to App Store Connect → TestFlight
```

Before `eas submit`: create the app record once in App Store Connect (My Apps → “+” → New App →
name **Jobdar**, bundle ID **com.jobdar.app**, SKU e.g. `jobdar-ios`). Then TestFlight → add
yourself as an internal tester (instant, no review). External testers come later via Beta App Review
(~24–48h) — see `~/Documents/Jobdar-Beta.md` for the phased plan and the review-notes checklist.
First thing on real hardware: open `jobdar://spike` and run the on-device eval for true Metal timings.

## Known non-blockers (documented, shippable as-is)

See `ROADMAP.md` → "Known gaps & current limitations". None block a beta: PDF résumé import needs
`poppler`/`pdftotext` on the host for the CLI/serve (flagged by `jobdar doctor`; on-device the app asks
for `.docx`/`.txt`), discovery is keyless ATS-probing (aggregators like USAJobs are opt-in BYO-key, not
yet live-verified), the evaluator is bimodal on the small labeled set (the feedback loop is the path to
recalibration once real thumbs accumulate), and the on-device hardware numbers (Metal speed, the in-app
model-download UX) are unexercised until TestFlight. *(Resolved since this list was first written:
first-run onboarding shipped 1.41; app persistence is per-device on both platforms since 1.45/1.47.)*

## Desktop beta builds (1.56.0, `apps/desktop/`)

The double-clickable Mac/Windows beta for testers ([docs/desktop-beta.md](docs/desktop-beta.md) is
their guide). Build steps, from a fresh clone:

```bash
cd apps/desktop
node prepare-engine.mjs   # bootstrap: npm-packs the repo root → vendor/jobdar-engine.tgz (STABLE
                          # name — the committed dependency string never changes) + installs all deps
npx electron . --smoke    # dev-tree self-test: engine + GUI + API through one port, with screenshots
npm run dist:all          # clean → vendor → GUI export → all six installers (mac arm64/x64,
                          # win x64/arm64) → prune ALL unpacked bundles (dist-build = distributables
                          # only; any stray Jobdar.app on indexed disk duplicates in Spotlight)
npm run smoke:packed      # smoke the PACKAGED app — unzips the native zip into the temp dir
                          # (Spotlight-invisible), runs --smoke, cleans up
npm run install:mac       # optional: install the canonical /Applications/Jobdar.app for THIS Mac
                          # (registers it with LaunchServices; the one you double-click)
```

Artifacts land in `apps/desktop/dist-build/` (gitignored) — distribute the zips/exe directly for
the beta (unsigned; the tester guide covers the OS warnings). The whole flow is idempotent —
re-running any step converges — and `prepare-engine.mjs` is the one command a fresh clone needs
before anything else (plain `npm install` fails until the gitignored tarball exists). Re-run it
after ANY engine change or version bump — the packed app ships the vendored tarball, not the
working tree. The packed app is launch-anywhere (no baked paths; data home `~/.jobdar`) and
upgrade-safe (stable engine port → stable origin, so onboarding/verdict state survives replacing
the .app). Signing/notarization and a real icon are pre-1.0 items, not beta blockers.
