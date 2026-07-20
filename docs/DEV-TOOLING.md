# Dev tooling — what each script is for, and the bug that paid for it

Every entry here exists because something cost hours. The scripts encode the
fix; this file keeps the reasoning, so nobody "simplifies" a guard back into a
bug.

## Commands

| Command | What it does |
|---|---|
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

`--dry-run` stops after the bump; `--verify-only` re-runs the AVD check against
already-built APKs.

### A release is not finished until the download page points at it

This repo is **private**, so its GitHub releases are not publicly downloadable —
the team would need repo access just to install the APK. They install from a
public GitHub Pages site instead:

**https://faisal-shah.github.io/sabeel-time-tracker/** — served from the
`faisal-shah.github.io` repo, branch **`master`** (not main). It links the web
app, the Android APK and USER-MANUAL.pdf.

`release.mjs` prints the exact commands with the tag filled in. The steps are
deliberately **not automated**: they force-push another repo and commit a ~38 MB
binary, where ordering matters. Full instructions also live in
`sabeel-time-tracker/README.md` in that repo, next to the files.

The four rules that are easy to get wrong:

- **Take the APK from the release, not the local build tree.** The release is the
  artifact that was tested and published; `outputs/` is whatever was built last.
  When the page was created the working copy was three commits past the tag —
  a local build would have shipped something nobody had verified. Confirm with
  `sha256sum` on both.
- **The filename stays unversioned** (`sabeel-time-tracker-arm64-v8a.apk`); the
  page carries the version. Re-versioning breaks every bookmark and message that
  ever pointed at the link.
- **The binary goes in its own commit**, never mixed with page edits. Each is
  ~38 MB and git keeps every version forever — overwriting does not reclaim the
  blob. Isolated binary commits can be dropped later with `git rebase -i` +
  `git push --force-with-lease`; mixed ones cannot without losing real history.
- **`--force-with-lease`, never `--force`** — it refuses if someone else pushed.

Pages lags a push by ~1 minute, so verify with a cache-buster before concluding
something broke. Only arm64 is published (covers phones from ~2016 on); a 32-bit
build is not worth permanent extra history for a case that may never arise.

## Working with the Firebase emulators generally

- **The emulator enforces no composite indexes.** A query that passes every
  local test can fail for the first real user. Probe production with
  `probeQueries` after any index or query-shape change.
- **`EMULATOR_HOST` is the literal `127.0.0.1`**, never `localhost`: the
  emulators bind IPv4-only, and `localhost` can resolve to IPv6 `::1` first.
- Secret Manager 403s in emulator logs are expected noise (`secrets: [...]`
  makes the emulator reach for real Secret Manager); they are not the failure
  you are chasing.
