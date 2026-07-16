# Postmortem: stale entries shown under the wrong week (2026-07-16)

## What happened

Hours after the Phase 7 deploy, Faisal (on a phone) switched between weeks on the
timesheet screen and saw the **previous week's entries rendered under the newly
selected week** — in both directions: a full week's entries appeared under an
empty week (an entry dated `2026-07-15` displayed under "Jul 5 – Jul 11"), and an
empty week's nothingness blanked the current week ("Jul 12 – Jul 18 · 0m · No
hours" while a submitted 8h entry existed). Screenshots in the session log
confirmed both. No data was wrong — only its presentation.

## Root cause

Every live hook stored Firestore listener results in `useState`. React state
**persists across dependency changes**: when the week (query inputs) changed, the
effect tore down the old listener and attached a new one, but the *old results
stayed in state* until the new query's first snapshot arrived. On localhost that
gap is milliseconds; on a phone's connection it is seconds — or, with a stalled
WebChannel, forever. Whatever week you looked at last "bled" into the next.

## Five whys

1. **Why did users see another week's entries?**
   The screen rendered the previous query's rows until the new query's first
   snapshot arrived, and on a real mobile connection that arrival lagged or
   stalled — so "until" was seconds-to-indefinitely.

2. **Why did the previous rows survive the week switch?**
   Each hand-rolled hook kept results in `useState`, which React persists across
   dependency changes; the re-subscribing effect never reset it. The same latent
   flaw existed in every copy of the pattern (entries, timesheets, users,
   activities).

3. **Why did no test catch it?**
   There was no layer where the flaw was observable: unit tests don't render
   hooks; rules/integration tests bypass the UI entirely; and the browser e2e
   runs against localhost emulators where snapshots land in single-digit
   milliseconds — the stale window was invisible. On top of that, the e2e never
   switched weeks at all: it only ever looked at the current period.

4. **Why did the e2e only exercise the current period on a fast network?**
   E2E scenarios were written as mirrors of the happy-path product story
   (log → submit → approve), not as adversarial interaction probes (moving
   between data-full and data-empty views). Network latency was never treated as
   a test input — even though the harness already special-cased
   "WebChannelConnection transport errored" console noise, a standing hint that
   transport variability is real in this stack.

5. **Why was the risky pattern introduced — and copied five times?**
   The first hook was written for inputs fixed at mount, where dep-change
   staleness *cannot* occur, so the flaw was invisible at birth. Later features
   reused the visible shape of the pattern without revisiting its hidden
   assumption, and nothing structural (shared helper, lint rule, checklist)
   forced the "reset on input change" invariant — so each copy silently
   inherited it, until one copy finally got a UI whose inputs change constantly
   (the week navigator).

## The bug class

> Any async subscription feeding component state, where the subscription key can
> change, will show **key A's data under key B's label** unless the state is
> reset when the key changes — and will show it **forever** if failures don't
> also reset it.

## Countermeasures (all landed)

1. **Structural — one choke point.** `app/src/liveQuery.ts` (`useLiveQuery` /
   `useLiveDoc`) is now the only way to subscribe: it resets to `empty` the
   moment inputs change and on listener errors. All hooks migrated
   (entries/timesheets/users/activities + UsersScreen's inline listener).
2. **Enforced, not remembered.** An ESLint `no-restricted-imports` rule bans
   importing `onSnapshot` anywhere in `app/src` except `liveQuery.ts` (and
   `session.ts`, whose auth-coupled listener manages its own reset). The rule
   was proven live: it immediately caught `activities.ts`, a straggler with the
   same latent flaw that manual review had missed.
3. **Test the condition, not the happy path.** The e2e now stalls all Firestore
   traffic (Playwright route interception) and switches weeks, asserting the
   old rows vanish *immediately* — this fails against the pre-fix code and is
   exactly the network condition that exposed the bug in production.
4. **Recorded.** CLAUDE.md conventions point here so the invariant survives
   context loss.

## Process lessons (beyond this bug)

- **Latency is an input.** Any UI backed by async data must be exercised at
  least once with delayed responses; localhost-speed e2e green is not evidence
  of correctness under real networks.
- **When copying a pattern, copy its assumptions list — or better, extract it.**
  A pattern that is correct under an unstated precondition ("inputs never
  change") is a defect factory once reused. Extraction + lint turns a memory
  burden into a compile-time property.
- **Treat filtered test noise as a signal.** The e2e's allow-list for WebChannel
  transport errors was documented evidence that this transport flakes; that
  should have prompted "what breaks when it flakes?" during design review.
