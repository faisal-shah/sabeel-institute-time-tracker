# Deploy guide

Everything through Phase 5b runs against the Firebase emulators with no real
project. Deploy is the point where the human console steps in `TODO.md` must be
done first. Prerequisites: complete the Firebase/GCP/OAuth items in `TODO.md`,
then update `.firebaserc` with the real project id.

## One-time
1. `TODO.md` — create the Firebase project (Blaze), enable Google sign-in, register
   the Android + Web apps, wire SHA-1s and `WEB_CLIENT_ID`, download
   `google-services.json`.
2. `firebase functions:secrets:set SENTRY_DSN` (optional until launch).

## Deploy
```sh
# Rules + indexes + functions + hosting (web). Predeploy builds the web bundle.
firebase deploy --only firestore:rules,firestore:indexes,functions,hosting
```
- Hosting serves `app/dist-web` (built by `npm run web:export -w @sabeel/app`, run
  automatically by the hosting predeploy hook in `firebase.json`).
- Indexes: the composite indexes in `firestore.indexes.json` deploy with the above;
  first queries will error until they finish building (a few minutes).

## First admin (after first deploy)
Sign in once with your Google account (lands pending), then:
```sh
GCLOUD_PROJECT=<real-project-id> node scripts/grant-admin.mjs you@example.com
```
(Needs gcloud ADC or `GOOGLE_APPLICATION_CREDENTIALS`.) Sign out/in to pick up the
admin claim. From then on, promote others in-app (Manage users).

## Android release APK
`android/` is committed (no EAS). Build locally:
```sh
cd app && npx expo run:android            # debug, onto a device/emulator
cd app/android && ./gradlew assembleRelease   # release APK (universal)
cd app/android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a  # arm64-only (~30MB)
```
**Distribution is ALWAYS a GitHub release** (never chat/ad-hoc file sharing):
```sh
gh release create vX.Y.Z --title "..." --notes "..." path/to/renamed.apk
```
Verify the APK is production-mode before publishing: install on the tb_emu AVD
and screenshot — the sign-in screen must NOT show the dev sign-in row.
Before sharing a release build: generate a real keystore (the debug key is only for
sideloading your own device) and register its SHA-1 on the Firebase Android app, then
re-download `google-services.json`. See `TODO.md`.

## Troubleshooting

**Callables 403 with "The request was not authenticated / Empty Authorization
header" (Cloud Run layer), even though `setup.ts` sets `invoker: 'public'`.**
Seen on 2026-07-16: the very first deploy created the gen-2 functions but the
*build* failed (the `@sabeel/shared` packaging bug), so the public-invoker IAM
binding was never applied. Later update deploys don't re-apply invoker IAM when
they think it's unchanged, so the callables stayed private and every client call
bounced at the Run layer before the code ran (symptom: Reports total stuck on
`…`, CSV export silently empty). Fix: delete the affected callables and let a
deploy recreate them through the *create* path, which always applies the binding:
```sh
firebase functions:delete setUserAccess exportCsv reportTotals --region us-central1 --force
firebase deploy --only functions
```
Verify: an unauthenticated `curl -X POST .../reportTotals -d '{"data":{}}'` should
return a Firebase JSON `{"error":{... "UNAUTHENTICATED"}}` (code ran), NOT a plain
Run "request was not authenticated" 403.

**First deploy of a Firestore-trigger function fails with "Permission denied
while using the Eventarc Service Agent".** Seen on 2026-07-17 deploying
`notifyNewUser`/`notifyTimesheet`: the deploy auto-enables Eventarc, but the
service agent's permissions take a few minutes to propagate. Not a config
error — wait 2–5 minutes and redeploy just the failed functions
(`firebase deploy --only functions:<name>,functions:<name>`).

**e2e: "internal" from a callable / "blocked by CORS policy" in the browser.**
The functions emulator accepts connections on 5001 *before* it registers any
function; until then calls 404, and a 404 carries no CORS headers, so the browser
blames CORS and the app shows a bare `internal`. It is a startup race, not a
callable bug. `scripts/web-e2e.mjs` now waits for a known callable to exist
(`waitForFunctionRegistered`) rather than for the port to answer.

## Verify after deploy
- **Query/index probe** (REQUIRED after any change to `firestore.indexes.json`
  or to a query shape — the emulator does NOT enforce composite indexes, so
  only production can confirm them):
  `curl "https://us-central1-<project>.cloudfunctions.net/probeQueries?token=$PROBE_TOKEN"`
  (token in `functions/.env`; every line must read `OK`). Keep the shapes in
  `functions/src/probe.ts` in sync with the app's queries.
- Emulator suite still green locally: `npm test && npm run test:emulator`.
- Smoke the live site: sign in, get approved, clock in/out, add manual hours, check a
  report + CSV export.

## Backups / disaster recovery

Enabled 2026-07-25, both native Firestore features (no code, nothing to maintain):

| Layer | Window | What it covers |
|---|---|---|
| **PITR** | rolling **7 days** | "someone deleted it this morning" — rewind to any microsecond |
| **Weekly backup** (Mondays, 98-day retention) | **14 weeks** | "we noticed in September that something broke in July" |

14 weeks is Firestore's maximum retention. Both are **excluded from the free
tier**, but at this data size (~200 KB) they bill as fractions of a cent.

Inspect:
```sh
firebase firestore:databases:get "(default)"          # PITR state
firebase firestore:backups:schedules:list             # schedule + retention
firebase firestore:backups:list                       # actual backups taken
```

Restore (both are *new database* operations — they never overwrite in place, so
you restore then repoint, rather than clobbering live data):
```sh
firebase firestore:databases:restore \
  --database <new-db-id> --backup <backup-name>
```
For PITR, restore/export using a `--snapshot-time` within the last 7 days. See
https://cloud.google.com/firestore/native/docs/disaster-recovery.

### Detection — the `healthCheck` canary

Retention only helps if the problem is noticed while a good backup still exists.
`functions/src/health.ts` runs daily at 03:15 UTC and:

- counts documents per collection (via `count()` aggregations, not full reads);
- compares against the previous run stored at `meta/health` (server-only; the
  rules deny all client access);
- raises to Sentry when a collection shrinks past its tolerance —
  `users`/`activities` have **zero tolerance** (activities can't be deleted at
  all per the rules; users only by deliberate admin action), while
  `timeEntries`/`timesheets` tolerate `max(5, 20%)` since routine deletion is
  normal there;
- sends a Sentry **cron check-in**, so the job going *silent* is itself an alert.

Tune the thresholds in `DROP_RULES`. It always re-baselines, so a single bad day
alerts once rather than forever. Limitation: it compares run-to-run, so a slow
bleed of a few documents a day stays under the threshold — it is built to catch
sudden loss, which is what accidents and bad deploys look like.

**Remaining gap.** Beyond 14 weeks Firestore cannot retain natively; the cheap
mitigation is a deliberate export to Cloud Storage before a long break.
