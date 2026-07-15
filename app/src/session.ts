import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { COLLECTIONS, type TokenClaims, type UserDoc } from '@sabeel/shared';
import { auth, db } from './firebase';

export type Session =
  | { phase: 'loading' }
  | { phase: 'signedOut' }
  | { phase: 'signedIn'; user: User; profile: UserDoc | null; claims: TokenClaims };

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}

/**
 * Auth state + user profile + token claims, kept coherent:
 * - first sign-in creates the (forced-pending) profile doc;
 * - the profile doc is watched live;
 * - when the doc's role/status/admin disagree with the token (an admin just
 *   approved or promoted this user), the token is force-refreshed so security
 *   rules see the change without a sign-out/in.
 */
export function useSession(): Session {
  const [session, setSession] = useState<Session>({ phase: 'loading' });
  const refreshing = useRef(false);

  useEffect(() => {
    let unsubDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubDoc?.();
      unsubDoc = null;

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
            createdAt: Date.now(),
          };
          await setDoc(ref, profile);
        }
      };

      const syncClaims = async (profile: UserDoc | null) => {
        let token = await user.getIdTokenResult();
        let claims = token.claims as TokenClaims;
        // Fresh accounts have no claims at all — that matches a pending profile,
        // so default the missing values rather than refresh-looping.
        const stale =
          profile &&
          ((claims.status ?? 'pending') !== profile.status ||
            (claims.role ?? 'member') !== profile.role ||
            (claims.admin ?? false) !== profile.admin);
        if (stale && !refreshing.current) {
          refreshing.current = true;
          try {
            await user.getIdToken(true);
            token = await user.getIdTokenResult();
            claims = token.claims as TokenClaims;
          } finally {
            refreshing.current = false;
          }
        }
        setSession({ phase: 'signedIn', user, profile, claims });
      };

      ensureProfile()
        .then(() => {
          unsubDoc = onSnapshot(
            ref,
            (snap) => {
              void syncClaims(snap.exists() ? (snap.data() as UserDoc) : null);
            },
            (e) => console.warn('profile listener', e.code ?? e.message),
          );
        })
        .catch((e) => {
          console.error('profile bootstrap failed', e);
          void syncClaims(null);
        });
    });

    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  return session;
}
