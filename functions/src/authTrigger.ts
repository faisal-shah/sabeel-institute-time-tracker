import './setup';
import * as functionsV1 from 'firebase-functions/v1';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { isAllowedEmail } from '@sabeel/shared';

/**
 * Domain enforcement for sign-in. Runs on every new Firebase Auth user.
 *
 *  - A verified @oursabeel.com address is left alone: this app provisions its
 *    user doc client-side (forced pending; see session.ts + firestore.rules),
 *    so the trigger does nothing and the normal approval flow proceeds.
 *  - Anything else is deleted outright — the Auth login is removed and any
 *    profile the client may have raced in is cleaned up, so an outside account
 *    leaves no trace and the person can retry with the right address.
 *
 * Gen-1 auth trigger: the blocking `beforeUserCreated` would reject before the
 * Auth user is ever created, but it requires upgrading the project to Identity
 * Platform. The window this non-blocking trigger leaves open is not exploitable:
 * between the Auth user being created and this trigger deleting it, that account
 * has no custom claims, and firestore.rules also refuses a non-org self-register
 * (see isOrgEmail there) — so it can neither read nor write anything. (This is
 * the same strategy the sibling kanban app uses.)
 */
export const onUserCreate = functionsV1
  .region('us-central1')
  .auth.user()
  .onCreate(async (user) => {
    if (isAllowedEmail(user.email, user.emailVerified)) return;

    functionsV1.logger.warn('Rejected sign-up outside the org domain', {
      uid: user.uid,
      email: user.email ?? null,
    });
    // Rules should have prevented any profile write, but delete defensively in
    // case one raced in before this trigger ran.
    await getFirestore().doc(`users/${user.uid}`).delete().catch(() => undefined);
    await getAuth().deleteUser(user.uid);
  });
