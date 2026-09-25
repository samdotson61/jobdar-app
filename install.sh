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

# 1.63.1 compat: a pre-revert JOBFARO_* export still steers the install — say so (gone in 1.64).
if [ -n "${JOBFARO_REPO:-}${JOBFARO_DIR:-}" ]; then echo "note: legacy JOBFARO_REPO/JOBFARO_DIR honored — rename to JOBDAR_* (support ends in 1.64)" >&2; fi
REPO="${JOBDAR_REPO:-${JOBFARO_REPO:-https://github.com/samdotson61/jobdar-app.git}}"
# JOBDAR_DIR wins; plain DIR also works (it's what people naturally try); default ~/jobdar.
DIR="${JOBDAR_DIR:-${JOBFARO_DIR:-${DIR:-$HOME/jobdar}}}"

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
echo "Done. Tip: 'npm link' puts the 'jobdar' command (and its short alias 'jd') on your PATH."
