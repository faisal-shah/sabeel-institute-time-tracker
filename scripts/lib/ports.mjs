/**
 * This checkout's Firebase emulator ports — the one place scripts read them.
 *
 * FOUR files have to agree and cannot share a representation: this one (ESM,
 * for `scripts/*.mjs`), `firebase.json` (JSON, what the emulators bind),
 * `app/src/env.ts` (TS, inlined into the client bundle at build time) and the
 * `PORTS=(…)` array in `free-emulator-ports.sh` (shell). Four copies are
 * unavoidable; four copies drifting is not.
 * `functions/test/unit/emulator-ports.test.ts` asserts they agree, so a change
 * to one of them fails `npm run verify` in seconds rather than surfacing later
 * as an emulator that answers on a port nobody expected.
 */
const PORT_BASE = 61000;

export const EMULATOR_PORTS = {
  firestore: PORT_BASE + 0,
  firestoreWebsocket: PORT_BASE + 1,
  auth: PORT_BASE + 2,
  functions: PORT_BASE + 3,
  ui: PORT_BASE + 4,
  hub: PORT_BASE + 5,
  logging: PORT_BASE + 6,
};
