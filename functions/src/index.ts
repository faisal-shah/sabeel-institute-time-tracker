import './setup';
import { onCall } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { requireAuth } from './auth';

initializeApp();

/**
 * Phase 0 walking skeleton: proves callable plumbing + auth context end to end.
 * Removed once real callables exist.
 */
export const ping = onCall((req) => {
  const uid = requireAuth(req);
  return { ok: true, uid, at: Date.now() };
});
