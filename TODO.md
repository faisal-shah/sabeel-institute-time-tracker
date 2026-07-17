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

## Google Drive sync — click-by-click (no new service account needed)

The deployed functions authenticate as their built-in runtime service account:

    858585609550-compute@developer.gserviceaccount.com

Do NOT create a new service account — just share the folder with that email.

- [x] **Enable the two APIs** on the `sabeel-institute-time-tracker` project
  (click each link → Enable):
  - Sheets: https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=sabeel-institute-time-tracker
  - Drive: https://console.cloud.google.com/apis/library/drive.googleapis.com?project=sabeel-institute-time-tracker
- [x] **Create the folder** in the org's Google Drive (e.g. "Sabeel Hours").
  Right-click → Share → add
  `858585609550-compute@developer.gserviceaccount.com` as **Editor** → Share.
  (Ignore the "outside your organization" warning — that's expected; if
  Workspace *blocks* the share entirely, an admin must allow external sharing
  for this folder/drive.)
- [x] **Create a Google Sheet inside that folder** (any name, e.g. "Sabeel
  Hours — live"). Leave it empty; the sync writes its own tabs.
- [x] **Copy the two IDs from the browser URLs:**
  - Sheet open → URL looks like
    `https://docs.google.com/spreadsheets/d/`**`SPREADSHEET_ID`**`/edit` —
    copy the long id between `/d/` and `/edit`.
  - Folder open → URL looks like
    `https://drive.google.com/drive/folders/`**`FOLDER_ID`** — copy the id
    after `/folders/`.
- [x] **Hand the IDs to Claude** (they're document identifiers, not secrets —
  chat is fine), or put them in gitignored `functions/.env` yourself as:

      DRIVE_SPREADSHEET_ID=<spreadsheet id>
      DRIVE_FOLDER_ID=<folder id>

- [x] Claude then **redeploys functions** and verifies with the in-app
  **"Sync to Google Drive now"** button (Reports screen): the Sheet gains
  "Entries" / "By person" / "By activity & month" tabs. Nightly sync runs at
  02:15 UTC; on the 1st of each month a `hours-YYYY-MM.csv` snapshot is
  dropped into the folder. Until the IDs are set, the sync is a safe no-op.

## Web push notifications (one console step)

Android push works out of the box. The **website** needs the Web Push
certificate generated once:

- [x] Firebase console → **Project settings** (gear) → **Cloud Messaging** tab →
  scroll to **Web configuration** → **Web Push certificates** → **Generate key
  pair**.
- [x] Copy the key that appears (starts with `B…`, ~90 characters — it's a
  *public* key, chat is fine) and give it to Claude, who puts it in
  `app/.env.local` as `EXPO_PUBLIC_FCM_VAPID_KEY` and redeploys the website.
  Until then, web sign-ins simply skip push registration — nothing breaks.

## Fix web sign-in inside in-app/partitioned browsers (missing-initial-state error)

Seen 2026-07-17: sign-in from a chat app's in-app browser dies on the
firebaseapp.com auth helper ("missing initial state"). Fix = serve the auth
helper same-origin. One console step, then Claude flips `authDomain` and
redeploys:

- [ ] GCP console → **APIs & Services → Credentials** →
  https://console.cloud.google.com/apis/credentials?project=sabeel-institute-time-tracker
  → under **OAuth 2.0 Client IDs** open the **Web client** (the one Firebase
  auto-created) and add:
  - to **Authorized JavaScript origins**:
    `https://sabeel-institute-time-tracker.web.app`
  - to **Authorized redirect URIs**:
    `https://sabeel-institute-time-tracker.web.app/__/auth/handler`
  Save. (Additive — existing sign-ins keep working.)
- [ ] Tell Claude "redirect URI added" → authDomain flips to
  `sabeel-institute-time-tracker.web.app` in `firebase-config.ts`, website
  redeploys, and chat-app/in-app-browser sign-ins start working.

## Sentry

- [x] Done 2026-07-16: both projects created, DSNs wired (web + functions),
  events flowing with user ids. Remaining: native @sentry/react-native init is
  a no-op stub — wire it on a future Android build cycle.

## First admin (after first deploy)

- [x] Done 2026-07-16 via a temporary one-shot bootstrap function (deployed,
  called once, deleted). You are an active admin+manager.

## Phase 7 rollout (timesheets)

- [x] Done 2026-07-16: wipe confirmed and executed, admin kept (approver=self),
  live smoke passed.
