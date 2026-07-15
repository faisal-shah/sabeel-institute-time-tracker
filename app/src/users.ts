import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { COLLECTIONS, type UserDoc } from '@sabeel/shared';
import { db } from './firebase';

export type UserRow = UserDoc & { uid: string };

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
