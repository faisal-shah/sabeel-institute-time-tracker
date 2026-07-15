import { initializeApp } from 'firebase/app';
import { connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { REGION } from '@sabeel/shared';
import { firebaseConfig } from './firebase-config';
import { initAuth } from './authInit';
import { USE_EMULATORS, EMULATOR_HOST } from './env';

export const app = initializeApp(firebaseConfig);
export const auth = initAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, REGION);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, 8080);
  connectFunctionsEmulator(functions, EMULATOR_HOST, 5001);
}
