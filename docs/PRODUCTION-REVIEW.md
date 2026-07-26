# Production-readiness review

Living checklist from the full static review on **2026-07-21**. The app is
already live, so these are **hardening items on an in-production system** — no
outage-level blockers were found. Work through them across sessions; update the
**Status** and the **Changelog** as items land.

**Status legend:** ⬜ open · 🟡 in progress · ✅ done · ⏭️ deferred (with reason) ·
❎ won't-fix (with reason)

Review method: static inspection of `firestore.rules`, `functions/src/**`,
`app/src/**`, `packages/shared/src/**`, config, and `npm audit`. **No emulator
was run.** Rules reasoning is by inspection, backed by the existing 85 emulator
tests (read, not re-run this session). See "Not verified" at the end.

---

## High

### H1 — No React error boundary ✅ done (v1.0.0-beta.15, 2026-07-22)
Shipped `app/src/components/ErrorBoundary.tsx` wrapping the whole app tree.
Verified by injecting a throw: the themed "Try again" fallback rendered AND the
error reached Sentry tagged `source: ErrorBoundary`, `handled: yes`.
A thrown error during render tears down the whole RN tree with no recovery — the
user is stuck on a blank screen until they force-quit. Most likely real-world
outage for a phone app fed live Firestore data of varying shape.
- **Where:** `app/App.tsx` (no boundary anywhere in `app/src`).
- **Fix:** an `ErrorBoundary` around the navigator with a "something went wrong —
  reload" fallback + `captureError` to Sentry.

---

## Medium

