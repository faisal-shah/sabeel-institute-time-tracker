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
  PAGE="$PAGES_DIR/sabeel-time-tracker/index.html"
  # The rolling asset URL never changes, so the page is the ONLY place a reader
  # can tell whether what they are downloading is current. Stamp when it was
  # published, plus a machine-readable datetime attribute.
  #
  # The zone is PINNED to the team's (Houston), not the build machine's. A bare
  # `date` relabels the public page in whatever zone the laptop that cut the
  # release happens to be set to — silently, and readers have no way to tell.
  # Same format and zone as the kanban download page, so the two match.
  PUBLISH_TZ="America/Chicago"
  STAMP_ISO="$(TZ="$PUBLISH_TZ" date +%Y-%m-%dT%H:%M:%S%:z)"
  STAMP_HUMAN="$(TZ="$PUBLISH_TZ" date '+%-d %B %Y, %-I:%M %p %Z')"

  # Both edits are blind rewrites of someone else's file: if the page is
  # restructured and an anchor disappears, sed reports success and the page
  # silently freezes on an old version. Assert the anchors first, and the
  # results after.
  grep -q 'Current build: <strong>v' "$PAGE" ||
    { echo "PAGE ANCHOR MISSING: 'Current build: <strong>v' not in $PAGE" >&2; exit 1; }
  grep -q '<time datetime="' "$PAGE" ||
    { echo "PAGE ANCHOR MISSING: '<time datetime=\"' not in $PAGE" >&2; exit 1; }

  sed -i -E "s#(Current build: <strong>)v[0-9][^<]*#\\1v${VERSION}#" "$PAGE"
  sed -i -E "s#<time datetime=\"[^\"]*\">[^<]*</time>#<time datetime=\"${STAMP_ISO}\">${STAMP_HUMAN}</time>#" "$PAGE"

  grep -q "Current build: <strong>v${VERSION}<" "$PAGE" ||
    { echo "PAGE NOT UPDATED: version did not become v${VERSION}" >&2; exit 1; }
  grep -q ">${STAMP_HUMAN}</time>" "$PAGE" ||
    { echo "PAGE NOT UPDATED: timestamp did not become ${STAMP_HUMAN}" >&2; exit 1; }

  # PATHSPEC on every git call below. The pages repo is SHARED with the kanban
  # publisher, and an unscoped `git commit` sweeps up whatever that script has
  # staged — so a concurrent publish commits the other project's page under this
  # project's message, or worse, ships it half-written.
  PAGE_REL="sabeel-time-tracker/index.html"
  git -C "$PAGES_DIR" add -- "$PAGE_REL"
  # `commit && push || echo` reported success when the PUSH failed, which looks
  # identical to "nothing changed" and leaves the team downloading a stale
  # build. Separate the two: no changes is fine, a failed push is not (set -e).
  if git -C "$PAGES_DIR" diff --cached --quiet -- "$PAGE_REL"; then
    echo "(page already current — nothing to commit)"
  else
    git -C "$PAGES_DIR" commit -q -m "Time tracker page: v${VERSION} (${STAMP_HUMAN})" -- "$PAGE_REL"
    git -C "$PAGES_DIR" push -q
  fi
  n="$(git -C "$PAGES_DIR" rev-list --all --objects | grep -c '\.apk$' || true)"
  [ "$n" -eq 0 ] || { echo "GUARDRAIL FAILED: $n apk blob(s) in pages history" >&2; exit 1; }
  echo "Page stamped: v${VERSION}, published ${STAMP_HUMAN}."
fi
echo "Published time-tracker v${VERSION}."
