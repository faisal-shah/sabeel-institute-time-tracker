export const COLLECTIONS = {
  users: 'users',
  activities: 'activities',
  timeEntries: 'timeEntries',
  timesheets: 'timesheets',
} as const;

// Functions region must match setGlobalOptions in functions/src/setup.ts.
export const REGION = 'us-central1';

// Sign-in is restricted to this Google Workspace domain. Enforced server-side by
// the onUserCreate auth trigger (which deletes any account outside it) and by
// firestore.rules (which blocks a non-org account from self-registering a
// profile). The client also passes it to Google as an `hd` hint — UX only; the
// hint is trivially bypassed, so the server checks above are the real gate.
export const ALLOWED_EMAIL_DOMAIN = 'oursabeel.com';

// The *Web* OAuth client id (NOT the Android one) — required by native Google
// Sign-In to mint an idToken Firebase accepts. This is the client_type 3 entry
// from app/google-services.json (auto-created when Google sign-in was enabled).
export const WEB_CLIENT_ID =
  '858585609550-4pkumltbrleru9om5q91jhrv1pcnblk9.apps.googleusercontent.com';

/** Clock sessions running longer than this get auto-closed at start + cap. */
export const SESSION_CAP_HOURS = 12;

/** Longest a single entry may claim, mirrored in firestore.rules. */
export const MAX_ENTRY_HOURS = 24;
