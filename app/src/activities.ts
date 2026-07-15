import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { COLLECTIONS, type ActivityDoc, type ActivityType } from '@sabeel/shared';
import { db } from './firebase';

export type Activity = ActivityDoc & { id: string };

/** Live list of activities; active-only for pickers, everything for management. */
export function useActivities(opts: { includeArchived: boolean }): Activity[] {
  const [rows, setRows] = useState<Activity[]>([]);
  useEffect(() => {
    const base = collection(db, COLLECTIONS.activities);
    const q = opts.includeArchived
      ? query(base, orderBy('name'))
      : query(base, where('status', '==', 'active'), orderBy('name'));
    return onSnapshot(q, (snap) =>
      setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ActivityDoc) }))),
    );
  }, [opts.includeArchived]);
  return rows;
}

export function createActivity(input: {
  name: string;
  type: ActivityType;
  createdBy: string;
}): Promise<unknown> {
  const docBody: ActivityDoc = {
    name: input.name.trim(),
    type: input.type,
    status: 'active',
    createdAt: Date.now(),
    createdBy: input.createdBy,
  };
  return addDoc(collection(db, COLLECTIONS.activities), docBody);
}

export function setActivityStatus(id: string, status: 'active' | 'archived'): Promise<void> {
  return updateDoc(doc(db, COLLECTIONS.activities, id), { status });
}
