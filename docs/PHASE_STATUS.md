# Phase status

Live build status. Phases from `docs/PRODUCT_BRIEF.md`; commit lands at each
phase boundary.

| Phase | What | Status |
|---|---|---|
| 0 | Repo + monorepo scaffold + CI green | **complete** (2026-07-15: CI green, 22 tests, hello screen verified on tb_emu AVD + web export) |
| 1 | Google auth + admin approval of users | **complete** (2026-07-15: web e2e + Android emulator verified; live claims-refresh un-gating works) |
| 2 | Activities CRUD | **complete** (2026-07-15: rules tests + web e2e) |
| 3 | Time entry (clock + manual) | **complete** (2026-07-15: 11 new rules tests + e2e clock/manual flow) |
| 4 | Timesheets (day/week) | **complete** (2026-07-15: epochFor tz tests + e2e edit/delete flow) |
| 5 | Reporting + CSV + statements | **complete** (2026-07-15: reporting integration tests + e2e CSV download + statement) |
| 5b | Drive sync (Sheet + CSV snapshots) | **complete** (2026-07-15: driveRows unit + runSync integration tests + full e2e green) |
| 6 | Polish + deploy readiness | **complete** (2026-07-15: auto-close + nudge, Sentry seams, deploy/secrets docs) |
| 7 | Weekly timesheets: submit/approve workflow | **complete** (2026-07-16: full lifecycle e2e green; deployed to prod; greenfield wipe done — 2 test users + 8 docs removed, admin kept, approver=self) |

## Deploy log

- 2026-07-16 — **First live deploy** to `sabeel-institute-time-tracker`. Firestore
  rules + indexes, all 6 Cloud Functions (us-central1, nodejs22), and Hosting
  (https://sabeel-institute-time-tracker.web.app, HTTP 200). Functions are now
  bundled with esbuild (commit de32168) so Cloud Build resolves the private
  `@sabeel/shared` workspace package. Drive sync deployed as a safe no-op (no
  `functions/.env` yet). First admin (faisal.shah@gmail.com) promoted via a
  temporary one-shot bootstrap function (deployed, called, deleted). OAuth consent
  screen is **published** (any Google account can sign in; app admin-approval
  gates access). **Pending:** Drive service-account wiring (`functions/.env`) and
  the release keystore/SHA-1 for a shareable Android APK — see `TODO.md`.

- 2026-07-16 — **Phase 7 deploy**: indexes → rules → functions → one-time
  token-guarded `wipeForTimesheets` (deployed, curled once, deleted) → hosting.
  `web:export` now always `--clear`s Metro's cache (it can serve a bundle built
  under different `EXPO_PUBLIC_*` env — an emulator-mode bundle must never ship).
  Live smoke: prod sign-in page clean, no dev row, no console errors.

## Decision log

- 2026-07-15 — Approval is **admin-only** (Faisal): no org-domain auto-approval;
  every new sign-in is pending; admins see name+email when approving. Managers are
  operational only (activities, reports, entry corrections).
- 2026-07-15 — Phone-first for everyone including managers; web = big screen/print.
- 2026-07-15 — Drive sync scope: live Google Sheet + monthly CSV snapshots via
  service account in a shared folder.
- 2026-07-16 — **Timesheet workflow supersedes the honor system** (Phase 7):
  Sun–Sat calendar-week periods clipped to month boundaries; users submit each
  period; a sticky self-chosen approver (any active manager/admin; assignable by
  managers/admins too, stamped at submission) approves or rejects with reason;
  approved = locked, admin-only reopen (delete = back to draft); zero-hour submits
  OK, mid-period submit of the current week OK, never future periods; reporting/
  CSV/Drive count approved timesheets only (manager opt-in unofficial view).
- 2026-07-16 — Admin grants move in-app (Manage users); self-demotion still
  blocked server-side. Greenfield wipe at deploy: all data + users except the
  admin.
