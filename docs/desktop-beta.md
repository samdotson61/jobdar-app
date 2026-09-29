# Jobdar Desktop — beta tester guide

> One double-clickable app for Mac and Windows: the full Jobdar engine, the same GUI as the phone
> app, **and the local AI runtime**, all running on your machine. You search real employer job boards,
> the local AI scores each role against your résumé, and you answer one question per role — **"Would
> you apply?"** — with a thumbs up or down. At the end you export a **beta report** (a small text file
> with zero personal data) and send it back, so we can see where the evaluator was right and wrong and
> improve it. **No terminal, account, or API key at any step** (since desktop 0.4.0).

## 1. Install the app

Get the build for your machine from the beta invite (maintainers: they're in `apps/desktop/dist-build/`
after `npm run dist:all` — see [RELEASING.md](../RELEASING.md)):

| Your machine | File |
|---|---|
| Mac (Apple Silicon — M1 and later) | `Jobdar-beta-<v>-mac-arm64.zip` |
| Mac (Intel) | `Jobdar-beta-<v>-mac-x64.zip` |
| Windows (typical PC) | `Jobdar-beta-<v>-win-x64.exe` |
| Windows on ARM | `Jobdar-beta-<v>-win-arm64.exe` |

Not sure which Mac you have? Apple menu → **About This Mac**: "Chip: Apple M…" means Apple Silicon.

The beta builds are **not yet signed/notarized**, so the OS asks you once to confirm:

- **Mac (macOS 15 Sequoia and later, incl. macOS 26):** double-click the zip, drag **Jobdar** into
  **Applications**, and double-click it. macOS says *"Apple could not verify 'Jobdar' is free of malware
  that may harm your Mac…"* — click **Done** (not Move to Trash). Open **System Settings → Privacy &
  Security**, scroll to the bottom, click **Open Anyway** next to "Jobdar was blocked…", then **Open
  Anyway** again and enter your password. Jobdar opens, and every later launch is a normal double-click.
  (macOS 14 and older: right-click Jobdar → **Open** → **Open**.) Move it to Applications *before* the
  first open — running it straight out of Downloads works, but macOS runs it from a temporary copy.
- **Windows:** run the `.exe` — it installs for your user account only (no admin needed) and opens
  Jobdar. If SmartScreen appears, click **More info → Run anyway**.

> Builds before 0.4.0 could be refused on a Mac with *"'Jobdar' is damaged and can't be opened"* (their
> app bundle was never sealed with a signature). If you still have one, replace it with 0.4.0 or later.

## 2. Set up the private AI (one click, one time)

The scoring runs on a small AI model **on your own machine** — free, private, no account. On first
launch the app shows **"One more step: set up the private AI"**. Click **Set up the AI (2.7 GB, one
time)**:

- It downloads the model (2.7 GB) and the AI engine, with a real progress bar and time estimate —
  about 5–15 minutes on home Wi-Fi (measured ~2½ minutes on a fast connection). **You can upload your
  résumé and search while it downloads**; only scoring waits for it.
- Keep Jobdar open until it finishes. If the download is interrupted, click **Try again** — it resumes
  where it stopped.
- It needs about **4 GB of free disk space**; the app checks first and tells you if there isn't enough.
- After that, the AI **starts by itself** whenever you open Jobdar (a few seconds) and **stops when you
  quit**, so it never runs in the background.

Everything lives in one folder: `~/.jobdar` (on Windows `C:\Users\<you>\.jobdar`) — your résumé,
roles, and ratings, with the AI in `~/.jobdar/ai`. **To uninstall:** delete the app (Windows: Settings →
Apps → Jobdar) and that folder.

Already run your own winc (`winc serve --eval` on port 8080) or set `inference_url` in
`config/profile.yml`? The app uses that instead and never starts its own.

## 3. The test session (30–60 minutes)

1. **Open Jobdar** → upload your résumé (**PDF or Word** — no extra software needed) or set region +
   level by hand. After an upload the app shows what it detected (name, area, level — and "no college
   degree" if your résumé says so, which makes degree requirements count as a stretch instead of a wall)
   and opens the preferences for you to confirm — your own picks always win, and uploading a *different*
   résumé clears any old fit scores honestly. If the AI is still downloading, the level shows as
   **Entry (the default)** until you change it.
2. **Search tab** → describe what you want (tap one of the examples if you're unsure — the recipe is
   *kind of work + level + where + any must-haves*) → **Find matching roles**. Jobdar scans real employer
   job boards; the AI reads the top results and says which fit, with a reason for each — the ones it
   thinks aren't your lane are one tap away under **Skip**, never hidden.
3. **Apply tab** → **⚡ Score top matches** (or score roles one by one). Each card gets a band — Apply /
   Research / Don't — with a colored edge stripe; tap **"Why this score"** on any card to see the
   evidence per criterion (and the CV-tailoring tools).
4. **The important part:** on every scored role, answer **"Would you apply to this role?"** —
   👍 *I'd apply* or 👎 *Not for me*. Answer honestly from your gut after reading the listing; there are
   no wrong answers — disagreeing with the app is exactly the data we need. Rate as many as you can (10+
   makes the report meaningful).
5. Optional: **Re-check listings** (verifies postings are still up), **Tailor CV + cover letter** on a
   role you liked, and on the **Follow-up** tab type the name of someone at the company, then **Draft a
   note** (Jobdar never sends anything — you review and send it yourself).
6. **📄 Export beta report** (Apply tab) → saves a small `.md` file to your Downloads folder and shows it
   → send that file back to us.

## 4. What the report contains (and doesn't)

It's a plain text file — open it and read it before sending if you like. It has: counts of what was
scanned/scored, the band distribution, your would-apply answers per role (company, role title, link,
score), and how often the evaluator agreed with you. It does **not** contain your résumé, your name, or
anything else personal — only your region/level settings.

## Troubleshooting

| What you see | What to do |
|---|---|
| Mac: *"Apple could not verify 'Jobdar'…"* | Expected once — follow the **Open Anyway** steps in section 1. |
| Mac: *"'Jobdar' is damaged and can't be opened"* | You have a pre-0.4.0 build — get 0.4.0 or later. |
| "Not enough free disk space" | Free up space until at least 4 GB is available, then **Try again**. |
| "The AI couldn't start: …" | Click **Try again**. If it repeats, quit and reopen Jobdar; the engine's log is `~/.jobdar/ai/llama-server.log` — send it with your report. |
| Download stalls or fails | Check your internet connection and click **Try again** — the download resumes. |
| "Scoring paused — the AI isn't ready yet" | The AI is still downloading or starting — watch the progress card above, then score again. |
| Upload says the file couldn't be read | A scanned (image-only) PDF has no text in it — upload a Word file or a text PDF instead. |

## Known beta limits

- **Unsigned builds** (the one-time Open Anyway / SmartScreen step) and the default Electron icon. A
  Developer ID–signed, notarized Mac build needs the Apple Developer account (see RELEASING.md).
- **Windows builds are produced and packaged, but have not yet been run on real Windows hardware** —
  every flow above was verified on macOS (Apple Silicon). Windows-specific parts (the bundled AI's GPU
  choice, the installer) are untested; please report anything odd.
- The AI needs roughly 3–4 GB of free memory while it runs; on an 8 GB machine, close heavy apps.
- Scores judge the listing text against your résumé — the employer itself isn't verified.
- The employer catalog is strongest in the Midwest (the default region); some regions skew toward tech
  and finance employers for now.
