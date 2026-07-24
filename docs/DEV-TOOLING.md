# Dev tooling — what each script is for, and the bug that paid for it

Every entry here exists because something cost hours. The scripts encode the
fix; this file keeps the reasoning, so nobody "simplifies" a guard back into a
bug.

**Scope:** this file covers *our* scripts and conventions. The underlying
stack behaviour they guard against is documented once, in the shared
`expo-firebase-stack` skill — see `docs/STACK-GOTCHAS.md`. Facts about Expo,
Firebase or the emulators belong there; what we built in response belongs here.

## Commands

| Command | What it does |
|---|---|
| `npm run verify` | the fast CI gates in one shot: lint + typecheck + knip + unit — **run before pushing** |
| `npm run lint` | eslint + `check:text` (see below) |
| `npm run typecheck` | tsc across all workspaces |
| `npm test` | Vitest units (functions + shared) |
| `npm run test:emulator` | rules/integration suite (frees ports first) |
| `npm run test:e2e` | full browser e2e against emulators |
| `npm run knip` | dead-code audit |
| `npm run emulators:free` | kill whatever is squatting on emulator ports |
| `npm run release -- <version> --notes FILE` | cut an Android release |

## `scripts/free-emulator-ports.sh`

A killed run leaves emulators holding 5001/8080/9099. The next run then talks to
a **half-dead emulator**: it answers on the port but has registered no
functions, so every callable 404s.

The symptom chain is vicious — a 404 carries no CORS headers, so the browser
reports *"blocked by CORS policy"*, and the app surfaces a bare **`internal`**.
Three misleading symptoms, none pointing at the leftover process. On 2026-07-20
this made a clean `HEAD` fail identically to a working branch, which is the only
reason it was caught: **when a failure reproduces on stashed changes, it is
environmental.** Bisect against clean HEAD before debugging your own diff.

Ports are looked up **by port**, never `pkill -f firebase` — that pattern also
matches the script's own command line and kills the caller (seen as a shell
exiting 144).

## `scripts/check-text-sources.mjs` (runs inside `npm run lint`)

`functions/src/driveRows.ts` once contained a **raw NUL byte** inside a template
literal used as a composite Map-key separator. It compiled and ran correctly —
but `file` called the source "data", git diffed it as binary, and **grep
silently skipped the entire file**.

During a dead-code audit that made a live constant (`ENTRIES_HEADER`) look
unreferenced. A verification tool that returns "no matches" for a file it cannot
read is worse than no tool at all. Write control characters as escapes
(`\u0000`): identical runtime value, readable source.

## `knip.json` + `npm run knip`

Knip has three failure modes in this stack. All three fired on the first run:

1. **Platform seams are false positives.** Every `.web.ts(x)` is resolved by the
   bundler, not by an import, so knip called all 13 of them unused. They are
   entry points in `knip.json`.
2. **An export used only from a seam reads as unused.** The `app` export in
   `firebase.ts` is used solely by `notify.web.ts`. Grep across `.ts` *and*
   `.tsx` and typecheck before believing the report.
3. **"Unused dependency" ≠ removable.** `@sentry/react` (used by `sentry.web.ts`),
   `react-native-worklets` (babel plugin + reanimated peer) and `playwright`
   (drives the e2e) all showed as unused because their consumers were invisible.

**`@sabeel/shared` is deliberately absent from `functions/package.json`** —
esbuild inlines it, and declaring it makes Cloud Build fail with
*"404 not in this registry"*. It is in `ignoreDependencies` so nobody "fixes" it.

Exported **types** are kept even when only used in their own file: each names the
parameter or return of an exported function, i.e. it documents a public surface.
That is what `ignoreExportsUsedInFile` encodes.

One judgement call knip cannot make: **some unused code marks a missing feature
rather than cruft.** If deleting it would erase the only trace of a user-facing
gap, fix the gap instead.

**`npm run knip` is a SEPARATE CI step — `npm run lint` does not include it.**
On 2026-07-22 CI sat red for many commits (since the Option-1 migration added an
unused `useTheme` export) because local validation ran lint/typecheck/test but
not knip, and CI status wasn't re-checked after those pushes. Guard against the
whole class: **run `npm run verify` before pushing** (lint + typecheck + knip +
unit), and don't assume green — check the actual CI run.

## `scripts/web-e2e.mjs`

Beyond the flows themselves, the harness encodes:

- **Frees emulator ports first** (above).
- **Waits for a callable to EXIST, not for the port to answer**
  (`waitForFunctionRegistered`). Port-open is not function-ready.
