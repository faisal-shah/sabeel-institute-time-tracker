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

/** Live query results. `make`/`map` are called fresh per (re)subscription. */
export function useLiveQuery<T>(
  label: string,
  make: () => Query,
  map: (snap: QuerySnapshot) => T,
  empty: T,
  deps: readonly unknown[],
): T {
  const [value, setValue] = useState<T>(empty);
  useEffect(() => {
    setValue(empty);
    return onSnapshot(
      make(),
      (snap) => setValue(map(snap)),
      (e) => {
        setValue(empty);
        console.warn(`${label} listener`, e.code ?? e.message);
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
      (snap) => setValue(map(snap)),
      (e) => {
        setValue(empty);
        console.warn(`${label} listener`, e.code ?? e.message);
      },
    );
  }, deps);
  return value;
}
