// Web side of the Sentry seam (native sibling: sentry.ts). The DSN comes from
// gitignored app/.env.local (EXPO_PUBLIC_SENTRY_DSN), inlined at bundle time;
// without it everything here is a no-op.
import * as Sentry from '@sentry/react';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!dsn) return;
  Sentry.init({ dsn, tracesSampleRate: 0 });
}

/** Report a handled error (e.g. a rejected Firestore listener) with context tags. */
export function captureError(e: unknown, tags?: Record<string, string>): void {
  if (!dsn) return;
  Sentry.captureException(e, { tags });
}
