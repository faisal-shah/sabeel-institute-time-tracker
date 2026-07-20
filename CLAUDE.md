# Sabeel Institute Time Tracker — Working Rules for Claude

## What this project is
Hours tracking for Sabeel Institute (small nonprofit): clock in/out + manual entries
against projects/events, admin-approved Google sign-in, honor-system hours, reports,
and a Google Drive sync. Source of truth: `docs/PRODUCT_BRIEF.md` (decisions & data
model) and `docs/PHASE_STATUS.md` (live build status). Faisal is the developer; the
nonprofit's staff are the admins/managers in the app.

Key product invariants (do not silently change):
- **General-purpose time tracker** — nothing volunteer-specific in the data model.
- **Google sign-in only**; every new account (org domain included) lands `pending`;
  **only admins** approve/disable users or change roles.
- **Honor system** — entries count immediately; managers may edit/correct.
- **Work-local timezones** — entries bucket/display in the timezone where the work
  happened (`timeZone` + `dayKey` on each entry), never the viewer's.
- **Phone-first for everyone** — managers included; web is the big-screen/print surface.

## Stack (locked)
- One Expo codebase (`app/`): Android (local Gradle builds, committed `android/`,
  NO iOS, NO EAS) + web via react-native-web (`expo export --platform web` →
  Firebase Hosting). Platform seams as `.web.ts(x)` siblings.
- Firebase **JS SDK on all surfaces** (not react-native-firebase — no web support).
- Backend: Cloud Functions (TS, nodejs22, us-central1) + Firestore. No Storage,
  no email in v1. Sentry web/native/functions.
- Monorepo (npm workspaces): `app`, `functions`, `packages/shared`. Shared types +
  ALL timezone math live in `@sabeel/shared` — never do ad-hoc date math elsewhere.
- Config-as-code: rules/indexes deploy from the repo, never console-edited.

## Dev & test loops
**Read `docs/DEV-TOOLING.md` before debugging the harness or cutting a release** —
it records which failures are environmental and what each script guards against.
- Unit: `npm test` (Vitest: functions + shared).
- Rules/integration: `npm run test:emulator` (needs JDK 21; wraps
  `firebase emulators:exec --project demo-sabeel`).
- Android: `scripts/emulator.sh headless` (AVD `tb_emu`, Google-APIs image), then
  `npx expo run:android` in `app/`. Firebase emulators from the AVD = `10.0.2.2`.
  There are NO physical devices — emulator only; verify UI by adb screenshot.
- Releases: `npm run release -- <version> --notes FILE` (bumps all four version
  files, rebuilds the manual PDF, builds both APK variants, verifies the
  production bundle on the AVD, publishes to GitHub). Never hand-bump versions.
- If a suite fails, first ask whether it fails on **stashed changes too** — a
  clean-HEAD repro means the cause is environmental (usually a leftover
  emulator: `npm run emulators:free`), not your diff.
- Dead code: `npm run knip` (CI-enforced). Its false positives in this stack are
  documented in `docs/DEV-TOOLING.md` — check there before deleting anything.
- Web: `npx expo start --web` in `app/` (emulator-backed via env flag).
- CI (GitHub Actions): lint + typecheck + unit + emulator tests on every push. Keep
  it green. No deploys from CI.

## Secrets (zero tolerance)
- NEVER ask for, accept, or echo real API keys/DSNs/tokens in chat; never hardcode
  them. Server secrets: output the exact `firebase functions:secrets:set NAME`
  command for Faisal to run. Client-side non-secrets (Firebase web config) are
  committed; client DSNs go in gitignored `.env.local` (key names only in docs).

## Division of labor
- Agent: all code, rules, indexes, tests, emulator runs, CI, exact click-by-click
  console checklists, diagnosing pasted logs.
- Faisal only: third-party consoles (Firebase/GCP/Sentry), OAuth/SHA-1 registration,
  the Workspace Drive folder + service account, anything with production secrets.
  Everything Faisal must do himself is tracked in `TODO.md` — keep it current.

## Conventions
- Commit at phase boundaries (see docs/PHASE_STATUS.md); work autonomously within a
  phase. Before ANY significant install (global/system/major framework), ask first;
  routine project-local npm deps of the locked stack are fine.
- All repo artifacts (docs, plans, protocols) live in this repo.
- User-visible changes ship with their documentation: update `docs/USER-MANUAL.md`
  (+ regenerate affected `docs/manual/img/` screenshots and the PDF via
  `docs/render-manual.py`) and PRODUCT_BRIEF/PHASE_STATUS in the same batch as
  the code — never let the manual lag a release.
- Live Firestore reads in `app/src` go through `useLiveQuery`/`useLiveDoc`
  (`app/src/liveQuery.ts`) — never hand-roll `onSnapshot` state (lint-enforced;
  see docs/POSTMORTEM-2026-07-16-stale-week.md). Async UI must be e2e-tested at
  least once under injected latency, not just localhost speed.
