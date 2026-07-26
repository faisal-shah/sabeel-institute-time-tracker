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
| 5b | Drive sync (Sheet + CSV snapshots) | **removed 2026-07-25** — see the decision log |
| 6 | Polish + deploy readiness | **complete** (2026-07-15: auto-close + nudge, Sentry seams, deploy/secrets docs) |
| 7 | Weekly timesheets: submit/approve workflow | **complete** (2026-07-16: full lifecycle e2e green; deployed to prod; greenfield wipe done — 2 test users + 8 docs removed, admin kept, approver=self) |
| 8 | Push notifications (FCM) + overlap guard + activities rename | **complete** (2026-07-17: triggers for submit/decide/new-user + Tuesday-local weekly reminder w/ per-event prefs; overlap detection blocks submission; project/event distinction dropped; 85 emulator + 17 functions-unit + 33 shared tests + full e2e green) |

## Deploy log

- 2026-07-16 — **First live deploy** to `sabeel-institute-time-tracker`. Firestore
  rules + indexes, all 6 Cloud Functions (us-central1, nodejs22), and Hosting
  (https://sabeel-institute-time-tracker.web.app, HTTP 200). Functions are now
  bundled with esbuild (commit de32168) so Cloud Build resolves the private
  `@sabeel/shared` workspace package. First admin (faisal.shah@gmail.com) promoted via a
  temporary one-shot bootstrap function (deployed, called, deleted). OAuth consent
  screen is **published** (any Google account can sign in; app admin-approval
  gates access). **Pending:** the release keystore/SHA-1 for a shareable Android
  APK — see `TODO.md`.

- 2026-07-16 — **Phase 7 deploy**: indexes → rules → functions → one-time
  token-guarded `wipeForTimesheets` (deployed, curled once, deleted) → hosting.
  `web:export` now always `--clear`s Metro's cache (it can serve a bundle built
  under different `EXPO_PUBLIC_*` env — an emulator-mode bundle must never ship).
  Live smoke: prod sign-in page clean, no dev row, no console errors.

## Decision log

- 2026-07-26 — **Notification taps route to the screen they are about.** Every
  push now carries its destination, encoded once in `@sabeel/shared` as flat
  string key/values and shipped over both transports: an FCM `data` map on
  Android, the query string of `webpush.fcmOptions.link` in the browser (a web
  push click can only open a URL). A tapped route is **queued** until the
  navigator is ready and the session is known — a cold-start tap lands seconds
  before auth resolves — and dropped if the destination is an approver-only
  screen the account no longer has. Screens that seed state from a param
  (`Timesheet`, `TimesheetReview`) now re-anchor when the param changes;
  `navigate()` to a mounted screen swaps params without remounting, so without
  that a second tap left you on the previous week. Verified on the AVD with a
  local notification carrying the same payload: cold start (process killed),
  warm tap, re-target of a mounted screen, and a plain launch that must NOT
  route. Web transport is covered in `web-e2e` (right week, approver-only route
  dropped for a member, query stripped, garbage → Home). FCM's own hop remains
  the one untestable link.
- 2026-07-26 — **Shipped: v1.0.0-beta.23** (both hardening passes). Deployed
  `firestore:rules,firestore:indexes,functions,hosting`; `onTimesheetWritten`
  created, so timesheet history starts accruing from this deploy — transitions
  before it are unrecoverable. APK verified production-mode on the AVD, GitHub
  release + public download page published, hosting redeployed from the release
  commit so the web and APK build stamps match (`1f1aa60`). `probeQueries`
  all-OK in prod across 12 shapes, including the two new `users` ones.
- 2026-07-26 — **Second hardening pass (A1–A8), emulator-driven.** Prompted by
  M5b: if one "validated once, never revisited" bug existed, how many more?
  Hypotheses were **run against the rules**, not reasoned about — ten probes,
  eight confirmed gaps. Fixed: on-behalf entries stamped the *writer's* timezone
  instead of the target's (A1, straight contradiction of the work-local
  invariant); `closeStaleSessions` could rewrite an approved timesheet's hours
  silently, since the admin SDK bypasses the period lock (A2); withdraw/reopen
  **deleted** the doc and with it the record that a period was ever approved —
  now an append-only `timesheetEvents` written by a trigger (A3); losing access
  didn't revoke refresh tokens (A4); the weekly reminder skipped users with no
  timezone in silence (A5); a batch of rules gaps confirmed permitted before
  being closed (A6); overlap detection couldn't see overnight collisions (A7);
  session snapshots could emit out of order (A8). L11 upgraded from "accepted,
  inherent" to a real bound — rules can't do tz math, but they *can* require
  `start` to lie within [dayKey − 14h, dayKey + 36h), which covers every UTC
  offset. **That check immediately exposed a year of drift in our own fixtures**
  (`T0` was 2025-07-15 paired with 2026 dayKeys). Details and residuals in
  `docs/PRODUCTION-REVIEW.md`. 111 emulator + 47 unit + e2e green.
