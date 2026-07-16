export const COLLECTIONS = {
  users: 'users',
  activities: 'activities',
  timeEntries: 'timeEntries',
  timesheets: 'timesheets',
} as const;

// Functions region must match setGlobalOptions in functions/src/setup.ts.
export const REGION = 'us-central1';

// The *Web* OAuth client id (NOT the Android one) — required by native Google
// Sign-In to mint an idToken Firebase accepts. This is the client_type 3 entry
// from app/google-services.json (auto-created when Google sign-in was enabled).
export const WEB_CLIENT_ID =
  '858585609550-4pkumltbrleru9om5q91jhrv1pcnblk9.apps.googleusercontent.com';

/** Clock sessions running longer than this get auto-closed at start + cap. */
export const SESSION_CAP_HOURS = 12;

/** Longest a single entry may claim, mirrored in firestore.rules. */
export const MAX_ENTRY_HOURS = 24;
