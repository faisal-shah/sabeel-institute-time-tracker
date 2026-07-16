// Native side of the Sentry seam (web sibling: sentry.web.ts).
// Real wiring (@sentry/react-native) lands with the next Android build cycle —
// the SDK is a native module, so it only takes effect in a fresh
// `expo run:android` build anyway. Until then these are no-ops.
export function initSentry(): void {
  // TODO(next Android build): import * as Sentry from '@sentry/react-native';
  //   const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  //   if (dsn) Sentry.init({ dsn });
}

/** Report a handled error (e.g. a rejected Firestore listener) with context tags. */
export function captureError(_e: unknown, _tags?: Record<string, string>): void {
  // no-op until @sentry/react-native is wired (see initSentry above)
}
