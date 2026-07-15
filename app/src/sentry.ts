// Native side of the Sentry seam (web sibling: sentry.web.ts).
// Real wiring (@sentry/react-native) is deferred to launch; the DSN comes from a
// gitignored env var. Until then this is a no-op so the app runs without it.
export function initSentry(): void {
  // TODO(launch): import * as Sentry from '@sentry/react-native';
  //   const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  //   if (dsn) Sentry.init({ dsn });
}
