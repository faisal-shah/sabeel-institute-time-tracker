import { collection, doc, or, query, updateDoc, where } from 'firebase/firestore';
import { COLLECTIONS, type UserDoc } from '@sabeel/shared';
import { db } from './firebase';
import { useLiveQuery } from './liveQuery';

export type UserRow = UserDoc & { uid: string };

/**
 * Point a user's sticky timesheet approver at an active manager/admin (or clear
 * it). Rules scope who may call this for whom: self always; managers for any
 * non-admin; admins for anyone. Affects future submissions only.
 */
export function setApprover(uid: string, approverUid: string | null): Promise<void> {
  return updateDoc(doc(db, COLLECTIONS.users, uid), { approverUid });
}

/** The active managers/admins a user may pick as their approver. */
export function approverChoices(users: UserRow[]): UserRow[] {
  return users.filter((u) => u.status === 'active' && (u.role === 'manager' || u.admin));
}

/**
 * Live list of possible approvers (active managers/admins). Unlike useUsers,
 * this query is readable by every active user — rules open manager/admin
 * profiles to all so people can pick their own approver.
 */
export function useApproverChoices(): UserRow[] {
  return useLiveQuery(
    'useApproverChoices',
    () =>
      query(
        collection(db, COLLECTIONS.users),
        or(where('role', '==', 'manager'), where('admin', '==', true)),
      ),
    (snap) => {
      const list = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }));
      return approverChoices(list).sort((a, b) => a.displayName.localeCompare(b.displayName));
    },
    [],
    [],
  );
}

/** Live list of all users — managers use it for report filters and person detail. */
export function useUsers(): UserRow[] {
  return useLiveQuery(
    'useUsers',
    () => query(collection(db, COLLECTIONS.users)),
    (snap) => {
      const list = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }));
      list.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return list;
    },
    [],
    [],
  );
}
