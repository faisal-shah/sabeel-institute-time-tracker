import { Platform } from 'react-native';

// Baked in at bundle time: EXPO_PUBLIC_USE_EMULATORS=1 npx expo start [--web]
export const USE_EMULATORS = process.env.EXPO_PUBLIC_USE_EMULATORS === '1';

// The Android emulator reaches the host machine at 10.0.2.2.
// Web uses the LITERAL 127.0.0.1, never 'localhost': the Firebase emulators bind
// to IPv4 only, while 'localhost' can resolve to IPv6 ::1 first — the request
// then fails at connect, which surfaces as a CORS error ("no
// Access-Control-Allow-Origin") because there is no response to carry headers.
export const EMULATOR_HOST = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';

/**
 * Emulator ports for THIS checkout.
 *
 * Source literals, deliberately — never `EXPO_PUBLIC_*`. On a native debug build
 * those come from the environment that started METRO, and one Metro serves every
 * Sabeel project on this machine, so an env-driven port would make the app's
 * backend address a property of an unrelated process's environment. An
 * env-with-default would also fail toward the collision: an unset or mistyped
 * var falls back to the old shared port and silently connects to a sibling
 * repo's emulator. A literal cannot do that.
 *
 * Three other files state these same numbers (`firebase.json`,
 * `scripts/lib/ports.mjs`, `scripts/free-emulator-ports.sh`) and
 * `functions/test/unit/emulator-ports.test.ts` asserts all four agree.
 */
export const EMULATOR_PORTS = {
  auth: 9099,
  firestore: 8080,
  functions: 5001,
} as const;
