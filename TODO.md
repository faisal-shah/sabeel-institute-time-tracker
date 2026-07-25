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
- [x] **Firestore location confirmed `nam5`** (2026-07-17, Faisal).
- [x] **OAuth consent screen — published** (2026-07-16, confirmed by Faisal). Any
  Google account can now sign in; access is gated by the app's own admin-approval
  flow. App uses only basic non-sensitive scopes (email/profile/openid) so no
  Google verification was required.
- [x] **Android debug SHA-1 registered** + `google-services.json` re-downloaded
  (now has the `client_type: 1` Android OAuth client). Native Google Sign-In is
  wired and the app builds; complete a real sign-in on a device/emulator with a
  Google account to confirm end to end.

## Google Drive sync — REMOVED (undo checklist)

The Drive sync feature was removed on 2026-07-25 (code, config, deployed
functions and docs all gone). Nothing in the app touches Google Drive any more.
These are the leftovers on Google's side that only **you** can clear:

- [ ] **Un-share the Drive folder from the service account.** Open the "Sabeel
  Hours" folder in Drive → Share → remove
  `858585609550-compute@developer.gserviceaccount.com`. This is the one that
  actually matters: it revokes the app's standing access to that folder.
- [ ] **Decide what to do with the folder + Sheet themselves.** They are your
  documents and hold only a copy of approved hours; keep or delete as you like.
  Nothing will write to them again.
- [ ] **Optional — disable the two APIs** now that nothing uses them:
  - Sheets: https://console.cloud.google.com/apis/api/sheets.googleapis.com/metrics?project=sabeel-institute-time-tracker
  - Drive: https://console.cloud.google.com/apis/api/drive.googleapis.com/metrics?project=sabeel-institute-time-tracker
  (Harmless to leave enabled; disabling is just tidier.)

No secrets to rotate: the two values were `DRIVE_SPREADSHEET_ID` and
`DRIVE_FOLDER_ID`, which are document identifiers, not credentials. They have
been removed from `functions/.env` and from the deployed functions' config.

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

- [x] GCP console → **APIs & Services → Credentials** →
  https://console.cloud.google.com/apis/credentials?project=sabeel-institute-time-tracker
  → under **OAuth 2.0 Client IDs** open the **Web client** (the one Firebase
  auto-created) and add:
  - to **Authorized JavaScript origins**:
    `https://sabeel-institute-time-tracker.web.app`
  - to **Authorized redirect URIs**:
    `https://sabeel-institute-time-tracker.web.app/__/auth/handler`
  Save. (Additive — existing sign-ins keep working.)
- [x] Tell Claude "redirect URI added" → authDomain flips to
  `sabeel-institute-time-tracker.web.app` in `firebase-config.ts`, website
  redeploys, and chat-app/in-app-browser sign-ins start working.

## Sentry

- [x] Done 2026-07-16: both projects created, DSNs wired (web + functions),
  events flowing with user ids.
- [x] Native @sentry/react-native wired 2026-07-17 (v1.0.0-beta.11) — Android
  crashes/ANRs/errors report with user ids.
- [ ] **Readable release stack traces** (optional, one-time): create an auth
  token at sentry.io → **Settings → Auth Tokens → Create New Token** (scope:
  `project:releases`), then on this machine copy
  `app/android/sentry.properties.example` to `sentry.properties` (same
  folder, gitignored) and fill in `auth.token=` and your org slug
  (`defaults.org=` — it's in your sentry.io URL). NEVER paste the token in
  chat or commit it. Tell Claude it's in place → the next release build
  uploads source maps automatically and stacks become readable.

## First admin (after first deploy)

- [x] Done 2026-07-16 via a temporary one-shot bootstrap function (deployed,
  called once, deleted). You are an active admin+manager.

## Phase 7 rollout (timesheets)

- [x] Done 2026-07-16: wipe confirmed and executed, admin kept (approver=self),
  live smoke passed.

## Play Store phase (not now — deferred 2026-07-20)

Nothing here blocks sideloaded testing. The APKs already ARE release builds
(minified, production bundle); only the signing key is the debug one, which is
valid to 2052 and functionally identical for testing.

- [ ] **Release keystore + SHA-1** — generate a real keystore, wire the signing
  config, register its SHA-1 on the Firebase Android app, re-download
  `google-services.json`. Play Store will not accept a debug-signed APK.
  Note: switching keys forces a one-time uninstall/reinstall for everyone who
  already has the app (Android refuses an update signed by a different key), so
  the cost scales with install count. Nothing is lost — all data is in Firestore.

## Proposal — anomaly canary (not built; decide when you want it)

**Problem it solves.** Backups now retain 14 weeks, but nothing *detects* a
problem. If data is corrupted just before a quiet period and nobody looks for
four months, every retained backup contains the already-broken state. Detection
is the cheap lever: notice in days and the 14-week window becomes generous.
It also answers "is the scheduled job even still running?" — the exact blind
spot that hid the old Drive sync's status.

**Sketch** (small, ~1 scheduled function + 1 Firestore doc):
- Daily scheduled function counts docs per collection (`users`, `activities`,
  `timeEntries`, `timesheets`) and writes them to `meta/health` with a timestamp.
- Compares against the previous run. Raises via the existing Sentry seam
  (`reportError`) when a count **drops** at all, or drops more than a threshold —
  deletions are legitimate but rare, so a low bar is fine here.
- Because it writes a timestamp every day, a *stale* `meta/health` doc is itself
  the signal that the canary (or the whole functions deploy) has stopped.

**Open questions for whoever picks this up:** where the alert lands (Sentry only,
or also a push to admins); whether to surface "last checked" in the admin UI; and
whether a weekly digest is friendlier than per-event alerts for a small org.
