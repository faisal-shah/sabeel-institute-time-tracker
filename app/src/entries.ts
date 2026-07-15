import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  COLLECTIONS,
  dayKeyFor,
  deviceTimeZone,
  minutesBetween,
  type TimeEntryDoc,
} from '@sabeel/shared';
import { db } from './firebase';
import type { Activity } from './activities';

export type TimeEntry = TimeEntryDoc & { id: string };

/** Clock in: create the running entry and point activeEntryId at it, atomically. */
export async function clockIn(uid: string, activity: Activity): Promise<void> {
  const now = Date.now();
  const tz = deviceTimeZone();
  const entryRef = doc(collection(db, COLLECTIONS.timeEntries));
  const entry: TimeEntryDoc = {
    uid,
    activityId: activity.id,
    activityName: activity.name,
    start: now,
    end: null,
    timeZone: tz,
    dayKey: dayKeyFor(now, tz),
    source: 'clock',
    createdAt: now,
    updatedAt: now,
  };
  const batch = writeBatch(db);
  batch.set(entryRef, entry);
  batch.update(doc(db, COLLECTIONS.users, uid), { activeEntryId: entryRef.id });
  await batch.commit();
}

/** Clock out: close the running entry and clear the pointer, atomically. */
export async function clockOut(uid: string, entry: TimeEntry): Promise<void> {
  const now = Date.now();
  const batch = writeBatch(db);
  batch.update(doc(db, COLLECTIONS.timeEntries, entry.id), {
    end: now,
    durationMinutes: Math.max(1, minutesBetween(entry.start, now)),
    updatedAt: now,
  });
  batch.update(doc(db, COLLECTIONS.users, uid), { activeEntryId: null });
  await batch.commit();
}

export async function createManualEntry(input: {
  uid: string;
  activity: Activity;
  start: number;
  end: number;
  note?: string;
}): Promise<void> {
  const now = Date.now();
  const tz = deviceTimeZone();
  const entry: TimeEntryDoc = {
    uid: input.uid,
    activityId: input.activity.id,
    activityName: input.activity.name,
    start: input.start,
    end: input.end,
    durationMinutes: Math.max(1, minutesBetween(input.start, input.end)),
    timeZone: tz,
    dayKey: dayKeyFor(input.start, tz),
    source: 'manual',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    createdAt: now,
    updatedAt: now,
  };
  await addDoc(collection(db, COLLECTIONS.timeEntries), entry);
}

/** Live view of a single entry (the running one, usually). */
export function useEntry(entryId: string | null): TimeEntry | null {
  const [entry, setEntry] = useState<TimeEntry | null>(null);
  useEffect(() => {
    if (!entryId) {
      setEntry(null);
      return;
    }
    return onSnapshot(
      doc(db, COLLECTIONS.timeEntries, entryId),
      (snap) => {
        setEntry(snap.exists() ? { id: snap.id, ...(snap.data() as TimeEntryDoc) } : null);
      },
      (e) => console.warn('useEntry listener', e.code ?? e.message),
    );
  }, [entryId]);
  return entry;
}

/** Live closed-minutes total for one of my local days (running session excluded). */
export function useDayMinutes(uid: string, dayKey: string): number {
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.timeEntries),
      where('uid', '==', uid),
      where('dayKey', '==', dayKey),
    );
    return onSnapshot(
      q,
      (snap) => {
        let total = 0;
        snap.forEach((d) => {
          total += (d.data() as TimeEntryDoc).durationMinutes ?? 0;
        });
        setMinutes(total);
      },
      (e) => console.warn('useDayMinutes listener', e.code ?? e.message),
    );
  }, [uid, dayKey]);
  return minutes;
}
