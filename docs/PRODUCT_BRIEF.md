# Sabeel Institute Time Tracker — Implementation Plan

## Context

Faisal is building a time-tracking platform (Android app + website) for Sabeel Institute, a small nonprofit, to track and monitor volunteer hours — though by design it is a **general-purpose time tracker** (nothing volunteer-specific in the data model). Regular users clock in/out or enter hours manually against projects/events; admins approve new accounts; managers manage the activity list and run reports. The stack mirrors what Faisal already runs: tajweed-bytes-dev for the Firebase/monorepo/testing conventions, PineTimeCompanion for the one-Expo-codebase-multi-target pattern. New GitHub repo: **`sabeel-institute-time-tracker` (private)**, under `~/repos/faisal-shah/`. All project artifacts (docs, plans, protocols) live in that repo from creation onward.

## Decisions (settled with Faisal)

| Topic | Decision |
|---|---|
| Auth | Sign in with Google **only**. Any Google account may sign in; **every** new user — org-domain accounts included, no domain auto-approval — is `pending` until an **admin** approves (the approver sees the requester's name and email). |
| Trust model | Honor system — hours count immediately, no approval workflow for entries; managers can edit/correct anyone's entries. |
| Scope | Generic time tracking; roles are member / manager (+ admin flag). **Admins** approve/disable users and change roles; **managers** create/archive activities, run reports, and correct entries. |
| Platforms v1 | Android app + responsive website from **one Expo codebase** (react-native-web, PineTimeCompanion-style). No iOS, no EAS. |
| Clock-in | Own device, anywhere; one active session per user; plus manual entry (start/end or duration) with activity + optional note. |
| Reporting | Dashboard totals, CSV export (person/activity/date filters), lifetime hours per person + printable statement. No email digests, no email at all in v1. |
| Drive sync | Hours data lands in Google Workspace Drive: a **live Google Sheet** (nightly-updated, all entries + summary tabs) plus **monthly CSV snapshots**, both written by a scheduled Cloud Function into a shared Drive folder via a service account. |
| Usage reality | Everyone — managers included — primarily uses the phone app; the website is the occasional big-screen/printing surface. All manager screens are designed phone-first. |
| Timezones | Entries are bucketed/displayed in **the timezone where the work happened** (captured per entry). A volunteer in Singapore logging Monday hours shows as Monday, 9am–5pm local — never shifted into the viewer's timezone. |
| Repo | Private; GitHub Actions CI (light, fits free tier). |

## Architecture

npm-workspaces monorepo (tajweed conventions), but a **single Expo app** instead of separate mobile/web apps:

```
sabeel-institute-time-tracker/
├── package.json               # workspaces: packages/*, functions, app
├── tsconfig.base.json         # copy from tajweed (strict)
├── eslint.config.mjs          # copy from tajweed (flat config)
├── firebase.json              # functions + firestore + hosting(dist-web) + emulators; NO storage/remoteconfig/extensions
├── .firebaserc                # { "projects": { "dev": "<placeholder>" } }
├── firestore.rules / firestore.indexes.json
├── CLAUDE.md, README.md, TODO.md (human-only tasks), docs/
├── scripts/                   # emulator.sh, test-emulator.sh (from tajweed, --project demo-sabeel)
├── .github/workflows/ci.yml   # copy: lint / typecheck / unit / emulator tests
├── packages/shared/           # @sabeel/shared — types, time math, constants, entry validation
├── functions/                 # nodejs22 TS, Vitest unit + @firebase/rules-unit-testing integration
└── app/                       # @sabeel/app — Expo ~57, RN 0.86, react-native-web
    ├── app.json               # android package com.sabeelinstitute.timetracker; plugins: @react-native-google-signin
    ├── android/               # committed (local Gradle builds, no EAS)
    ├── App.tsx / App.web.tsx  # platform seams as needed (PineTimeCompanion pattern)
    └── src/…                  # React Navigation native-stack (as in PineTimeCompanion)
```

Key stack points:
- **Firebase JS SDK everywhere** (`firebase` package) — react-native-firebase doesn't support web. RN auth persistence via `initializeAuth` + `getReactNativePersistence` + `@react-native-async-storage/async-storage`.
- **Sentry** on all surfaces via a seam: `src/sentry.ts` (`@sentry/react-native`) / `src/sentry.web.ts` (`@sentry/react`); `@sentry/node` in functions with `defineSecret('SENTRY_DSN')` (copy `functions/src/sentry.ts` from tajweed).
- **Google sign-in seam**: `src/auth/google.ts` (native: `@react-native-google-signin/google-signin` → `GoogleAuthProvider.credential(idToken)` → `signInWithCredential`) / `google.web.ts` (`signInWithPopup`, redirect fallback).
- Functions region us-central1 with `invoker: 'public'` — copy `functions/src/setup.ts` verbatim (codifies a real gen-2 callable 403 fix).
- Web deploy: `npx expo export --platform web` → `app/dist-web` → Firebase Hosting with SPA rewrite.

Reference files to copy/adapt (all under `~/repos/faisal-shah/tajweed-bytes-dev/` unless noted): root `package.json` (shared-first build scripts), `tsconfig.base.json`, `eslint.config.mjs`, `.github/workflows/ci.yml`, `firebase.json`, `firestore.rules` (claims-helper style), `functions/src/setup.ts`, `functions/src/sentry.ts`, `functions/vitest.config.ts`, `scripts/emulator.sh`, `scripts/test-emulator.sh`; from `~/repos/faisal-shah/PineTimeCompanion/`: `App.web.tsx` + `.web.ts` seam pattern, React Navigation setup, web export scripts.

## Firestore data model

Flat `activities` collection (a project and an event are the same thing with a `type` field — hierarchy buys nothing at this scale).

```
users/{uid}
  displayName, email, photoURL
  status: 'pending' | 'active' | 'disabled'
  role: 'member' | 'manager'
  admin: boolean
  activeEntryId: string | null        # running clock session pointer
  createdAt, approvedAt?, approvedBy?

activities/{id}
  name, description?, type: 'project' | 'event'
  status: 'active' | 'archived', eventDate?, createdAt, createdBy

timeEntries/{id}                      # top-level: managers query across users
  uid, activityId, activityName       # name denormalized for display/CSV
  start, end: Timestamp | null        # end == null ⇒ running
  durationMinutes?: number            # set on close; ABSENT while running (excludes from sums)
  timeZone: string                    # IANA tz captured from device at creation (work-local)
  dayKey: string                      # 'YYYY-MM-DD' of start in `timeZone` — the bucketing key
  source: 'clock' | 'manual'
  note?, autoClosed?, createdAt, updatedAt, lastEditedBy?
```

**Timezone semantics** (Faisal's Singapore example is the spec): every entry carries the IANA timezone of the device that created it; `dayKey` is the local calendar date of `start` in that timezone, computed by a shared helper (`Intl.DateTimeFormat`-based, no date library). Timesheets and reports bucket by `dayKey` (string range queries), and times display in `entry.timeZone` with a tz label (e.g. "09:00–17:00 SGT") — so the manager in California sees Monday 9–5, not Sunday 9pm. Edits recompute `dayKey` via the same helper.

**Totals** (dashboard, lifetime): Firestore aggregation queries (`getAggregateFromServer` + `sum('durationMinutes')`) on the fly — no counter docs; effectively free at this scale and running sessions are excluded automatically.

**Indexes** (`firestore.indexes.json`): `timeEntries (uid, dayKey DESC)`, `(activityId, dayKey DESC)`, `(uid, activityId, dayKey DESC)`; `activities (status, name)`.

## Security rules (deny-by-default, tajweed style)

Roles via **custom claims** (`role`, `status`, `admin`) set only by the `setUserAccess` callable; user doc mirrors them for UI. Client refreshes token (`getIdToken(true)`) when its user doc disagrees with its claims.

- `users/{uid}`: self-create own doc forced to `{status:'pending', role:'member', admin:false, activeEntryId:null}`; read = self or manager; self-update limited via `diff().affectedKeys().hasOnly(['activeEntryId','displayName','photoURL'])`.
- `activities`: read = any active user; create/update = manager; delete = never (archive only).
- `timeEntries`: read = owner or manager; create = owner, validated (start ≤ end, 0 < duration ≤ 24h); clock-in create requires the same batch to set `users/{uid}.activeEntryId` (checked with `getAfter()`); update/delete = owner or manager, `uid` immutable.
- One-active-session enforced by the `activeEntryId == null` precondition at clock-in; the rare race is harmless under the honor system.

Rules tests with `@firebase/rules-unit-testing` (tajweed's exact harness).

## Cloud Functions (minimal)

1. `setUserAccess` (callable, **admin-only** — only admins approve/disable users or change roles) — writes user doc + custom claims atomically.
2. `exportCsv` (callable, manager) — filters `{uid?, activityId?, from, to}` (dayKey range), returns CSV string (well under the 10 MB callable limit).
3. `autoCloseStaleSessions` (scheduled hourly, Phase 6) — closes sessions running >12h at start+12h, `autoClosed: true`, clears pointer.
4. `syncToDrive` (scheduled nightly + manager-callable "sync now") — writes to a shared Drive folder via a **service account** (`googleapis` client, Sheets + Drive APIs):
   - Rewrites the live Google Sheet: an "Entries" tab (all closed entries: person, activity, local date, local start–end + tz, minutes, note, source) and summary tabs (per person lifetime/YTD, per activity per month).
   - On the 1st of each month, also drops an immutable `hours-YYYY-MM.csv` snapshot of the prior month into the folder.
   - Folder/spreadsheet IDs in function config; the service account only needs to be shared into that one folder (no domain-wide delegation).

Not functions: profile creation (client create under rules), totals (aggregation queries), statements (print view).

## Screens (one codebase — every screen works on every platform; everyone, managers included, is primarily on the phone, so all screens including manager tools are designed phone-first; web is the occasional big-screen/print surface)

- SignIn (Google button), Pending/Disabled gate screens
- Home: big Clock In/Out, activity picker, running-timer banner, today's total
- ManualEntry; Timesheet (day/week toggle, edit own entries); Account
- Manager: Users (pending approvals, roles), Activities (create/archive), Dashboard (totals per activity/person, week/month/year), Reports (filters → CSV), PersonDetail (lifetime hours + printable statement — web print CSS)

`packages/shared`: types, tz/dayKey/week-range helpers, `formatDuration`, entry validation mirroring the rules, collection-name and region constants.

## Phases (emulator-first; commit at each phase per working agreement)

- **Phase 0 — Repo + scaffold + CI.** Create private GitHub repo `sabeel-institute-time-tracker`, scaffold monorepo, copied configs, placeholder Firebase configs (committed placeholder `google-services.json` + `firebase-config.ts` so builds succeed), emulators boot, one trivial unit + rules test, CI green, hello-screen renders on `tb_emu` AVD **and** in the web export.
- **Phase 1 — Auth + approval.** Google sign-in seams (emulator-backed on web; device flow documented), self-created pending profile, gate screens, `setUserAccess` + claims + token-refresh-on-mismatch, Users screen. Rules tests: pending user locked out; self can't escalate.
- **Phase 2 — Activities.** Manager CRUD/archive, pickers. Rules tests for member-write denial.
- **Phase 3 — Time entry.** Clock in/out batches + `activeEntryId` + `getAfter` rules, manual entry with tz/dayKey capture, running indicator. Rules tests incl. one-active-session.
- **Phase 4 — Timesheets.** Day/week views via shared dayKey helpers; self-edit; manager corrections. Unit tests: dayKey/week math incl. DST transitions and a Singapore-entry-viewed-from-California case.
- **Phase 5 — Reporting.** Dashboard aggregations, `exportCsv` (emulator integration test with seeded entries), PersonDetail + printable statement.
- **Phase 5b — Drive sync.** `syncToDrive` sheet/CSV generation unit-tested against seeded emulator data (Sheets/Drive API calls behind a mockable seam); live verification happens in Phase 6 once the real service account exists.
- **Phase 6 — Polish + deploy.** `autoCloseStaleSessions` + long-session nudge, Sentry wiring, real Firebase project per TODO.md, release keystore + SHA-1s, `firebase deploy` (hosting + functions + rules), release APK.

## Verification

- Unit: Vitest in `functions/` and `packages/shared` (tz math especially).
- Rules/integration: `scripts/test-emulator.sh` → `firebase emulators:exec --project demo-sabeel`.
- Web: `expo start --web` (or export + serve) against emulators (`connectAuthEmulator` etc. behind an env flag); Playwright smoke later (PineTimeCompanion `web:e2e` pattern available).
- Android: build via `expo run:android` onto `tb_emu` (headless, `scripts/emulator.sh`), Firebase emulators reached at `10.0.2.2`; screenshot-verify via adb.
- CI: lint/typecheck/unit/emulator on every push (no Android build in CI, matching tajweed).

## Manual steps for Faisal (→ repo TODO.md; agent writes exact checklists, never touches consoles)

1. Create Firebase project (Blaze — required for Functions); enable **Google** as the only Auth provider; OAuth consent screen in GCP console.
2. Add Android app `com.sabeelinstitute.timetracker` with debug-keystore SHA-1 (+ release SHA-1 later); download `google-services.json` → `app/`.
3. Add Web app; paste client config into the committed config file; copy the **Web** OAuth client ID as `webClientId` (mobile Google Sign-In needs the *web* one — classic `DEVELOPER_ERROR` pitfall).
4. Sentry project + `firebase functions:secrets:set SENTRY_DSN`; web/app DSN in gitignored env.
5. Update `.firebaserc` with real project id; first deploy; seed first admin (sign in once, then a `scripts/grant.mjs`-style one-time promotion script run by Faisal).
6. Drive sync setup: enable Google Sheets + Drive APIs in the GCP project; create a service account; create the shared Drive folder in Workspace and share it (Editor) with the service-account email; put the folder ID in function config. (Agent writes the exact click-by-click checklist.)

## Risks / gotchas

- Android Google sign-in `DEVELOPER_ERROR` = SHA-1/webClientId/stale `google-services.json` — documented in TODO.md.
- Stale claims after approval → doc-vs-token mismatch triggers forced token refresh.
- `getAfter()` clock-batch rules are fiddly — heavy rules-test coverage in Phase 3.
- After adding the google-signin config plugin, run `expo prebuild --platform android` once, commit the `android/` diff, then avoid gratuitous prebuilds.
- Aggregation queries need the same composite indexes as their filters — declared up front; emulator surfaces gaps early.
- Firebase JS SDK on RN: must use `initializeAuth` with AsyncStorage persistence before any `getAuth()` call.