### M2 — `durationMinutes` not tied to `start`/`end`; reporting sums it ✅ done (2026-07-22)
Rule bound added; emulator-verified (inflation rejected, 90s→2 accepted).
**Pre-flight ran against prod before the rules deploy: 0 violators / 32 entries**,
so no live document was locked out.
Rules validate `durationMinutes` only as `1..1440`, independent of the times, and
reporting sums it. A modified client could write times 1 min apart with
`durationMinutes: 1440` and, if an approver isn't careful, inflate official
hours. Honor-system-with-approval defense-in-depth (an approver would see the
row's times contradict its duration).
- **Where:** `firestore.rules:150-155`; summed in `functions/src/reporting.ts:157`
  and `functions/src/driveRows.ts`.
- **Fix:** enforce `durationMinutes` within ±1 of `(end-start)/60000` in the rule
  (allow for the client's `Math.round`).
- **Verify in emulator:** legitimate rounded durations still pass across boundary
  cases (e.g. 30-second rounding).

### M3 — Admins who aren't managers can't run reports / manage activities ✅ done (2026-07-22)
Broadened to `manager || admin`: `requireManager`→`requireManagerOrAdmin` (3 call
sites), activities rules, and the UI gates (reuse the existing `isApprover`). All
deployed; unit + rules tests added.
`exportCsv`/`reportTotals` all `requireManagerOrAdmin`, and the UI gates
Reports/Activities/PersonDetail on `role === 'manager'`. The org's admins
(`sameera@`, `faisal.shah@oursabeel.com`) are `member` + `admin`, so they can
approve timesheets and manage users but **cannot see any report or the activity
list.** Likely a surprise for people who expect "admin sees everything."
- **Where:** `functions/src/reporting.ts:177,189`, `functions/src/drive.ts:169`;
  UI gates in `HomeScreen.tsx` / `App.tsx`.
- **Fix (policy call — Faisal):** either grant those accounts `manager` too, or
  broaden the gate to `manager || admin`.

### M4 — CSV formula injection in exported/synced CSVs ✅ done (2026-07-22)
`csvCell` prefixes leading `=+-@`/tab/CR with `'`. Unit-tested; deployed.
`csvCell` only quotes cells containing `" , \n`. A user-controlled `note`,
`activityName`, `displayName`, or `email` starting with `= + - @` is written raw
and executes as a formula when the monthly `hours-YYYY-MM.csv` (Drive) or a
downloaded export is opened in Excel. The live Google Sheet is safe (`RAW`
input); CSV files only.
- **Where:** `functions/src/reporting.ts:74-77` (`csvCell`).
- **Fix:** prefix at-risk cells (leading `=+-@`, tab, CR) with `'`.

### M5 — A manager can be their own approver and self-approve ✅ by design (Faisal, 2026-07-25)
**Resolved as policy, not as a defect.** Managers and admins alike may be their
own approver. Flexibility is worth more than enforced second-party review at this
org size and trust level, and self-approval is the only escape from a real dead
end: a manager with no eligible approver — the sole manager, or one whose approver
account was removed (this happened on 2026-07-19) — cannot submit at all.
- **Revisit trigger:** if managers/admins grow beyond Faisal's immediate circle,
  or volume makes self-review non-obvious. The lever is one clause:
  `av != request.auth.uid` on the self-update `approverOk` path
  (`firestore.rules:91-96`), which would leave admin self-approval intact via
  `stampOk`'s admin clause.
- **Landed 2026-07-25:** the client filters that had been enforcing the *old*
  policy alone are gone (`HomeScreen.tsx`, `UsersScreen.tsx`); self is now listed
  last in the picker so choosing it stays deliberate. Rules and UI had disagreed
  since launch — the rules always permitted this — which is the worst state to
  leave a policy in.
- **Audit trail is intact:** `decidedBy`/`decidedAt` record every decision, so a
  self-approval is identifiable after the fact. Nothing surfaces it in the UI;
  that is a deliberate omission, not an oversight.
- **What self-approval does NOT weaken:** the submitted-period freeze.
  `canTouchPeriod` (`firestore.rules:57-63`) excludes the owner outright before it
  considers who the approver is, so a self-approver still withdraws rather than
  editing a submitted week in place. Pinned by an emulator test.

### M5b — An approver's authority outlived their role ✅ done (2026-07-25)
Found while formalising M5. `approverUid` was validated only when **written**
(`approverOk`), never afterwards: the DECIDE branch checked identity alone, so a
manager who was demoted or disabled kept deciding every sheet still stamped to
them — their own included, once self-approval is allowed. Dangling pointers also
outlived deleted accounts (hand-fixed once, 2026-07-19).
- **Fixed in two places.** `firestore.rules` DECIDE now requires the stamped
  approver to be a *current* `isManager()` (admins unaffected). `applyUserAccess`
  clears every `approverUid` pointing at an account that loses eligibility
  (demotion, disable, admin revoked from a non-manager), the account's own
  self-pointer included.
- **Verified in emulator:** demoted and disabled approvers rejected, admin still
  decides, promotion leaves pointers alone, self-pointer cleared on demotion.

### M6 — No web security headers ✅ done (2026-07-22)
Added `X-Frame-Options: SAMEORIGIN` (**not `DENY`** — DENY blocks Firebase Auth's
same-origin iframe and would break redirect sign-in), `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`. Live-verified the
sign-in page loads with no framing/CSP/console errors. (Full CSP left as a
separate, carefully-tested follow-up. Real-account OAuth popup is a residual
manual check.)
`firebase.json` sets only `Cache-Control`. No `X-Frame-Options`/`frame-ancestors`
(clickjacking), `X-Content-Type-Options: nosniff`, or `Referrer-Policy`.
- **Where:** `firebase.json` hosting `headers`.
- **Fix:** add `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin` (optionally a CSP).

### M7 — Production index probe is incomplete ✅ done (2026-07-22)
Added approval-queue, needs-attention, and approver-choices shapes.
`probeQueries` against prod returns OK for all 10 shapes.
The probe that catches missing/mis-directed composite indexes (the July-16
stale-week cause) omits live query shapes: approver-choices
`or(role==manager, admin==true)` (`users.ts:31`), approval queue
`(approverUid, status)` (`timesheets.ts:168`), rejected sheets `(uid, status)`
(`timesheets.ts:187`). Indexes are declared, but a future mis-edit wouldn't be
caught.
- **Where:** `functions/src/probe.ts`.
- **Fix:** add those three shapes.
- **Verify in emulator/prod:** re-run `probeQueries` after adding them.

---

## Low

### L8 — One high-severity transitive vuln ✅ done (2026-07-22)
`npm audit fix` patched `fast-xml-parser` (lockfile only); audit now shows only
moderate.
`fast-xml-parser` (DOCTYPE entity-expansion DoS), reached via `googleapis` —
which was removed entirely with the Drive sync on 2026-07-25. (Other 22 are
moderate Expo/RN noise.)
- **Fix:** `npm audit fix`, then re-test.

### L9 — Drive sync reads the entire `timeEntries` collection every run ❎ moot (2026-07-25)
The Drive sync was removed entirely, taking this with it.

### L10 — Public-invoker callables have no rate limiting ❎ accepted (2026-07-22)
`maxInstances: 10` caps cost; auth enforced in-code.
`setup.ts` `invoker: 'public'` (documented workaround). Unauthenticated calls fail
in-code but still spin instances; `maxInstances: 10` caps cost. Acceptable; noted.

### L11 — `dayKey` not validated against `start`+`timeZone` in rules ❎ accepted (2026-07-22)
Inherent (rules can't do IANA tz math); honor model + approver review.
Inherent (rules can't do IANA tz math), so `dayKey`/`periodKey` are a trust
boundary the honest client fills and the approver reviews. Document as a known
limit of the honor model.

---

## Verified solid (on record, no action)

- **Period math ↔ rules** (`periodKeyFor` vs `periodKeyOf`): epoch-day/`dowSun0`
  derivations match, month-clipping agrees, property-tested 2024–2027. Linchpin
  of the lock model; holds.
- **Timesheet lifecycle rules:** correct `hasOnly` guards; stamp checks use
  `resource` not `request.resource`; client writes match allowed key sets.
- **Reporting integrity:** totals recompute from approved entries; the
  client-supplied `totalMinutes` snapshot is display-only (hence M2 targets the
  *entry* `durationMinutes`, not the snapshot).
- **Disable propagation:** `isStale → poll` in `session.ts` force-refreshes the
  token when the profile doc diverges from claims, so an online user re-gates
  promptly. Residual: a manual token-replay within the ≤1h TTL (low).
- **`useLiveQuery`/`useLiveDoc`**, auth seams, `guarded()` (rethrows, excludes
  HttpsError from Sentry, flushes), secret hygiene (`debug.keystore` intentional;
  no real secrets tracked), callable auth guards.

---

## Not verified this session
Static review only — no dynamic rules execution, no index build, no load test, no
supply-chain/license audit. Emulator was intentionally not run (shared machine).

### Emulator checklist (run when the machine is free)
1. Rules `get()` budget on a cross-period entry edit (approver moving an entry
   between two submitted periods) stays under the 10-access limit.
2. The `or()` approver query executes without demanding an undeclared index.
3. M2 fix (if applied) still passes legitimate rounded durations.
4. M5 fix (if applied) blocks manager self-stamp, keeps admin self-approve, and
   lets already-stamped sheets decide.
5. Full `npm run test:emulator` + `npm run test:e2e` after any rule change; re-run
   `probeQueries` once M7 shapes are added.

---

## Changelog
- 2026-07-21 — Initial review; H1, M2–M7, L8–L11 opened.
- 2026-07-22 — Executed the hardening plan. H1/M2/M3/M4/M6/M7/L8 fixed and
  deployed (backend+web + APK v1.0.0-beta.15); M5 won't-fix; L9 deferred;
  L10/L11 accepted. Full suites green (33 shared, 23 functions unit, 88
  emulator, e2e); prod verified (probe all-OK, headers live, sign-in clean,
  M2 pre-flight 0 violators).
