import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const T0 = 1752570000000; // arbitrary epoch ms
const closedEntry = {
  uid: 'alice',
  activityId: 'act1',
  activityName: 'Tutoring',
  start: T0,
  end: T0 + 60 * 60000,
  durationMinutes: 60,
  timeZone: 'America/Chicago',
  dayKey: '2026-07-15',
  source: 'manual',
  createdAt: T0,
  updatedAt: T0,
};
const runningEntry = {
  uid: 'alice',
  activityId: 'act1',
  activityName: 'Tutoring',
  start: T0,
  end: null,
  timeZone: 'America/Chicago',
  dayKey: '2026-07-15',
  source: 'clock',
  createdAt: T0,
  updatedAt: T0,
};

const aliceUserDoc = (activeEntryId: string | null) => ({
  displayName: 'Alice',
  email: 'alice@example.com',
  photoURL: null,
  status: 'active',
  role: 'member',
  admin: false,
  activeEntryId,
  createdAt: 1,
});

beforeAll(async () => {
  const fs = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-sabeel',
    firestore: {
      host: fs[0],
      port: Number(fs[1]),
      rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'users/alice'), aliceUserDoc(null));
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const alice = () =>
  testEnv.authenticatedContext('alice', { status: 'active', role: 'member' });
const bob = () => testEnv.authenticatedContext('bob', { status: 'active', role: 'member' });
const manager = () =>
  testEnv.authenticatedContext('mgr', { status: 'active', role: 'manager' });

describe('timeEntries — clock in/out batches', () => {
  it('clock-in: entry create + pointer set in one batch succeeds', async () => {
    const db = alice().firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'timeEntries/e1'), runningEntry);
    batch.update(doc(db, 'users/alice'), { activeEntryId: 'e1' });
    await assertSucceeds(batch.commit());
  });

  it('clock-in without setting the pointer fails', async () => {
    const db = alice().firestore();
    await assertFails(setDoc(doc(db, 'timeEntries/e1'), runningEntry));
  });

  it('second concurrent clock-in fails (one active session)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), runningEntry);
      await setDoc(doc(ctx.firestore(), 'users/alice'), aliceUserDoc('e1'));
    });
    const db = alice().firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'timeEntries/e2'), runningEntry);
    batch.update(doc(db, 'users/alice'), { activeEntryId: 'e2' });
    await assertFails(batch.commit());
  });

  it('clock-out: close entry + clear pointer in one batch succeeds', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), runningEntry);
      await setDoc(doc(ctx.firestore(), 'users/alice'), aliceUserDoc('e1'));
    });
    const db = alice().firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, 'timeEntries/e1'), {
      end: T0 + 30 * 60000,
      durationMinutes: 30,
      updatedAt: T0 + 30 * 60000,
    });
    batch.update(doc(db, 'users/alice'), { activeEntryId: null });
    await assertFails(
      updateDoc(doc(alice().firestore(), 'timeEntries/e1'), {
        end: T0 + 30 * 60000,
        durationMinutes: 30,
      }),
    ); // closing without clearing the pointer fails
    await assertSucceeds(batch.commit());
  });
});

describe('timeEntries — manual entries and validation', () => {
  it('owner creates a valid closed manual entry', async () => {
    await assertSucceeds(setDoc(doc(alice().firestore(), 'timeEntries/m1'), closedEntry));
  });

  it('rejects entries for someone else, backwards times, over-cap, bad shape', async () => {
    const db = alice().firestore();
    await assertFails(setDoc(doc(db, 'timeEntries/m1'), { ...closedEntry, uid: 'bob' }));
    await assertFails(
      setDoc(doc(db, 'timeEntries/m2'), { ...closedEntry, end: T0 - 1, durationMinutes: 1 }),
    );
    await assertFails(
      setDoc(doc(db, 'timeEntries/m3'), {
        ...closedEntry,
        end: T0 + 25 * 3600000,
        durationMinutes: 25 * 60,
      }),
    );
    await assertFails(setDoc(doc(db, 'timeEntries/m4'), { ...closedEntry, dayKey: 'nope' }));
    // running entry must not carry durationMinutes
    await assertFails(
      setDoc(doc(db, 'timeEntries/m5'), { ...runningEntry, durationMinutes: 10 }),
    );
  });
});

describe('timeEntries — reads, corrections, deletes', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), closedEntry);
    });
  });

  it('owner and manager read; other members cannot', async () => {
    await assertSucceeds(getDoc(doc(alice().firestore(), 'timeEntries/e1')));
    await assertSucceeds(getDoc(doc(manager().firestore(), 'timeEntries/e1')));
    await assertFails(getDoc(doc(bob().firestore(), 'timeEntries/e1')));
  });

  it('reading a nonexistent entry is allowed (optimistic clock-in listener race)', async () => {
    await assertSucceeds(getDoc(doc(alice().firestore(), 'timeEntries/never-created')));
  });

  it('manager corrects a closed entry; ownership immutable', async () => {
    await assertSucceeds(
      updateDoc(doc(manager().firestore(), 'timeEntries/e1'), {
        durationMinutes: 45,
        end: T0 + 45 * 60000,
        lastEditedBy: 'mgr',
      }),
    );
    await assertFails(
      updateDoc(doc(manager().firestore(), 'timeEntries/e1'), { uid: 'mgr' }),
    );
  });

  it('manager cannot touch a RUNNING entry (pointer lives on the owner doc)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/r1'), runningEntry);
      await setDoc(doc(ctx.firestore(), 'users/alice'), aliceUserDoc('r1'));
    });
    await assertFails(
      updateDoc(doc(manager().firestore(), 'timeEntries/r1'), {
        end: T0 + 10 * 60000,
        durationMinutes: 10,
        updatedAt: T0,
      }),
    );
  });

  it('owner and manager delete closed entries; others cannot', async () => {
    await assertFails(deleteDoc(doc(bob().firestore(), 'timeEntries/e1')));
    await assertSucceeds(deleteDoc(doc(manager().firestore(), 'timeEntries/e1')));
  });
});
