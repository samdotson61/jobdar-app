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

## 4. Evaluate a role

```bash
node bin/jobdar eval <job-url>
```
Inside an AI CLI (like Claude Code), the same actions are slash commands: `/jobdar scan`,
`/jobdar eval`, and a guided `/jobdar` onboarding.

## 5. Build a tailored résumé

```bash
node bin/jobdar pdf Enova    # tailors your résumé to that role → output/*.html
```
Add your résumé first with `jobdar init --resume <file>`. You get an ATS-friendly HTML résumé in
`output/`; install Playwright (`npm i playwright`) for an automatic PDF, or open the HTML and
Print → Save as PDF.

## Your data stays local

Your résumé and history live on your machine. Jobdar's scanner only reads **public** job listings — it
never uploads your résumé. See the [README](../README.md) for the full privacy design.

## Stuck?

See [troubleshooting](troubleshooting.md), or run `node bin/jobdar doctor` to check your setup.
