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
export const EMULATOR_PORTS = {
  firestore: 8080,
  firestoreWebsocket: 9150,
  auth: 9099,
  functions: 5001,
  ui: 4000,
  hub: 4400,
  logging: 4500,
};
