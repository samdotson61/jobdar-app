# Releasing Jobfaro

The CLI ships to npm as the `jobfaro` package (the Expo app in `apps/jobfaro/` is **not** part of the
npm package — it's a separate GUI over `jobfaro serve`). This checklist covers a CLI release.

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

- **npm name / namespace.** `jobfaro` (unscoped) is **available** on the registry as of 2026-07-02
  (`npm view jobfaro` → 404). Options: claim `jobfaro` now, or publish under a scope
  (`@sdotson/jobfaro` / an org scope). Unscoped is the cleaner install (`npm i -g jobfaro`) but is a
  land-grab you can't undo casually. Decide before first publish.
- **Public vs. closed beta.** The repo is already public, but publishing to npm invites `npm i -g`
  installs from strangers. Recommend a **closed beta** first (share the tarball or a scoped prerelease
  `1.0.0-beta.0` with `--tag beta`) so the eval quality and onboarding get real-user feedback before a
  headline 1.0. The feedback loop (`jobfaro calibrate --feedback`) is built precisely to harvest that.
- **License confirmation.** Currently Apache-2.0. Fine to ship; just confirm it's the intended license
  for a public tool that touches employer job data.
- **GitHub home.** Everything (installers, docs, package metadata, the scanner User-Agent) points at
  the real public repo, `samdotson61/jobfaro-app` — so install instructions work today. If you claim a
  branded org for 1.0 (ROADMAP Step 0.2 suggests e.g. `getjobfaro`), transfer the repo (GitHub redirects
  the old URLs) and sweep the references in one pass:
  `grep -rn "samdotson61/jobfaro-app" --include="*.md" --include="*.json" --include="*.mjs" --include="*.sh" --include="*.ps1" .`

## Known non-blockers (documented, shippable as-is)

See `ROADMAP.md` → "Known gaps & current limitations". None block a beta: PDF résumé import needs
`poppler`/`pdftotext` on the host for the CLI/serve (flagged by `jobfaro doctor`; on-device the app asks
for `.docx`/`.txt`), discovery is keyless ATS-probing (aggregators like USAJobs are opt-in BYO-key, not
yet live-verified), the evaluator is bimodal on the small labeled set (the feedback loop is the path to
recalibration once real thumbs accumulate), and the on-device hardware numbers (Metal speed, the in-app
model-download UX) are unexercised until TestFlight. *(Resolved since this list was first written:
first-run onboarding shipped 1.41; app persistence is per-device on both platforms since 1.45/1.47.)*