- 2026-07-25 — **Self-approval formalised; approver authority now expires with the
  role.** Managers and admins alike may be their own timesheet approver
  (PRODUCTION-REVIEW **M5**, flipped from ❎ won't-fix to ✅ by design): flexibility
  beats enforced second-party review at this org size, and it is the only exit
  from having no eligible approver — the dead end hit for real on 2026-07-19.
  Rules had *always* permitted it; only two client filters enforced the old
  policy, so rules and UI disagreed. Filters removed; self now sorts last in the
  picker, labelled "(myself)", so choosing it stays deliberate. Deliberately NOT
  changed: the admin-only auto-fallback (self-approval is chosen, never
  defaulted), and the submitted-period freeze — `canTouchPeriod` excludes the
  owner outright, so a self-approver still withdraws rather than editing in place
  (now pinned by a test, with a positive control). **Bug found and fixed in the
  same batch (M5b):** `approverUid` was validated only when written, never again,
  so a demoted or disabled manager kept deciding every sheet stamped to them —
  their own included. DECIDE now revalidates `isManager()`, and `applyUserAccess`
  clears every pointer at an account losing eligibility (self-pointer included),
  the same orphan class that had to be hand-cleaned on 2026-07-19. 8 new emulator
  tests (98 total, green).
- 2026-07-25 — **Native Firestore disaster recovery enabled** (replaces the Drive
  sync as the actual safety net). Two complementary layers, both Google-managed,
  no code to rot:
  - **PITR** — rolling **7-day** rewind to any microsecond. Covers "someone
    deleted it this morning."
  - **Weekly scheduled backup, Mondays, 98-day (14-week) retention** — the
    maximum Firestore allows. Covers "we noticed in September that something
    broke in July."
  Cost is negligible at this data size (~200 KB), but note PITR/backup data are
  **excluded from the free tier**, so they appear as (sub-cent) billed line items.
  Beyond 14 weeks Firestore cannot retain natively — an export to Cloud Storage
  would be needed; deliberately deferred, with a manual pre-summer archive as the
  cheap alternative. **Known gap:** nothing yet *detects* a problem, so discovery
  can still outrun retention — **closed the same day** by the `healthCheck`
  canary (`functions/src/health.ts`): a daily document-count check that raises to
  Sentry on an unexpected drop, plus a Sentry cron check-in so the job's own
  silence alerts. Thresholds live in `DROP_RULES`; see `docs/DEPLOY.md`.
  **Delete protection ENABLED** too — the whole database cannot be deleted
  without explicitly disabling it first.
- 2026-07-25 — **Google Drive sync removed entirely** (Phase 5b reverted). It was
  a *mirror*, not a backup: one live Sheet rewritten nightly (so a deletion
  propagated within 24h), approved-hours-only, and covering time entries alone —
  no users/activities/timesheets. A weekly timestamped full-snapshot design was
  scoped and then dropped in favour of removing the feature rather than leaving a
  half-useful one lingering. Deleted: `drive.ts`, `driveRows.ts`, their two test
  suites, `syncToDrive`/`syncDriveNow` (also deleted from production), the
  `googleapis` dependency, `DRIVE_*` config, the Reports "Sync to Google Drive
  now" button, and the e2e beat. **Kept:** in-app CSV export, report totals and
  person statements — those are reporting, not backup. Undo steps for the Drive
  folder/service-account share are in `TODO.md`. Replaced the same day by native
  Firestore protection (below) — which is what a backup should have been.
- 2026-07-24 — **Greenfield cleanup pass** (auth architecture + reporting dedup).
  Standing principle recorded in CLAUDE.md: no backwards-compat; converge on the
  global-optimal, never band-aids. **Auth/provisioning made server-authoritative**
  (kanban parity): the `onUserCreate` trigger is now the SOLE provisioner (sets
  pending claims + creates the doc via the pure `decideProvision`, or deletes a
  non-org account); `firestore.rules` users `allow create: if false` and the
  `isOrgEmail()` helper is deleted — the domain check lives once, in shared
  `isAllowedEmail`. The client (`session.ts`) is now a watch-only state machine
  (`loading/signedOut/provisioning/notProvisioned/signedIn`) that un-gates on a
  `claimsUpdatedAt` stamp instead of a 3s poll, with a real "can't sign in" screen
  for rejected accounts. New `provision`/`authTrigger` tests; the rules
  self-registration tests collapse to "client create denied". **Reporting dedup:**
  one `ReportFilter`/`Totals` contract + one `REPORT_COLUMNS`/`reportRow`
  projection in `@sabeel/shared`, consumed by the client and the CSV export
  (removed the drifted hand-mirrors). Plus stale doc/comment fixes.
- 2026-07-24 — **Sign-in restricted to the @oursabeel.com domain** (deployed).
  Mirrors the sibling kanban app. A gen-1 `onUserCreate` auth trigger
  (`functions/src/authTrigger.ts`) deletes any account whose verified email is
  not `@oursabeel.com`; `firestore.rules` gains `isOrgEmail()` and gates user
  self-registration on it (defense-in-depth so a non-org account can't even
  create an orphan pending doc); the client passes Google an `hd`/`hostedDomain`
  hint (UX only). `isAllowedEmail` lives in `@sabeel/shared` (exact-domain match,
  unit-tested). Dev/e2e sign-in emails moved to `@oursabeel.com` since the gate
  applies against the emulator too. Rules + trigger deployed; 91 emulator tests
  (incl. new domain-gate cases) + full e2e green. **Also this session:** removed
  the 5 remaining non-org (test/personal) accounts completely — auth, profiles,
  entries, timesheets, push tokens — via a temp deploy→curl→delete function, and
  set khadija (whose approver was a removed account) to self-approve. Roster is
  now 8 `@oursabeel.com` accounts, 4 of them admins.
- 2026-07-22 — **Responsive wide/desktop layout** (client-only, not yet released).
  The phone-first web surface no longer renders as a stretched phone on a laptop.
  Keyed off available WIDTH, never platform (`app/src/theme/layout.ts`, `useLayout`,
  700px breakpoint — matches the sibling kanban app). `Button` de-stretches to hug
  its label on wide (full-width bar stays on phone); `Screen` gained a
  `width` variant (`read` 640 / `content` 840 / `list` 1160 / `full`) that caps and
  centres the column; `CardGrid` flows the Users/Approvals/Needs-attention cards
  into multiple columns on desktop, one column on a phone; native date/time inputs
  hug their value (`fieldSizing`). Verified at 1500px and 420px past auth; phone
  layout unchanged (full e2e green). Ships in the next APK/hosting release on
  Faisal's go.
- 2026-07-22 — **Production hardening (v1.0.0-beta.15)** from the 2026-07-21
  review (`docs/PRODUCTION-REVIEW.md`): React error boundary (H1); rules tie
  `durationMinutes` to the logged span (M2); admin implies full manager access —
  reports/activities (M3); CSV formula-injection guard (M4); web security headers
  (`X-Frame-Options: SAMEORIGIN` etc., M6); completed the index probe (M7); patched
  a high transitive vuln (L8). M5 (manager self-approve) is **won't-fix** for a
  very small org; L9 deferred; L10/L11 accepted. No outage blockers — the app was
  already live.
- 2026-07-21 — **Brand palette → "Option 1"** and theme restructured to match the
  kanban app. Raspberry #82163A→#83114F (brick red→plum), gold #D09749→#C6A15B.
  Flat `app/src/theme.ts` replaced by `app/src/theme/{palette,index}.ts` (raw
  values + semantic tokens + `useTheme()`/`getTheme()`); ~19 import sites and the
  print stylesheet + manual-PDF generator migrated. No dark mode (light-only,
  pinned). Hardcoded colors now ESLint-banned under `app/**` (theme + print
  exempt). Authority: `docs/BRAND.md` and the shared `sabeel-color-scheme` skill.

## Decision log

- 2026-07-15 — Approval is **admin-only** (Faisal): no org-domain auto-approval;
  every new sign-in is pending; admins see name+email when approving. Managers are
  operational only (activities, reports, entry corrections).
- 2026-07-15 — Phone-first for everyone including managers; web = big screen/print.
- 2026-07-16 — **Timesheet workflow supersedes the honor system** (Phase 7):
  Sun–Sat calendar-week periods clipped to month boundaries; users submit each
  period; a sticky self-chosen approver (any active manager/admin; assignable by
  managers/admins too, stamped at submission) approves or rejects with reason;
  approved = locked, admin-only reopen (delete = back to draft); zero-hour submits
  OK, mid-period submit of the current week OK, never future periods; reporting/
  CSV reporting counts approved timesheets only (manager opt-in unofficial view).
- 2026-07-16 — Admin grants move in-app (Manage users); self-demotion still
  blocked server-side. Greenfield wipe at deploy: all data + users except the
  admin.
- 2026-07-17 — **Activities are just names**: the project/event `type` field is
  gone from UI, rules, and types (existing docs may carry a vestigial field —
  ignored). Admins/managers encode whatever taxonomy they want in the name.
- 2026-07-17 — **Notifications (Phase 8)**: FCM push on Android + web; events =
  rejected/approved (owner), submitted/resubmitted (stamped approver), new
  pending account (admins), plus a submit reminder covering the previous
  period — first at Tuesday 10:00 local time, then daily until submitted
  (2026-07-17 refinement) — sent only when the period has unsubmitted hours or
  a rejected sheet. Per-event opt-outs (`notifPrefs`, missing = on)
  with the reminder separately silenceable. Same-day overlapping entries are
  flagged in the UI and block submission (back-to-back is fine) — client-side
  only; approvers see the same highlight.
