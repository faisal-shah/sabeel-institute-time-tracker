// The ONE way to subscribe to live Firestore data from a hook. Every live hook
// in the app goes through here — never hand-roll onSnapshot state in a hook.
//
// Invariants (born of a real bug — see docs/POSTMORTEM-2026-07-16-stale-week.md):
//  1. State RESETS to `empty` the moment the subscription inputs change. React
//     state otherwise persists across dependency changes, so query A's results
//     would stay on screen while query B's first snapshot is in flight — on a
//     slow connection that showed one week's entries under another week.
//  2. Listener errors also reset to `empty`: an empty screen plus a console
//     warning beats silently-wrong data that never corrects itself.
import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type DocumentReference,
  type DocumentSnapshot,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import { captureError } from './sentry';

// ---- Listener-error visibility -------------------------------------------
// A server-rejected listen used to die as a console.warn nobody sees on a
// phone; the 2026-07-16 index-direction incident hid behind exactly that.
// Every screen shows the latest live-data error via useListenerError (the
// Screen component renders it); a later success from the same source clears it.
const errorWatchers = new Set<(msg: string | null) => void>();
let lastListenerError: string | null = null;

function reportListenerError(label: string, e: { code?: string; message: string }) {
  lastListenerError = `Live data error (${label}): ${e.code ?? e.message}`;
  errorWatchers.forEach((w) => w(lastListenerError));
  console.warn(`${label} listener`, e.code ?? e.message);
  // Off-device visibility: the 2026-07-16 index incident sat invisible in a
  // phone console for a day; with Sentry wired it is one dashboard event.
  captureError(e, { source: label });
}

function reportListenerSuccess(label: string) {
  if (lastListenerError?.includes(`(${label})`)) {
    lastListenerError = null;
    errorWatchers.forEach((w) => w(null));
  }
}

/** Latest live-listener failure, app-wide; null when healthy. */
export function useListenerError(): string | null {
  const [err, setErr] = useState(lastListenerError);
  useEffect(() => {
    errorWatchers.add(setErr);
    return () => {
      errorWatchers.delete(setErr);
    };
  }, []);
  return err;
}
// ---------------------------------------------------------------------------

/** Live query results. `make`/`map` are called fresh per (re)subscription;
 *  a null query means "not subscribed" (e.g. role-gated queries) → `empty`. */
export function useLiveQuery<T>(
  label: string,
  make: () => Query | null,
  map: (snap: QuerySnapshot) => T,
  empty: T,
  deps: readonly unknown[],
): T {
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    setValue(empty);
    const q = make();
    if (!q) return;
    return onSnapshot(
      q,
      (snap) => {
        setValue(map(snap));
        reportListenerSuccess(label);
      },
      (e) => {
        setValue(empty);
        reportListenerError(label, e);
      },
    );
    // deps are the caller's subscription inputs; make/map/empty are per-render
    // closures over exactly those inputs.
  }, deps);
  return value;
}

/** Live single document. `empty` is the value while loading / on error / missing-ref. */
export function useLiveDoc<T>(
  label: string,
  make: () => DocumentReference | null,
  map: (snap: DocumentSnapshot) => T,
  empty: T,
  deps: readonly unknown[],
): T {
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    setValue(empty);
    const ref = make();
    if (!ref) return;
    return onSnapshot(
      ref,
      (snap) => {
        setValue(map(snap));
        reportListenerSuccess(label);
      },
      (e) => {
        setValue(empty);
        reportListenerError(label, e);
      },
    );
  }, deps);
  return value;
}
