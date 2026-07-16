#!/usr/bin/env bash
# Jobfaro — refresh everything that bakes this folder's ABSOLUTE path.
# Run after moving or renaming this checkout (or restoring it onto a new machine):
#   ./scripts/after-move.sh
#
# What goes stale when the path changes (each of these bit for real at the
# 2026-07-16 Jobdar→Jobfaro rename):
#   1. The npm-link global commands `jobfaro`/`jf` — global symlinks into the old path
#      ("command not found" with no hint why).
#   2. expo-modules-jsi's package-local .DerivedData — caches xcframework builds by
#      absolute path (surfaces as hermes.h build errors).
#   3. CocoaPods under apps/jobfaro/ios — generated xcconfigs + Local Podspecs bake
#      the old path.
# Safe to re-run: every step skips cleanly when there's nothing to do.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 Global commands (npm link) =="
npm rm -g jobfaro jobdar >/dev/null 2>&1 || true
npm link
echo "   jobfaro + jf now point at $PWD"

echo "== 2/3 Native build caches (.DerivedData) =="
derived="$(find . -type d -name .DerivedData -prune 2>/dev/null || true)"
if [ -n "$derived" ]; then
  while IFS= read -r d; do
    rm -rf "$d" && echo "   purged $d"
  done <<<"$derived"
else
  echo "   none found — nothing to purge"
fi

echo "== 3/3 CocoaPods (apps/jobfaro/ios) =="
IOS_DIR="apps/jobfaro/ios"
if [ -f "$IOS_DIR/Podfile" ]; then
  rm -rf "$IOS_DIR/Pods" "$IOS_DIR/Podfile.lock"
  echo "   removed Pods/ + Podfile.lock (their generated files bake absolute paths)"
  if [ ! -d "apps/jobfaro/node_modules" ]; then
    echo "   apps/jobfaro/node_modules missing — run \`pnpm install\` first, then:"
    echo "     cd $IOS_DIR && LANG=en_US.UTF-8 pod install"
  elif command -v pod >/dev/null 2>&1; then
    (cd "$IOS_DIR" && LANG=en_US.UTF-8 pod install)
  else
    echo "   CocoaPods not installed — before the next native build, run:"
    echo "     cd $IOS_DIR && LANG=en_US.UTF-8 pod install"
  fi
else
  echo "   no Podfile — skipped"
fi

echo ""
echo "== Check =="
node doctor.mjs
