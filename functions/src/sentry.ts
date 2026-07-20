import * as Sentry from '@sentry/node';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

/** Shared declaration — bind via `secrets: [sentryDsn]` wherever capture matters. */
export const sentryDsn = defineSecret('SENTRY_DSN');

let initialized = false;

/**
 * Initialize Sentry once, lazily, from a DSN provided at call time (Secret Manager).
 * Returns true if Sentry is ready to receive events.
 */
function ensureSentry(dsn: string | undefined): boolean {
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

/**
 * Report an UNEXPECTED error. HttpsErrors are expected domain outcomes
 * (unauthenticated, invalid-argument, …) — they go to the caller, not Sentry.
 * Serverless: flush before returning or the event may never leave the instance.
 */
export async function reportError(e: unknown): Promise<void> {
  if (e instanceof HttpsError) return;
  if (ensureSentry(process.env.SENTRY_DSN)) {
    Sentry.captureException(e);
    await Sentry.flush(2000).catch(() => undefined);
  }
}

/** Wrap a callable handler: unexpected failures reach Sentry, then rethrow. */
export function guarded<Req, Res>(
  fn: (req: CallableRequest<Req>) => Promise<Res>,
): (req: CallableRequest<Req>) => Promise<Res> {
  return async (req) => {
    try {
      return await fn(req);
    } catch (e) {
      await reportError(e);
      throw e;
    }
  };
}
