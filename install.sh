#!/usr/bin/env bash
# Jobdar one-command installer (macOS / Linux). Usage:  curl -fsSL <url>/install.sh | bash
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

REPO="${JOBDAR_REPO:-https://github.com/samdotson61/jobdar-app.git}"
DIR="${JOBDAR_DIR:-$HOME/jobdar}"

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
echo "Done. Tip: 'npm link' puts the 'jobdar' command on your PATH."
