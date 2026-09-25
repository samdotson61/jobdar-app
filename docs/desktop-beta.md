# Jobdar Desktop — beta tester guide

> One double-clickable app for Mac and Windows: the full Jobdar engine plus the same GUI as the
> phone app, running entirely on your machine. You search real employer job boards, the local AI
> scores each role against your résumé, and you answer one question per role — **"Would you
> apply?"** — with a thumbs up or down. At the end you export a **beta report** (a small text
> file with zero personal data) and send it back, so we can see where the evaluator was right
> and wrong and improve it.

## 1. Install the app

Ask for the build for your machine (they're in the repo's `apps/desktop/dist-build/` after
`npm run dist`, or attached to the beta invite):

| Your machine | File |
|---|---|
| Mac (Apple Silicon — M1 and later) | `Jobdar-beta-<v>-mac-arm64.zip` |
| Mac (Intel) | `Jobdar-beta-<v>-mac-x64.zip` |
| Windows (typical PC) | `Jobdar-beta-<v>-win-x64.exe` |
| Windows on ARM | `Jobdar-beta-<v>-win-arm64.exe` |

The beta builds are **unsigned**, so the OS will warn you once:

- **Mac:** unzip, drag `Jobdar.app` anywhere (Applications is fine), then **right-click → Open →
  Open** the first time (a plain double-click may be blocked).
- **Windows:** run the `.exe`; if SmartScreen appears, click **More info → Run anyway**.

Your data (résumé, found roles, ratings) lives in `~/.jobdar` on your machine and never leaves it.

## 2. Set up the local AI (one time, ~10 minutes mostly download)

The scoring runs on a small AI model **on your own machine** — free, private, no account. It's a
separate one-time install of [winc.cpp](https://github.com/samdotson61/winc.cpp):

- **Mac** (Terminal):

  ```bash
  git clone -b winc-jobdar https://github.com/samdotson61/winc.cpp && cd winc.cpp && ./install.sh
  ```

- **Windows:** the eval profile lives on the `winc-jobdar` branch and is **not in the winc.cpp release
  binaries yet**. Either build the branch from source (Go 1.22+: `git clone -b winc-jobdar
  https://github.com/samdotson61/winc.cpp && cd winc.cpp && go build ./cmd/winc && .\winc setup`), or
  point the app's Settings → backend at a Mac on your network that is running `jobdar serve --host 0.0.0.0`
  (it prints the bearer token to paste). A packaged Windows backend is on the roadmap.

Then start the model (leave this window open while you test):

```bash
winc serve --eval qwen3.5-4b
```

The first run downloads the model (a few GB). If Jobdar shows a "backend down" banner, this step
isn't running yet — start it and the banner clears on its own.

## 3. The test session (30–60 minutes)

1. **Open Jobdar** → upload your résumé (PDF/DOCX) or set region + level by hand. After an upload
   the app shows what it detected (name, area, level) and opens the preferences for you to confirm —
   your own picks always win, and uploading a *different* résumé clears any old fit scores honestly.
2. **Search tab** → describe what you want (tap one of the examples if you're unsure — the recipe is
   *kind of work + level + where + any must-haves*) → *Start searching*. Jobdar scans real employer
   job boards and ranks what it finds.
3. **Apply tab** → **⚡ Score top 10 matches** (or score roles one by one). Each card gets a
   band — Apply / Research / Don't — with a colored edge stripe; tap **"Why this score"** on any
   card to see the evidence per criterion (and the CV-tailoring tools).
4. **The important part:** on every scored role, answer **"Would you apply to this role?"** —
   👍 *I'd apply* or 👎 *Not for me*. Answer honestly from your gut after reading the listing;
   there are no wrong answers — disagreeing with the app is exactly the data we need. Rate as
   many as you can (10+ makes the report meaningful).
5. Optional: try **Re-check listings** (verifies postings are still up) and the tailor/outreach
   drafts on a role you liked.
6. **📄 Export beta report** (Apply tab) → saves a small `.md` file → send that file back to us.

## 4. What the report contains (and doesn't)

It's a plain text file — open it and read it before sending if you like. It has: counts of what
was scanned/scored, the band distribution, your would-apply answers per role (company, role title,
link, score), and how often the evaluator agreed with you. It does **not** contain your résumé,
your name, or anything else personal — only your region/level settings.

## Known beta limits

- The window title says beta and means it: unsigned builds, default Electron icon, and the local
  model setup is still a terminal step (a one-click installer is on the roadmap).
- Scores judge the listing text against your résumé — the employer itself isn't verified.
- If the app opens to an empty Search tab, that's normal on first run — it starts blank until you
  search or upload.
