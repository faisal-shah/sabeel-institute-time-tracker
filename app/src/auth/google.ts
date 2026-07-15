// Native side of the Google sign-in seam (web sibling: google.web.ts).
// Real native Google Sign-In (@react-native-google-signin) is wired in Phase 6 —
// it needs the real Firebase project's webClientId + SHA-1 registration to work
// at all. Until then, native sign-in is emulator-only via devSignIn.
import { USE_EMULATORS } from '../env';

export const REAL_GOOGLE_AVAILABLE = false;

export async function signInWithGoogle(): Promise<void> {
  if (USE_EMULATORS) {
    throw new Error('Use the dev sign-in below when running against emulators.');
  }
  throw new Error('Native Google Sign-In arrives in Phase 6 (needs the real Firebase project).');
}
