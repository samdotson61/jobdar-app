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
Write-Host "Done. Tip: 'npm link' puts the 'jobdar' command on your PATH."
