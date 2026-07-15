# Things only you can do (collected by Claude)

Manual console/account steps I can't (or shouldn't) do autonomously. Delete lines as
you complete them. Nothing here blocks Phases 0–5 — everything runs against the
Firebase emulators until deploy time (Phase 6).

## Firebase / Google Cloud (needed for Phase 6 deploy)

- [ ] **Create the Firebase project** (suggested id: `sabeel-time-tracker`) at
  https://console.firebase.google.com — Blaze plan (required for Cloud Functions).
  Firestore location: `nam5` (US multi-region) — immutable, pick carefully.
  Then update `.firebaserc` with the real project id.
- [ ] **Enable Google as the only sign-in provider**: Authentication → Sign-in
  method → Google → Enable. Do NOT enable email/password.
- [ ] **OAuth consent screen** (GCP console → APIs & Services → OAuth consent
  screen): External, app name "Sabeel Time Tracker", your support email.
- [ ] **Register the Android app**: Project settings → Add app → Android, package
  `com.sabeelinstitute.timetracker`. Add your debug-keystore SHA-1:
  `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android | grep SHA1`
  Download `google-services.json` → `app/google-services.json`.
  (Repeat with the release-keystore SHA-1 before shipping the release APK, and
  re-download `google-services.json` after every SHA change.)
- [ ] **Register the Web app**: Project settings → Add app → Web. Paste the config
  object into `app/src/firebase-config.ts`.
- [ ] **Copy the Web OAuth client ID** (GCP console → Credentials → the
  "Web client (auto created by Google Service)") into `WEB_CLIENT_ID` in
  `packages/shared/src/constants.ts`. ⚠️ Mobile Google Sign-In needs the *Web*
  client id, not the Android one — using the Android one causes DEVELOPER_ERROR.

## Google Drive sync (Phase 5b/6)

- [ ] Enable **Google Sheets API** and **Google Drive API** in the GCP project.
- [ ] Create a **service account** (no roles needed) and note its email.
- [ ] In Workspace Drive, create the folder that will hold the hours Sheet + CSV
  snapshots; **share it (Editor) with the service-account email**.
- [ ] Give Claude the folder ID (from its URL) to put in function config.

## Sentry (Phase 6)

- [ ] Create a Sentry project; run `firebase functions:secrets:set SENTRY_DSN`.
- [ ] Put the client DSN in `app/.env.local` (key name provided when wired).

## First admin (after first deploy)

- [ ] Sign in once with your own Google account (it lands pending), then run the
  one-time bootstrap script Claude provides to promote yourself to admin.
