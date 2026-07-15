// Emulator-only: the Auth emulator accepts an unsigned JSON payload as a Google
// idToken, so we can exercise the exact production credential path
// (GoogleAuthProvider.credential → signInWithCredential) without real OAuth.
// Works on every platform; the UI only offers it when USE_EMULATORS is set.
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../firebase';

export async function devSignInAsGoogle(email: string, name: string): Promise<void> {
  const sub = `dev-${email.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const idToken = JSON.stringify({
    sub,
    email,
    email_verified: true,
    name,
  });
  await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}
