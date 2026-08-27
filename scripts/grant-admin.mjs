#!/usr/bin/env node
// One-time bootstrap: promote a user (by email) to active manager+admin.
// Solves the chicken-and-egg of the very first admin; later grants go through
// the in-app Users screen (setUserAccess).
//
// Against the emulators (default):
//   (host:port come from scripts/lib/ports.mjs — this checkout's own block) \
//     node scripts/grant-admin.mjs you@example.com
// Against production (needs gcloud ADC or GOOGLE_APPLICATION_CREDENTIALS):
//   GCLOUD_PROJECT=<real-project-id> node scripts/grant-admin.mjs you@example.com
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { EMULATOR_PORTS } from './lib/ports.mjs';

const email = process.argv[2];
if (!email) {
  console.error('usage: node scripts/grant-admin.mjs <email>');
  process.exit(1);
}

const projectId = process.env.GCLOUD_PROJECT ?? 'demo-sabeel';
if (projectId === 'demo-sabeel' && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORTS.firestore}`;
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${EMULATOR_PORTS.auth}`;
}

initializeApp({ projectId });

const user = await getAuth().getUserByEmail(email);
const next = { status: 'active', role: 'manager', admin: true };
await getAuth().setCustomUserClaims(user.uid, next);
await getFirestore().collection('users').doc(user.uid).set(
  {
    ...next,
    approvedAt: Date.now(),
    approvedBy: 'grant-admin-script',
    // Bump the stamp the client watches, so the promoted user un-gates on the
    // next snapshot (the trigger already created the pending doc + claims).
    claimsUpdatedAt: Date.now(),
  },
  { merge: true },
);
console.log(`${email} (${user.uid}) is now an active admin+manager on ${projectId}.`);
console.log('They must sign out/in (or wait for token refresh) to pick up the claims.');
