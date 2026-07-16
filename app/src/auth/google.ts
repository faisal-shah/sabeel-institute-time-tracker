// Native side of the Google sign-in seam (web sibling: google.web.ts).
// Uses the native Google Sign-In SDK to get an ID token, then exchanges it for a
// Firebase credential — the same signInWithCredential path the emulator dev
// sign-in exercises. Requires the debug/release SHA-1 registered on the Firebase
// Android app and WEB_CLIENT_ID set (see TODO.md); otherwise Google returns a
// DEVELOPER_ERROR.
import {
  GoogleSignin,
  statusCodes,
  isSuccessResponse,
} from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { WEB_CLIENT_ID } from '@sabeel/shared';
import { auth } from '../firebase';

export const REAL_GOOGLE_AVAILABLE = true;

let configured = false;
function ensureConfigured() {
  if (configured) return;
  // webClientId MUST be the *Web* OAuth client id (not the Android one).
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

/**
 * Clear the remembered Google account. Without this, the next signIn() silently
 * reuses the previous account and there is no way to switch users — sign-out
 * from the app must also sign out of Google so the account chooser reappears.
 */
export async function googleSignOut(): Promise<void> {
  ensureConfigured();
  await GoogleSignin.signOut();
}

export async function signInWithGoogle(): Promise<void> {
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) {
      // User dismissed the account chooser — not an error worth surfacing.
      return;
    }
    const idToken = response.data.idToken;
    if (!idToken) {
      throw new Error('Google sign-in returned no ID token.');
    }
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
      return; // user cancelled / a sign-in is already running
    }
    if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error('Google Play services are required to sign in.');
    }
    throw e;
  }
}
