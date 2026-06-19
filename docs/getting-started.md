# Getting started with Jobdar

[🇺🇸 English](getting-started.md) · [🇲🇽 Español](getting-started.es.md)

Jobdar finds entry-level US jobs that fit you, keeps your data on your machine, and works in English
or Spanish. Here's the 5-minute path from zero to your first scan.

## 1. Install (one command)

**macOS / Linux**
```bash
curl -fsSL https://raw.githubusercontent.com/getjobdar/jobdar/main/install.sh | bash
```
**Windows (PowerShell)**
```powershell
irm https://raw.githubusercontent.com/getjobdar/jobdar/main/install.ps1 | iex
```
No installer? You just need [Node.js 20+](https://nodejs.org), then:
```bash
git clone https://github.com/getjobdar/jobdar && cd jobdar && npm install && node bin/jobdar init
```

**Optional tools** (Jobdar tells you when a feature needs one — run `node bin/jobdar doctor`):
- **Résumé import/upload:** `.docx` uses the system `unzip` (already present almost everywhere); **`.pdf`
  needs `pdftotext` from poppler** — `brew install poppler` (macOS) or `apt-get install poppler-utils`
  (Debian/Ubuntu). Without it, a PDF upload returns an honest "couldn't read that file." Scanned/image-only
  PDFs have no embedded text and can't be parsed — export a text PDF or use `.docx`/`.txt`.
- **PDF résumé export** (`jobdar pdf`) and some JS-rendered iCIMS sites: `npm i playwright`.

## 2. Set up (the wizard)

```bash
node bin/jobdar init      # or: jobdar init
```
It asks a few questions — language, your metro, region (Midwest by default), level (entry by default),
and how you want roles evaluated — then writes your config and seeds real employers for your region.
**No file editing.** Press Enter to accept any default.

## 3. Scan

```bash
node bin/jobdar scan
```
You'll see fresh roles from your region's employers, filtered to your level and area. Add or change
employers any time with `jobdar seed --region <region> --write`.

## 4. Prescreen (skip the jobs you can't get)

```bash
node bin/jobdar prescreen
```
Zero-token and fast: roles with a hard gate you can't clear (years required, an active security
clearance, a degree you excluded) are screened out **with the JD line quoted as the reason** —
never silently — and the rest are ranked by skill match + freshness so you evaluate the most
winnable role first. It also reads the JD's **stated pay** and bands it against your `target_salary`
(above / within / near / below) — shown next to each role; a role that pays slightly under target is
a "near" match, nudged down a little, never screened out.

## 5. Evaluate a role

```bash
node bin/jobdar eval <job-url>    # or: eval --next for the best pending role
```
Inside an AI CLI (like Claude Code), the same actions are slash commands: `/jobdar scan`,
`/jobdar eval`, and a guided `/jobdar` onboarding.

**Switching fields or fresh out of school?** Turn on transferable-skills matching — `jobdar init` offers
it (on by default for career-changer / no-degree profiles), or add `--transferable` to any `eval`. It
credits genuine adjacent skills from your résumé toward a role's requirements, and treats an "X+ years in
[field]" ask as something your adjacent experience can bridge rather than a hard wall — without lowering
the bar: strongly-targeted fits, not a flood.

## 6. Reach out (a warm contact beats a cold application)

```bash
node bin/jobdar outreach <job-url>
node bin/jobdar outreach --draft <job-url> --person "Alex Kim" --instruct "keep it casual"
```
You get LinkedIn search links for recruiters and likely hiring managers — you browse and pick the
person; Jobdar never scrapes or sends anything. **`--draft`** writes a grounded starting note for that
person (one real fit reason from your résumé + one ask), steerable with `--instruct` and checked against
the LinkedIn length/placeholder/name rules — review it, then **you** send it. Log what you send (`--log`),
and `--due` tells you when the one polite follow-up is ripe (5+ business days; then the thread closes).

## 7. Tailor & build your résumé

```bash
node bin/jobdar tailor Enova  # AI: a role-targeted CV summary + cover letter (grounded in your résumé)
node bin/jobdar tailor Enova --instruct "warmer tone, one paragraph shorter"  # steer it; re-run to refine
node bin/jobdar pdf Enova     # render an ATS-friendly résumé → output/*.html
```
`jobdar tailor` uses your local model to write a grounded, role-specific summary + cover letter into
`output/` — it reorders and emphasizes your **real** experience and never invents anything. Add your
résumé first with `jobdar init --resume <file>`.

**Steer it (`--instruct`).** Pass a directive — `"warmer tone"`, `"lead with my data work"`, `"one
paragraph shorter"` — to shape tone, emphasis, and length (never the facts). Directives **stack** per
role and run at low temperature, so re-running with the same directive reproduces the same letter, and a
new directive writes the next variant (`…-cv-v2.md`). `--list` shows your stored directives, `--reset`
clears them. Then `jobdar pdf` renders the ATS-friendly HTML; install Playwright (`npm i playwright`) for
an automatic PDF, or open the HTML and Print → Save as PDF.

## Your data stays local

Your résumé and history live on your machine. Jobdar's scanner only reads **public** job listings — it
never uploads your résumé. See the [README](../README.md) for the full privacy design.

## Stuck?

See [troubleshooting](troubleshooting.md), or run `node bin/jobdar doctor` to check your setup.
