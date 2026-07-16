# Getting started with Jobfaro

[🇺🇸 English](getting-started.md) · [🇲🇽 Español](getting-started.es.md)

Jobfaro finds entry-level US jobs that fit you, keeps your data on your machine, and works in English
or Spanish. Here's the 5-minute path from zero to your first scan.

> **Prefer an app?** The iPhone app — the whole pipeline running privately on your phone — is headed
> to a **TestFlight beta soon**, and will be the easiest way to try Jobfaro. Today, the CLI below is
> the way in.

## 1. Install (one command)

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/samdotson61/jobfaro-app/main/install.sh | bash
```

Every command below also works with the short alias `jf` (e.g. `jf scan` ≡ `jobfaro scan`).
**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/samdotson61/jobfaro-app/main/install.ps1 | iex
```
No installer? You just need [Node.js 20+](https://nodejs.org), then:
```bash
git clone https://github.com/samdotson61/jobfaro-app && cd jobfaro-app && npm install && node bin/jobfaro init
```

**Optional tools** (Jobfaro tells you when a feature needs one — run `node bin/jobfaro doctor`):
- **Résumé import/upload:** `.docx` uses the system `unzip` (already present almost everywhere); **`.pdf`
  needs `pdftotext` from poppler** — `brew install poppler` (macOS) or `apt-get install poppler-utils`
  (Debian/Ubuntu). Without it, a PDF upload returns an honest "couldn't read that file." Scanned/image-only
  PDFs have no embedded text and can't be parsed — export a text PDF or use `.docx`/`.txt`.
- **PDF résumé export** (`jobfaro pdf`) and some JS-rendered iCIMS sites: `npm i playwright`.

## 2. Set up (the wizard)

```bash
node bin/jobfaro init      # or: jobfaro init
```
It asks a few questions — language, your metro, region (Midwest by default), level (entry by default),
and how you want roles evaluated — then writes your config and seeds real employers for your region.
**No file editing.** Press Enter to accept any default.

## 3. Scan

```bash
node bin/jobfaro scan
```
Watch the 📡 radar sweep as boards report in — the tally counts the roles that actually land. You'll
see fresh roles from your region's employers, filtered to your level and area. Add or change
employers any time with `jobfaro seed --region <region> --write`.

### Optional: add USAJobs (federal jobs)

USAJobs is the U.S. government's official jobs site — a large, public, entry-friendly source (many roles
open to the public with clear grade/pay bands). It's **opt-in** and needs a **free** API key:

1. Request a key at <https://developer.usajobs.gov/apirequest/> (instant, free).
2. Put the key and the email you registered it under in `data/credentials.env` (gitignored, never
   committed, never sent anywhere but `data.usajobs.gov`):
   ```
   USAJOBS_API_KEY=your-key-here
   USAJOBS_EMAIL=you@example.com
   ```
3. Add a saved search to `config/portals.yml` — the query string *is* the search:
   ```yaml
   - company: USAJobs
     provider: usajobs
     careers_url: https://data.usajobs.gov/api/search?Keyword=data+analyst&LocationName=Ohio
   ```

Without a key the provider stays dormant, so scans keep working for everyone else.

## 4. Prescreen (skip the jobs you can't get)

```bash
node bin/jobfaro prescreen
```
Zero-token and fast: roles with a hard gate you can't clear (years required, an active security
clearance, a degree you excluded, or — if you set `needs_sponsorship: true` in your profile or flip
the app's "Need visa sponsorship" toggle — a JD that explicitly refuses visa sponsorship) are
screened out **with the JD line quoted as the reason** — never silently — and the rest are ranked
by skill match + freshness so you evaluate the most winnable role first. Roles that explicitly
*offer* sponsorship get a "sponsors visa" note; JDs that don't mention it are left alone (most
don't — Jobfaro never claims a stance the employer didn't state). It also reads the JD's **stated pay** and bands it against your `target_salary`
(above / within / near / below) — shown next to each role; a role that pays slightly under target is
a "near" match, nudged down a little, never screened out.

## 5. Evaluate a role

```bash
node bin/jobfaro eval <job-url>    # or: eval --next for the best pending role
node bin/jobfaro eval --next 10    # auto-score the next 10 (5, 10, 15 … any number up to 50) — radar bar included
```

Every eval — single or batch — ends by telling you **where your jobs report lives** (`data/pipeline.tsv`
in your jobfaro home) and how to view it: `jobfaro tracker` (table), `jobfaro tui` (interactive),
`jobfaro dashboard` (web).

**Where does the model come from?** `eval`, `tailor`, and outreach drafts need one — everything above
runs without any. Two easy paths:

- **Private on-device model (the default):** `node bin/jobfaro backend --install` walks you through the
  free local setup (winc.cpp — no account, no API key, nothing leaves your machine), and
  `node bin/jobfaro backend --check` verifies it end to end. `node bin/jobfaro backend` shows the status
  any time.
- **Your AI CLI:** inside Claude Code (or similar), the same actions are slash commands — `/jobfaro scan`,
  `/jobfaro eval`, and a guided `/jobfaro` onboarding — using that CLI's model, no extra setup.

**Switching fields or fresh out of school?** Turn on transferable-skills matching — `jobfaro init` offers
it (on by default for career-changer / no-degree profiles), or add `--transferable` to any `eval`. It
credits genuine adjacent skills from your résumé toward a role's requirements, and treats an "X+ years in
[field]" ask as something your adjacent experience can bridge rather than a hard wall — without lowering
the bar: strongly-targeted fits, not a flood.

## 6. Reach out (a warm contact beats a cold application)

```bash
node bin/jobfaro outreach <job-url>
node bin/jobfaro outreach --draft <job-url> --person "Alex Kim" --instruct "keep it casual"
```
You get LinkedIn search links for recruiters and likely hiring managers — you browse and pick the
person; Jobfaro never scrapes or sends anything. **`--draft`** writes a grounded starting note for that
person (one real fit reason from your résumé + one ask), steerable with `--instruct` and checked against
the LinkedIn length/placeholder/name rules — review it, then **you** send it. Log what you send (`--log`),
and `--due` tells you when the one polite follow-up is ripe (5+ business days; then the thread closes).

## 7. Tailor & build your résumé

```bash
node bin/jobfaro tailor Enova  # AI: a role-targeted CV summary + cover letter (grounded in your résumé)
node bin/jobfaro tailor Enova --instruct "warmer tone, one paragraph shorter"  # steer it; re-run to refine
node bin/jobfaro pdf Enova     # render an ATS-friendly résumé → output/*.html
```
`jobfaro tailor` uses your local model to write a grounded, role-specific summary + cover letter into
`output/` — it reorders and emphasizes your **real** experience and never invents anything. Add your
résumé first with `jobfaro init --resume <file>`.

**Steer it (`--instruct`).** Pass a directive — `"warmer tone"`, `"lead with my data work"`, `"one
paragraph shorter"` — to shape tone, emphasis, and length (never the facts). Directives **stack** per
role and run at low temperature, so re-running with the same directive reproduces the same letter, and a
new directive writes the next variant (`…-cv-v2.md`). `--list` shows your stored directives, `--reset`
clears them. Then `jobfaro pdf` renders the ATS-friendly HTML; install Playwright (`npm i playwright`) for
an automatic PDF, or open the HTML and Print → Save as PDF.

## Your data stays local

Your résumé and history live on your machine. Jobfaro's scanner only reads **public** job listings — it
never uploads your résumé. See the [README](../README.md) for the full privacy design.

## Stuck?

See [troubleshooting](troubleshooting.md), or run `node bin/jobfaro doctor` to check your setup.
