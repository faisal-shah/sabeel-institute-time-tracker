// Web side of the Google sign-in seam (native sibling: google.ts).
// Works against the Auth emulator too — the popup shows the emulator's fake
// account chooser instead of real Google.
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from '../firebase';

export const REAL_GOOGLE_AVAILABLE = true;

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    // Popup blocked → full-page redirect fallback.
    if ((e as { code?: string }).code === 'auth/popup-blocked') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}
