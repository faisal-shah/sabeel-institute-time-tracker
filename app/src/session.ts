/**
 * The signed-in session: who you are, and what you may do.
 *
 * Single source of truth for auth state, set up once at module load (one auth
 * listener for the whole app; components subscribe via `useSession`). The client
 * NEVER writes its own user doc — the `onUserCreate` Cloud Function is the sole
 * provisioner (sets pending claims + creates the doc, or deletes a non-org
 * account). This module only OBSERVES: it watches `users/{uid}` and reads role/
 * status from the token.
 *
 * Claim freshness: custom claims live in the ID token, refreshed only on expiry
 * (up to an hour) or an explicit force-refresh. So when an admin approves someone,
 * their token still says `pending` and they stay gated — "approved and nothing
 * happened". The fix: `setUserAccess` stamps `claimsUpdatedAt` on the doc, this
 * module watches the doc, and force-refreshes the token whenever that stamp moves
 * (and on the first sighting, since the trigger sets claims after sign-in). No
 * polling.
 *
 * Exempt from the useLiveQuery lint rule (eslint.config.mjs): it owns the auth
 * lifecycle and does its own listener + reset.
 */
import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, onSnapshot, type DocumentSnapshot } from 'firebase/firestore';
import { COLLECTIONS, type TokenClaims, type UserDoc } from '@sabeel/shared';
import { googleSignOut } from './auth/google';
import { unregisterPush } from './notify';
import { auth, db } from './firebase';
import { setSentryUser } from './sentry';

export type Session =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  /** Signed in, but the user doc/claims have not arrived yet. */
  | { phase: 'provisioning'; uid: string }
  /**
   * Provisioning never completed — overwhelmingly this means the `onUserCreate`
   * trigger REJECTED the account (a non-org address) and deleted it. The client's
   * token stays valid until it refreshes, so without this state the person would
   * watch a spinner forever instead of being told what happened.
   */
  | { phase: 'notProvisioned'; uid: string; email: string }
  | { phase: 'signedIn'; user: User; profile: UserDoc; claims: TokenClaims };

type Listener = (s: Session) => void;

let current: Session = { phase: 'loading' };
const listeners = new Set<Listener>();

function emit(next: Session) {
  current = next;
  listeners.forEach((l) => l(next));
}

let unsubDoc: (() => void) | null = null;
let lastClaimsStamp: number | null = null;
let provisioningTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * How long to wait for the trigger before concluding it is not coming.
 * Provisioning normally takes well under a second; ten is generous enough to
 * survive a cold function start without stranding a rejected user on a spinner.
 */
const PROVISIONING_TIMEOUT_MS = 10_000;

function stopWatching() {
  unsubDoc?.();
  unsubDoc = null;
  lastClaimsStamp = null;
  if (provisioningTimer) {
    clearTimeout(provisioningTimer);
    provisioningTimer = null;
  }
}

function armProvisioningTimeout(uid: string, email: string) {
  if (provisioningTimer) clearTimeout(provisioningTimer);
  provisioningTimer = setTimeout(() => {
    if (current.phase === 'provisioning') emit({ phase: 'notProvisioned', uid, email });
  }, PROVISIONING_TIMEOUT_MS);
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Read role/status/admin from the TOKEN, not the doc — rules trust the token, so
 * the UI must agree with it or people see buttons that always fail. A forced
 * refresh is a network round trip; bound it and fall back to the cached token so
 * neither a failure nor a hang strands the user on the provisioning spinner.
 */
async function readClaims(user: User, forceRefresh: boolean): Promise<TokenClaims> {
  let token;
  try {
    token = await withTimeout(
      user.getIdTokenResult(forceRefresh),
      forceRefresh ? 8000 : 4000,
      'token refresh',
    );
  } catch (e) {
    console.warn('token refresh failed, falling back to cached claims', e);
    try {
      token = await withTimeout(user.getIdTokenResult(false), 4000, 'cached token');
    } catch {
      return { status: 'pending', role: 'member', admin: false };
    }
  }
  const c = token.claims;
  return {
    status: (c.status as UserDoc['status']) ?? 'pending',
    role: (c.role as UserDoc['role']) ?? 'member',
    admin: (c.admin as boolean) ?? false,
  };
}

async function handleSnapshot(user: User, snap: DocumentSnapshot): Promise<void> {
  if (!snap.exists()) {
    // The trigger has not finished yet, or it rejected the account and is about
    // to delete it. The timeout decides which.
    emit({ phase: 'provisioning', uid: user.uid });
    armProvisioningTimeout(user.uid, user.email ?? '');
    return;
  }
  if (provisioningTimer) {
    clearTimeout(provisioningTimer);
    provisioningTimer = null;
  }

  const profile = snap.data() as UserDoc;
  const stamp = typeof profile.claimsUpdatedAt === 'number' ? profile.claimsUpdatedAt : null;
  // First sighting always refreshes (the trigger set claims after sign-in, so the
  // token in hand predates them); after that, only when the stamp moves.
  const claimsChanged = lastClaimsStamp === null || stamp !== lastClaimsStamp;
  lastClaimsStamp = stamp;

  const claims = await readClaims(user, claimsChanged);
  emit({ phase: 'signedIn', user, profile, claims });
}

function watchUserDoc(user: User) {
  stopWatching();
  unsubDoc = onSnapshot(
    doc(db, COLLECTIONS.users, user.uid),
    // Not an async fn passed straight in: an unhandled rejection would silently
    // strand the app in `provisioning`.
    (snap) =>
      void handleSnapshot(user, snap).catch((e) => {
        console.warn('user snapshot handler failed', e);
        emit({ phase: 'provisioning', uid: user.uid });
      }),
    (e) => {
      console.warn('user doc listener', (e as { code?: string }).code ?? e.message);
      emit({ phase: 'provisioning', uid: user.uid });
    },
  );
}

onAuthStateChanged(auth, (user) => {
  stopWatching();
  setSentryUser(user?.uid ?? null);
  if (!user) {
    emit({ phase: 'signedOut' });
    return;
  }
  emit({ phase: 'provisioning', uid: user.uid });
  watchUserDoc(user);
  armProvisioningTimeout(user.uid, user.email ?? '');
});

export function useSession(): Session {
  const [s, setS] = useState<Session>(current);
  useEffect(() => {
    listeners.add(setS);
    setS(current);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export async function signOut(): Promise<void> {
  stopWatching();
  // Notifications target the device, not the session — deregister this device
  // first (while still authenticated) so the next account on this phone/browser
  // doesn't receive the previous account's notifications.
  const uid = auth.currentUser?.uid;
  if (uid) await unregisterPush(uid).catch(() => undefined);
  // Also clear the native Google session, or the next sign-in silently reuses the
  // same account with no way to switch users.
  await googleSignOut().catch(() => undefined);
  await fbSignOut(auth);
}
