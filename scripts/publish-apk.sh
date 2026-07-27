#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="faisal-shah/faisal-shah.github.io"
TAG="timetracker-latest"
ASSET="sabeel-time-tracker-arm64-v8a.apk"
APK="${1:-app/android/app/build/outputs/apk/release/app-arm64-v8a-release.apk}"
PAGES_DIR="${TT_PAGES_DIR:-../faisal-shah.github.io}"
[ -f "$APK" ] || { echo "APK not found: $APK" >&2; exit 1; }
# Last gate before a public download URL exists, which is awkward to retract.
node scripts/check-version.mjs
VERSION="$(node -p "require('./app/app.json').expo.version")"
tmp="$(mktemp -d)/$ASSET"; cp "$APK" "$tmp"
gh release upload "$TAG" "$tmp" --clobber --repo "$REPO"
if [ -d "$PAGES_DIR/.git" ]; then
  sed -i -E "s#(Current build: <strong>)v[0-9][^<]*#\\1v${VERSION}#" \
    "$PAGES_DIR/sabeel-time-tracker/index.html"
  git -C "$PAGES_DIR" add sabeel-time-tracker/index.html
  git -C "$PAGES_DIR" commit -q -m "Time tracker page: v${VERSION}" \
    && git -C "$PAGES_DIR" push -q || echo "(page unchanged)"
  n="$(git -C "$PAGES_DIR" rev-list --all --objects | grep -c '\.apk$' || true)"
  [ "$n" -eq 0 ] || { echo "GUARDRAIL FAILED: $n apk blob(s) in pages history" >&2; exit 1; }
fi
echo "Published time-tracker v${VERSION}."
