import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { COLLECTIONS, type UserDoc } from '@sabeel/shared';
import { db } from './firebase';

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

/** Live list of all users — managers use it for report filters and person detail. */
export function useUsers(): UserRow[] {
  const [rows, setRows] = useState<UserRow[]>([]);
  useEffect(
    () =>
      onSnapshot(
        collection(db, COLLECTIONS.users),
        (snap) => {
          const list = snap.docs.map((d) => ({ uid: d.id, ...(d.data() as UserDoc) }));
          list.sort((a, b) => a.displayName.localeCompare(b.displayName));
          setRows(list);
        },
        (e) => console.warn('useUsers listener', e.code ?? e.message),
      ),
    [],
  );
  return rows;
}
