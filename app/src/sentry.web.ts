// Web side of the Sentry seam (native sibling: sentry.ts).
// Real wiring (@sentry/react) is deferred to launch; the DSN comes from a
// gitignored env var (EXPO_PUBLIC_SENTRY_DSN). Until then this is a no-op.
export function initSentry(): void {
  // TODO(launch): import * as Sentry from '@sentry/react';
  //   const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  //   if (dsn) Sentry.init({ dsn, tracesSampleRate: 0 });
}
