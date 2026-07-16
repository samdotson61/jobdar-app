#!/usr/bin/env bash
# Jobfaro one-command installer (macOS / Linux). Usage:  curl -fsSL <url>/install.sh | bash
set -euo pipefail

echo "Installing Jobfaro…"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js (>= 20) is required. Install it from https://nodejs.org and re-run." >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git is required. Install it and re-run." >&2
  exit 1
fi

REPO="${JOBFARO_REPO:-https://github.com/samdotson61/jobfaro-app.git}"
DIR="${JOBFARO_DIR:-$HOME/jobfaro}"

if [ -d "$DIR/.git" ]; then
  echo "Updating $DIR…"; git -C "$DIR" pull --ff-only
else
  echo "Cloning into $DIR…"; git clone --depth 1 "$REPO" "$DIR"
fi

cd "$DIR"
npm install --no-audit --no-fund
node doctor.mjs || true

if [ -t 0 ]; then
  node bin/jobfaro init
else
  echo "Setup: run  cd \"$DIR\" && node bin/jobfaro init"
fi
echo "Done. Tip: 'npm link' puts the 'jobfaro' command (and its short alias 'jf') on your PATH."
