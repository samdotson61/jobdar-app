#!/usr/bin/env bash
# Jobdar one-command installer (macOS / Linux).
#   curl -fsSL <url>/install.sh | bash                    # installs to ~/jobdar
#   DIR=/path/to/dir bash install.sh                      # or JOBDAR_DIR=… — both override the target
set -euo pipefail

echo "Installing Jobdar…"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js (>= 20) is required. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git is required. Install it and re-run." >&2
  exit 1
fi

# Once Jobdar is on npm (the 1.0 publish), the installer prefers the package: one global install puts
# `jobdar` and `jd` on the PATH, and `jobdar update` keeps it current. Until then — or with
# JOBDAR_FROM_SOURCE=1 — it clones the repo (the path that works today).
if [ -z "${JOBDAR_FROM_SOURCE:-}" ] && npm view jobdar version >/dev/null 2>&1; then
  echo "Installing the jobdar package from npm…"
  if ! npm install -g jobdar; then
    echo "npm install -g failed. If the error was EACCES, see https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally — or run with JOBDAR_FROM_SOURCE=1 to install from a checkout instead." >&2
    exit 1
  fi
  jobdar doctor || true
  if [ -t 0 ]; then jobdar init; else echo "Setup: run  jobdar init"; fi
  echo "Done. Later: 'jobdar update' brings you to the newest version."
  exit 0
fi

REPO="${JOBDAR_REPO:-https://github.com/samdotson61/jobdar-app.git}"
# JOBDAR_DIR wins; plain DIR also works (it's what people naturally try); default ~/jobdar.
DIR="${JOBDAR_DIR:-${DIR:-$HOME/jobdar}}"

if [ -d "$DIR/.git" ]; then
  echo "Updating $DIR…"; git -C "$DIR" pull --ff-only
else
  echo "Cloning into $DIR…"; git clone --depth 1 "$REPO" "$DIR"
fi

cd "$DIR"
npm install --no-audit --no-fund
node doctor.mjs || true

if [ -t 0 ]; then
  node bin/jobdar init
else
  echo "Setup: run  cd \"$DIR\" && node bin/jobdar init"
fi
echo "Done. Tip: 'npm link' puts the 'jobdar' command (and its short alias 'jd') on your PATH;"
echo "      'node bin/jobdar update' (or 'jobdar update' once linked) brings this checkout to the newest version."
