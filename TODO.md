# Things only you can do (collected by Claude)

Manual console/account steps I can't (or shouldn't) do autonomously. Delete lines as
you complete them. Nothing here blocks Phases 0–5 — everything runs against the
Firebase emulators until deploy time (Phase 6).

## Firebase / Google Cloud (needed for deploy)

- [x] **Create the Firebase project** — done: `sabeel-institute-time-tracker`.
  `.firebaserc` updated.
- [x] **Enable Google as the only sign-in provider** — done.
- [x] **Register the Web app** — done; real config integrated into
  `app/src/firebase-config.ts`.
- [x] **Web OAuth client ID** — done; taken from the `client_type: 3` entry in
  `app/google-services.json` and set in `WEB_CLIENT_ID`
  (`packages/shared/src/constants.ts`).
- [x] **google-services.json committed** — done (Android app registered).
- [ ] **Confirm the Firestore location is `nam5`** (US multi-region) if you
  haven't already — it's immutable. Firebase Console → Firestore Database → the
  region shown at the top. (Skip if already created; just note what it is.)
- [x] **OAuth consent screen — published** (2026-07-16, confirmed by Faisal). Any
  Google account can now sign in; access is gated by the app's own admin-approval
  flow. App uses only basic non-sensitive scopes (email/profile/openid) so no
  Google verification was required.
- [x] **Android debug SHA-1 registered** + `google-services.json` re-downloaded
  (now has the `client_type: 1` Android OAuth client). Native Google Sign-In is
  wired and the app builds; complete a real sign-in on a device/emulator with a
  Google account to confirm end to end.
- [ ] **Release SHA-1** — before shipping a signed release APK, generate a real
  keystore, register ITS SHA-1 on the Firebase Android app the same way, and
  re-download `google-services.json`. (The committed debug keystore is only for
  sideloading your own builds.)

## Google Drive sync (Phase 5b/6)

- [ ] Enable **Google Sheets API** and **Google Drive API** in the GCP project.
- [ ] Create a **service account** (no roles needed) and note its email.
- [ ] In Workspace Drive, create the folder that will hold the hours Sheet + CSV
  snapshots; **share it (Editor) with the service-account email**.
- [ ] Create the Google Sheet inside that folder (any name); note its spreadsheet
  ID from the URL.
- [ ] Put `DRIVE_SPREADSHEET_ID=<id>` and `DRIVE_FOLDER_ID=<id>` in
  `functions/.env` (gitignored; see `functions/.env.example`). Empty = the sync
  is a safe no-op, so nothing breaks until you fill these in. The deployed
  function's runtime service account must be the one you shared the folder with.

## Sentry (Phase 6)

- [ ] Create a Sentry project; run `firebase functions:secrets:set SENTRY_DSN`.
- [ ] Put the client DSN in `app/.env.local` (key name provided when wired).

## First admin (after first deploy)

- [ ] Sign in once with your own Google account (it lands pending), then run the
  one-time bootstrap script Claude provides to promote yourself to admin.
