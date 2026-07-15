import * as Sentry from '@sentry/node';
import { defineSecret } from 'firebase-functions/params';

/** Shared declaration — bind via `secrets: [sentryDsn]` wherever capture matters. */
export const sentryDsn = defineSecret('SENTRY_DSN');

let initialized = false;

/**
 * Initialize Sentry once, lazily, from a DSN provided at call time (Secret Manager).
 * Returns true if Sentry is ready to receive events.
 */
export function ensureSentry(dsn: string | undefined): boolean {
  if (initialized) {
    return true;
  }
  if (!dsn) {
    return false;
  }
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    environment: process.env.NODE_ENV ?? 'development',
  });
  initialized = true;
  return true;
}

export { Sentry };
