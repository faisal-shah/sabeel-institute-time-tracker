import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { COLLECTIONS, type TokenClaims, type UserDoc } from '@sabeel/shared';
import { googleSignOut } from './auth/google';
import { unregisterPush } from './notify';
import { auth, db } from './firebase';
import { setSentryUser } from './sentry';

export type Session =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  | { phase: 'signedIn'; user: User; profile: UserDoc | null; claims: TokenClaims };

export async function signOut(): Promise<void> {
  // Notifications target the device, not the session — deregister this device
  // first (while still authenticated) so the next account on this phone/browser
  // doesn't receive the previous account's notifications.
  const uid = auth.currentUser?.uid;
  if (uid) await unregisterPush(uid).catch(() => undefined);
  // Also clear the native Google session, or the next sign-in silently reuses
  // the same account with no way to switch users.
  await googleSignOut().catch(() => undefined);
  await fbSignOut(auth);
}

// Fresh accounts carry no claims; that matches a pending profile, so the missing
// values default rather than looking "stale".
function isStale(claims: TokenClaims, profile: UserDoc): boolean {
  return (
    (claims.status ?? 'pending') !== profile.status ||
    (claims.role ?? 'member') !== profile.role ||
    (claims.admin ?? false) !== profile.admin
  );
}

/** True once the user is a fully active member — the only state that leaves the gate. */
function isReady(claims: TokenClaims, profile: UserDoc | null): boolean {
  return !!profile && claims.status === 'active';
}

/**
 * Auth state + user profile + token claims, kept coherent:
 * - first sign-in creates the (forced-pending) profile doc;
 * - the profile doc is watched live, AND while the user is gated (pending) we
 *   also POLL — force-refresh the token and re-read the doc every few seconds.
 *
 * The poll is essential: when an admin approves a user, the admin SDK sets that
 * user's custom claims, which disrupts the user's in-flight Firestore listener,
 * so the doc-update snapshot may never arrive. Polling detects approval
 * regardless, and is also how the token picks up the new claims without a
 * sign-out/in.
 */
export function useSession(): Session {
  const [session, setSession] = useState<Session>({ phase: 'loading' });
  // Latest known claims/profile, so the poller and the listener agree.
  const latest = useRef<{ profile: UserDoc | null }>({ profile: null });

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = null;
      stopPoll();
      latest.current = { profile: null };
      // Sentry events carry the uid so "who hit this?" is never a guess.
      setSentryUser(user?.uid ?? null);

      if (!user) {
        setSession({ phase: 'signedOut' });
        return;
      }

      const ref = doc(db, COLLECTIONS.users, user.uid);

      const ensureProfile = async () => {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const profile: UserDoc = {
            displayName: user.displayName ?? user.email ?? 'Unknown',
            email: user.email ?? '',
            photoURL: user.photoURL,
            status: 'pending',
            role: 'member',
            admin: false,
            activeEntryId: null,
            approverUid: null,
            createdAt: Date.now(),
          };
          await setDoc(ref, profile);
        }
      };

      // Publish the session from a (profile, claims) pair, and (re)arm the poll
      // if the user is still gated so approval is detected even if the listener
      // misses the update.
      const publish = (profile: UserDoc | null, claims: TokenClaims) => {
        if (cancelled) return;
        latest.current = { profile };
        setSession({ phase: 'signedIn', user, profile, claims });
        if (isReady(claims, profile)) {
          stopPoll();
        } else if (!pollTimer) {
          pollTimer = setInterval(poll, 3000);
        }
      };

      // Force-refresh the token, re-read the doc, and republish. Used by the
      // poll and after a listener snapshot when the token still lags the doc.
      const poll = async () => {
        try {
          await user.getIdToken(true);
          const claims = (await user.getIdTokenResult()).claims as TokenClaims;
          const snap = await getDoc(ref);
          const profile = snap.exists() ? (snap.data() as UserDoc) : null;
          publish(profile, claims);
        } catch (e) {
          console.warn('session poll', (e as { code?: string }).code ?? (e as Error).message);
        }
      };

      const onSnap = async (profile: UserDoc | null) => {
        const claims = (await user.getIdTokenResult()).claims as TokenClaims;
        publish(profile, claims);
        // Doc says active but token still lags (claim propagation): refresh now
        // rather than waiting for the next poll tick.
        if (profile && isStale(claims, profile)) void poll();
      };

      ensureProfile()
        .then(() => {
          unsubDoc = onSnapshot(
            ref,
            (snap) => void onSnap(snap.exists() ? (snap.data() as UserDoc) : null),
            (e) => console.warn('profile listener', e.code ?? e.message),
          );
        })
        .catch((e) => {
          console.error('profile bootstrap failed', e);
          void poll();
        });
    });

    return () => {
      cancelled = true;
      unsubAuth();
      unsubDoc?.();
      stopPoll();
    };
  }, []);

  return session;
}