- **Truncates `e2e-shots/emulator.log` per run.** A stale log from days earlier
  once produced confident, wrong conclusions.
- **Captures failed calls to the functions emulator with their response bodies**,
  and dumps them (plus console errors and per-page screenshots) on failure. This
  replaced hand-writing a one-off repro script to see a server error.
- **Injects latency** around week switching — the stale-week bug class only
  appears when snapshots lag (see `POSTMORTEM-2026-07-16-stale-week.md`).

## `scripts/release.mjs`

Replaces a hand-run sequence repeated for beta.8 → beta.11, where the version
lived in **four** files that had already drifted (`app.json` said beta.7 while
builds said beta.11). It bumps all four, re-renders the manual PDF, builds both
APKs, verifies on the AVD, and publishes.

Guards worth keeping:

- **Distribution is ALWAYS a GitHub release.** Never attach an APK to chat.
- **Both variants, every time.** arm64-only crashes on an x86_64 emulator with
  "Unexpected CPU variant" — which is what verification runs on.
- **The production check is the ABSENCE of the dev sign-in row.** An
  emulator-mode bundle looks identical otherwise, and Metro will serve a cached
  bundle built under different `EXPO_PUBLIC_*` env. The script fails the release
  if that row is present.
- **`versionCode` must increase**, or installs silently refuse to upgrade.
- Refuses to run on a dirty tree, so a release is reproducible from a commit.
- **Commits the version bump ITSELF (`v<version>`), before building**, then stamps
  `app/src/build-info.ts` from that release commit. The APK bundles it and the
  later `firebase deploy --only hosting` regenerates it from the SAME commit — so
  the sign-in footer (`v<version> · <hash>`) is identical on the APK and the web.
  Building before the commit would stamp two different commits (that was a bug).
  So there is no manual "commit the bump" step now; if a post-commit step fails,
  recover with `git reset --hard HEAD~1`. Finish with `firebase deploy --only
  hosting && git push`.

`--dry-run` stops after the bump (before the commit); `--verify-only` re-runs the
AVD check against already-built APKs.

### A release is not finished until the download page points at it

This repo is **private**, so its GitHub releases are not publicly downloadable —
the team would need repo access just to install the APK. They install from a
public GitHub Pages site instead:

**https://faisal-shah.github.io/sabeel-time-tracker/** — served from the
`faisal-shah.github.io` repo, branch **`master`** (not main). It links the web
app, the Android APK and USER-MANUAL.pdf.

**The APK is a GitHub Release ASSET, never a committed blob** (revised
2026-07-21). It uploads to the pages repo's fixed rolling tag
`timetracker-latest`, so the download URL is permanent:
`…/releases/download/timetracker-latest/sabeel-time-tracker-arm64-v8a.apk`.
Only the version *label* on the page is committed. `release.mjs` runs
`scripts/publish-apk.sh` for this automatically; it can also be run by hand.

Why this replaced committing the binary: per-release APKs (~31–38 MB each) were
committed to the pages repo and git keeps every version forever. The history
bloated to ~100 MB and had to be rewritten out (force-push) — twice, once with a
concurrent Kanban release landing mid-rewrite. Assets sidestep all of it: no
blob in history, nothing to drop, no force-push.

The rules that survive into the asset model:

- **Take the APK from the tested build, not a stale tree.** `release.mjs` passes
  the arm64 APK it just built and verified on the AVD, in the same run — so it is
  the artifact that was tested, not whatever `outputs/` happens to hold later.
- **The asset filename stays unversioned** (`sabeel-time-tracker-arm64-v8a.apk`);
  the page carries the version. `--clobber` re-uploads it to the same URL.
  Re-versioning would break every bookmark and message pointing at the link.
- **Never `git add` a binary to any repo.** `*.apk` is gitignored in the pages
  repo as the backstop, and `publish-apk.sh` asserts the pages history holds
  **zero** `.apk` blobs — the release fails if one ever reappears.

Pages lags a push by ~1 minute, so verify with a cache-buster before concluding
something broke. Only arm64 is published (covers phones from ~2016 on).

## Working with the Firebase emulators generally

- **The emulator enforces no composite indexes.** A query that passes every
  local test can fail for the first real user. Probe production with
  `probeQueries` after any index or query-shape change.
- **`EMULATOR_HOST` is the literal `127.0.0.1`**, never `localhost`: the
  emulators bind IPv4-only, and `localhost` can resolve to IPv6 `::1` first.
- Secret Manager 403s in emulator logs are expected noise (`secrets: [...]`
  makes the emulator reach for real Secret Manager); they are not the failure
  you are chasing.
