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
