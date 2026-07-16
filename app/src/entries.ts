import { useEffect, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  COLLECTIONS,
  dayKeyFor,
  deviceTimeZone,
  minutesBetween,
  periodKeyFor,
  type TimeEntryDoc,
} from '@sabeel/shared';
import { FirebaseError } from 'firebase/app';
import { db } from './firebase';
import type { Activity } from './activities';

export type TimeEntry = TimeEntryDoc & { id: string };

/**
 * Entry writes into a submitted/approved period are denied by rules; turn the
 * opaque permission error into the message users need to see.
 */
export function explainEntryWriteError(e: unknown): string {
  if (e instanceof FirebaseError && e.code === 'permission-denied') {
    return (
      "This week's timesheet has been submitted or approved, so its hours are " +
      'locked. Withdraw the timesheet (or ask your approver / an admin) to make changes.'
    );
  }
  return (e as Error).message;
}

/** Clock in: create the running entry and point activeEntryId at it, atomically. */
export async function clockIn(uid: string, activity: Activity): Promise<void> {
  const now = Date.now();
  const tz = deviceTimeZone();
  const entryRef = doc(collection(db, COLLECTIONS.timeEntries));
  const dayKey = dayKeyFor(now, tz);
  const entry: TimeEntryDoc = {
    uid,
    activityId: activity.id,
    activityName: activity.name,
    start: now,
    end: null,
    timeZone: tz,
    dayKey,
    periodKey: periodKeyFor(dayKey),
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
  /** Who is writing. When ≠ uid (manager/approver adding on behalf), rules require the lastEditedBy flag. */
  creatorUid: string;
}): Promise<void> {
  const now = Date.now();
  const tz = deviceTimeZone();
  const dayKey = dayKeyFor(input.start, tz);
  const entry: TimeEntryDoc = {
    uid: input.uid,
    activityId: input.activity.id,
    activityName: input.activity.name,
    start: input.start,
    end: input.end,
    durationMinutes: Math.max(1, minutesBetween(input.start, input.end)),
    timeZone: tz,
    dayKey,
    periodKey: periodKeyFor(dayKey),
    source: 'manual',
    ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    ...(input.creatorUid !== input.uid ? { lastEditedBy: input.creatorUid } : {}),
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

/** Live list of a user's entries in an inclusive dayKey range, newest first. */
export function useEntriesRange(
  uid: string,
  fromKey: string,
  toKey: string,
): TimeEntry[] {
  const [rows, setRows] = useState<TimeEntry[]>([]);
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.timeEntries),
      where('uid', '==', uid),
      where('dayKey', '>=', fromKey),
      where('dayKey', '<=', toKey),
    );
    return onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TimeEntryDoc) }));
        list.sort((a, b) => b.dayKey.localeCompare(a.dayKey) || b.start - a.start);
        setRows(list);
      },
      (e) => console.warn('useEntriesRange listener', e.code ?? e.message),
    );
  }, [uid, fromKey, toKey]);
  return rows;
}

/** Edit a closed entry's fields; recomputes duration/dayKey from the new times. */
export async function updateEntry(
  entry: TimeEntry,
  changes: {
    activity?: Activity;
    start: number;
    end: number;
    note?: string;
    editorUid: string;
  },
): Promise<void> {
  const dayKey = dayKeyFor(changes.start, entry.timeZone);
  await updateDoc(doc(db, COLLECTIONS.timeEntries, entry.id), {
    ...(changes.activity
      ? { activityId: changes.activity.id, activityName: changes.activity.name }
      : {}),
    start: changes.start,
    end: changes.end,
    durationMinutes: Math.max(1, minutesBetween(changes.start, changes.end)),
    dayKey,
    periodKey: periodKeyFor(dayKey),
    note: changes.note?.trim() ?? '',
    updatedAt: Date.now(),
    ...(changes.editorUid !== entry.uid ? { lastEditedBy: changes.editorUid } : {}),
  });
}

export function deleteEntry(entryId: string): Promise<void> {
  return deleteDoc(doc(db, COLLECTIONS.timeEntries, entryId));
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
