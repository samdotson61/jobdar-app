# Jobdar one-command installer (Windows PowerShell).
#   irm <url>/install.ps1 | iex
$ErrorActionPreference = "Stop"

Write-Host "Installing Jobdar…"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error "Node.js (>= 20) is required. Install it from https://nodejs.org and re-run."
  exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Error "git is required. Install it and re-run."
  exit 1
}

# Once Jobdar is on npm (the 1.0 publish), the installer prefers the package: one global install puts
# `jobdar` and `jd` on the PATH, and `jobdar update` keeps it current. Until then — or with
# JOBDAR_FROM_SOURCE=1 — it clones the repo (the path that works today).
$published = $false
if (-not $env:JOBDAR_FROM_SOURCE) {
  try { $null = npm view jobdar version 2>$null; $published = ($LASTEXITCODE -eq 0) } catch { $published = $false }
}
if ($published) {
  Write-Host "Installing the jobdar package from npm…"
  npm install -g jobdar
  if ($LASTEXITCODE -ne 0) { Write-Error "npm install -g failed. Set JOBDAR_FROM_SOURCE=1 to install from a checkout instead."; exit 1 }
  jobdar doctor
  jobdar init
  Write-Host "Done. Later: 'jobdar update' brings you to the newest version."
  exit 0
}

$Repo = if ($env:JOBDAR_REPO) { $env:JOBDAR_REPO } else { "https://github.com/samdotson61/jobdar-app.git" }
$Dir = if ($env:JOBDAR_DIR) { $env:JOBDAR_DIR } else { Join-Path $HOME "jobdar" }

if (Test-Path (Join-Path $Dir ".git")) {
  Write-Host "Updating $Dir…"; git -C $Dir pull --ff-only
} else {
  Write-Host "Cloning into $Dir…"; git clone --depth 1 $Repo $Dir
}

Set-Location $Dir
npm install --no-audit --no-fund
node doctor.mjs
node bin/jobdar init
Write-Host "Done. Tip: 'npm link' puts the 'jobdar' command on your PATH;"
Write-Host "      'node bin/jobdar update' (or 'jobdar update' once linked) brings this checkout to the newest version."
