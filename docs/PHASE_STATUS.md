# Phase status

Live build status. Phases from `docs/PRODUCT_BRIEF.md`; commit lands at each
phase boundary.

| Phase | What | Status |
|---|---|---|
| 0 | Repo + monorepo scaffold + CI green | **complete** (2026-07-15: CI green, 22 tests, hello screen verified on tb_emu AVD + web export) |
| 1 | Google auth + admin approval of users | pending |
| 2 | Activities CRUD | pending |
| 3 | Time entry (clock + manual) | pending |
| 4 | Timesheets (day/week) | pending |
| 5 | Reporting + CSV + statements | pending |
| 5b | Drive sync (Sheet + CSV snapshots) | pending |
| 6 | Polish + deploy readiness | pending |

## Decision log

- 2026-07-15 — Approval is **admin-only** (Faisal): no org-domain auto-approval;
  every new sign-in is pending; admins see name+email when approving. Managers are
  operational only (activities, reports, entry corrections).
- 2026-07-15 — Phone-first for everyone including managers; web = big screen/print.
- 2026-07-15 — Drive sync scope: live Google Sheet + monthly CSV snapshots via
  service account in a shared folder.
