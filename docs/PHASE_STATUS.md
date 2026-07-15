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

## Decision log

- 2026-07-15 — Approval is **admin-only** (Faisal): no org-domain auto-approval;
  every new sign-in is pending; admins see name+email when approving. Managers are
  operational only (activities, reports, entry corrections).
- 2026-07-15 — Phone-first for everyone including managers; web = big screen/print.
- 2026-07-15 — Drive sync scope: live Google Sheet + monthly CSV snapshots via
  service account in a shared folder.
