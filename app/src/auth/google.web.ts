// Web side of the Google sign-in seam (native sibling: google.ts).
// Works against the Auth emulator too — the popup shows the emulator's fake
// account chooser instead of real Google.
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import { auth } from '../firebase';

export const REAL_GOOGLE_AVAILABLE = true;

/** Web keeps no Google session of its own — Firebase sign-out is enough. */
export async function googleSignOut(): Promise<void> {}

export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  // Always show Google's account chooser (with its own "Use another account")
  // instead of silently reusing the last signed-in account.
  provider.setCustomParameters({ prompt: 'select_account' });
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
