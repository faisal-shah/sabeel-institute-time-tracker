export const COLLECTIONS = {
  users: 'users',
  activities: 'activities',
  timeEntries: 'timeEntries',
} as const;

// Functions region must match setGlobalOptions in functions/src/setup.ts.
export const REGION = 'us-central1';

// The *Web* OAuth client id from the Firebase console (NOT the Android one) —
// required by native Google Sign-In to mint an idToken Firebase accepts.
// Placeholder until the real Firebase project exists (see TODO.md).
export const WEB_CLIENT_ID =
  'PLACEHOLDER.apps.googleusercontent.com';

/** Clock sessions running longer than this get auto-closed at start + cap. */
export const SESSION_CAP_HOURS = 12;

/** Longest a single entry may claim, mirrored in firestore.rules. */
export const MAX_ENTRY_HOURS = 24;
