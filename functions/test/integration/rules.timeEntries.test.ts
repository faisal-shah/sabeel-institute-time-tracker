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
// dayKey 2026-07-15 is a Wednesday; its Sun–Sat month-clipped period starts 07-12.
const PERIOD = '2026-07-12';
const closedEntry = {
  uid: 'alice',
  activityId: 'act1',
  activityName: 'Tutoring',
  start: T0,
  end: T0 + 60 * 60000,
  durationMinutes: 60,
  timeZone: 'America/Chicago',
  dayKey: '2026-07-15',
  periodKey: PERIOD,
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
  periodKey: PERIOD,
  source: 'clock',
  createdAt: T0,
  updatedAt: T0,
};
// A submitted/approved/rejected timesheet covering PERIOD for alice.
const aliceTimesheet = (status: 'submitted' | 'approved' | 'rejected') => ({
  uid: 'alice',
  periodKey: PERIOD,
  toKey: '2026-07-18',
  status,
  approverUid: 'mgr',
  submittedAt: T0,
  totalMinutes: 60,
  entryCount: 1,
  createdAt: T0,
  updatedAt: T0,
  ...(status === 'rejected' ? { decidedAt: T0, decidedBy: 'mgr', rejectReason: 'fix it' } : {}),
  ...(status === 'approved' ? { decidedAt: T0, decidedBy: 'mgr' } : {}),
});

const aliceUserDoc = (activeEntryId: string | null) => ({
  displayName: 'Alice',
  email: 'alice@example.com',
  photoURL: null,
  status: 'active',
  role: 'member',
  admin: false,
  activeEntryId,
  approverUid: 'mgr',
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
// A second manager who is NOT the stamped approver of alice's timesheets.
const manager2 = () =>
  testEnv.authenticatedContext('mgr2', { status: 'active', role: 'manager' });
const admin = () =>
  testEnv.authenticatedContext('adm', { status: 'active', role: 'member', admin: true });

const seedTimesheet = (status: 'submitted' | 'approved' | 'rejected') =>
  testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `timesheets/alice_${PERIOD}`), aliceTimesheet(status));
  });

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

  it('M2: durationMinutes cannot exceed the span (inflation blocked)', async () => {
    const db = alice().firestore();
    // Times 1 minute apart but claiming 24h — the classic inflation attempt.
    await assertFails(
      setDoc(doc(db, 'timeEntries/inf'), {
        ...closedEntry,
        end: T0 + 60000,
        durationMinutes: 24 * 60,
      }),
    );
  });

  it('M2: an honest rounded duration (90s → 2) is accepted (the +1 tolerance)', async () => {
    const db = alice().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries/round'), {
        ...closedEntry,
        end: T0 + 90000,
        durationMinutes: 2,
      }),
    );
  });
});

describe('timeEntries — reads, corrections, deletes', () => {
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), closedEntry);
    });
  });

  it('owner, manager, and admin (even non-manager) read; other members cannot', async () => {
    await assertSucceeds(getDoc(doc(alice().firestore(), 'timeEntries/e1')));
    await assertSucceeds(getDoc(doc(manager().firestore(), 'timeEntries/e1')));
    // Admins may decide any submitted sheet, so they must be able to read the
    // entries under review — caught in prod by Sentry (permission-denied on
    // useEntriesRange for an admin-without-manager-role).
    await assertSucceeds(getDoc(doc(admin().firestore(), 'timeEntries/e1')));
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

describe('timeEntries — canonical periodKey guard (spoof-proof)', () => {
  it('accepts only periodKeyFor(dayKey); rejects spoofs and omissions', async () => {
    const db = alice().firestore();
    await assertSucceeds(setDoc(doc(db, 'timeEntries/p1'), closedEntry)); // 07-15 → 07-12
    await assertFails(
      setDoc(doc(db, 'timeEntries/p2'), { ...closedEntry, periodKey: '2026-07-15' }), // dayKey itself
    );
    await assertFails(
      setDoc(doc(db, 'timeEntries/p3'), { ...closedEntry, periodKey: '2026-07-05' }), // wrong week
    );
    const { periodKey: _omit, ...noPeriod } = closedEntry;
    await assertFails(setDoc(doc(db, 'timeEntries/p4'), noPeriod));
  });

  it('month-clipped day: dayKey 2026-07-04 (Sat) must carry periodKey 2026-07-01', async () => {
    const db = alice().firestore();
    const clipped = {
      ...closedEntry,
      dayKey: '2026-07-04',
      periodKey: '2026-07-01',
    };
    await assertSucceeds(setDoc(doc(db, 'timeEntries/c1'), clipped));
    await assertFails(
      setDoc(doc(db, 'timeEntries/c2'), { ...clipped, periodKey: '2026-06-28' }), // unclipped Sunday
    );
  });

  it('a Sunday and a 1st-of-month are their own periodKey (pins dowSun0 anchoring)', async () => {
    const db = alice().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries/s1'), {
        ...closedEntry,
        dayKey: '2026-07-12',
        periodKey: '2026-07-12',
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries/s2'), {
        ...closedEntry,
        dayKey: '2026-07-01',
        periodKey: '2026-07-01',
      }),
    );
  });
});

describe('timeEntries — create on behalf (draft period)', () => {
  it('manager creates a CLOSED entry for alice with lastEditedBy ✓; without ✗; running ✗', async () => {
    const db = manager().firestore();
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries/b1'), { ...closedEntry, lastEditedBy: 'mgr' }),
    );
    await assertFails(setDoc(doc(db, 'timeEntries/b2'), closedEntry)); // unflagged
    await assertFails(
      setDoc(doc(db, 'timeEntries/b3'), { ...runningEntry, lastEditedBy: 'mgr' }), // running
    );
  });

  it('a plain member cannot create entries for someone else', async () => {
    await assertFails(
      setDoc(doc(bob().firestore(), 'timeEntries/b4'), { ...closedEntry, lastEditedBy: 'bob' }),
    );
  });
});

describe('timeEntries — submitted period lock', () => {
  beforeEach(async () => {
    await seedTimesheet('submitted');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), closedEntry);
    });
  });

  it('owner cannot create, edit, or delete in a submitted period', async () => {
    const db = alice().firestore();
    await assertFails(setDoc(doc(db, 'timeEntries/n1'), closedEntry));
    await assertFails(updateDoc(doc(db, 'timeEntries/e1'), { note: 'oops', updatedAt: T0 }));
    await assertFails(deleteDoc(doc(db, 'timeEntries/e1')));
  });

  it('owner cannot clock in (running create) into a submitted period', async () => {
    const db = alice().firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'timeEntries/r9'), runningEntry);
    batch.update(doc(db, 'users/alice'), { activeEntryId: 'r9' });
    await assertFails(batch.commit());
  });

  it('stamped approver may edit, add, and delete; a non-stamped manager may not', async () => {
    const mgrDb = manager().firestore();
    await assertSucceeds(
      updateDoc(doc(mgrDb, 'timeEntries/e1'), {
        durationMinutes: 45,
        end: T0 + 45 * 60000,
        lastEditedBy: 'mgr',
        updatedAt: T0,
      }),
    );
    await assertSucceeds(
      setDoc(doc(mgrDb, 'timeEntries/n2'), { ...closedEntry, lastEditedBy: 'mgr' }),
    );
    const mgr2Db = manager2().firestore();
    await assertFails(
      updateDoc(doc(mgr2Db, 'timeEntries/e1'), {
        durationMinutes: 30,
        end: T0 + 30 * 60000,
        lastEditedBy: 'mgr2',
        updatedAt: T0,
      }),
    );
    await assertFails(
      setDoc(doc(mgr2Db, 'timeEntries/n3'), { ...closedEntry, lastEditedBy: 'mgr2' }),
    );
    await assertFails(deleteDoc(doc(mgr2Db, 'timeEntries/e1')));
    await assertSucceeds(deleteDoc(doc(mgrDb, 'timeEntries/e1')));
  });

  // Self-approval does NOT weaken the freeze: canTouchPeriod excludes the owner
  // outright on a submitted period, before it ever looks at who the approver is.
  // A self-approving manager withdraws (or approves) rather than editing in place,
  // so what gets approved is always what was submitted.
  it('a self-approving manager is still locked out of their OWN submitted period', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `timesheets/mgr_${PERIOD}`), {
        ...aliceTimesheet('submitted'),
        uid: 'mgr',
        approverUid: 'mgr',
      });
      await setDoc(doc(db, 'timeEntries/m1'), { ...closedEntry, uid: 'mgr' });
    });
    const db = manager().firestore();
    await assertFails(
      updateDoc(doc(db, 'timeEntries/m1'), { note: 'tweak', lastEditedBy: 'mgr', updatedAt: T0 }),
    );
    await assertFails(deleteDoc(doc(db, 'timeEntries/m1')));
    await assertFails(
      setDoc(doc(db, 'timeEntries/m2'), { ...closedEntry, uid: 'mgr', lastEditedBy: 'mgr' }),
    );

    // Control: the identical write succeeds once the period is back to draft, so
    // the failures above are the lock and not a malformed entry.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), `timesheets/mgr_${PERIOD}`));
    });
    await assertSucceeds(
      setDoc(doc(db, 'timeEntries/m2'), { ...closedEntry, uid: 'mgr', lastEditedBy: 'mgr' }),
    );
  });

  it('admin (not stamped) may edit in a submitted period', async () => {
    await assertSucceeds(
      updateDoc(doc(admin().firestore(), 'timeEntries/e1'), {
        durationMinutes: 50,
        end: T0 + 50 * 60000,
        lastEditedBy: 'adm',
        updatedAt: T0,
      }),
    );
  });

  it('CARVE-OUT: owner clocks out of a running entry despite the submitted period', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/r1'), runningEntry);
      await setDoc(doc(ctx.firestore(), 'users/alice'), aliceUserDoc('r1'));
    });
    const db = alice().firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, 'timeEntries/r1'), {
      end: T0 + 30 * 60000,
      durationMinutes: 30,
      updatedAt: T0 + 30 * 60000,
    });
    batch.update(doc(db, 'users/alice'), { activeEntryId: null });
    await assertSucceeds(batch.commit());
  });

  it('carve-out is close-only: cannot smuggle other field changes with the clock-out', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/r1'), runningEntry);
      await setDoc(doc(ctx.firestore(), 'users/alice'), aliceUserDoc('r1'));
    });
    const db = alice().firestore();
    const batch = writeBatch(db);
    batch.update(doc(db, 'timeEntries/r1'), {
      end: T0 + 30 * 60000,
      durationMinutes: 30,
      updatedAt: T0 + 30 * 60000,
      note: 'sneaky edit',
    });
    batch.update(doc(db, 'users/alice'), { activeEntryId: null });
    await assertFails(batch.commit());
  });
});

describe('timeEntries — approved period lock (immutable for everyone)', () => {
  beforeEach(async () => {
    await seedTimesheet('approved');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), closedEntry);
    });
  });

  it('owner, stamped approver, other manager, and admin are all locked out', async () => {
    const patch = {
      durationMinutes: 99,
      end: T0 + 99 * 60000,
      updatedAt: T0,
    };
    await assertFails(updateDoc(doc(alice().firestore(), 'timeEntries/e1'), patch));
    await assertFails(
      updateDoc(doc(manager().firestore(), 'timeEntries/e1'), { ...patch, lastEditedBy: 'mgr' }),
    );
    await assertFails(
      updateDoc(doc(admin().firestore(), 'timeEntries/e1'), { ...patch, lastEditedBy: 'adm' }),
    );
    await assertFails(setDoc(doc(alice().firestore(), 'timeEntries/n1'), closedEntry));
    await assertFails(
      setDoc(doc(manager().firestore(), 'timeEntries/n2'), { ...closedEntry, lastEditedBy: 'mgr' }),
    );
    await assertFails(deleteDoc(doc(alice().firestore(), 'timeEntries/e1')));
    await assertFails(deleteDoc(doc(manager().firestore(), 'timeEntries/e1')));
    await assertFails(deleteDoc(doc(admin().firestore(), 'timeEntries/e1')));
  });
});

describe('timeEntries — rejected period behaves like draft again', () => {
  it('owner edits freely after rejection', async () => {
    await seedTimesheet('rejected');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e1'), closedEntry);
    });
    await assertSucceeds(
      updateDoc(doc(alice().firestore(), 'timeEntries/e1'), {
        note: 'fixed per feedback',
        updatedAt: T0,
      }),
    );
    await assertSucceeds(setDoc(doc(alice().firestore(), 'timeEntries/n1'), closedEntry));
  });
});

describe('timeEntries — cross-period moves respect both locks', () => {
  it('cannot move an entry from an open period into an approved one (or out of it)', async () => {
    // Approved sheet covers 07-12..07-18; the entry lives in the NEXT (draft) period.
    await seedTimesheet('approved');
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e2'), {
        ...closedEntry,
        dayKey: '2026-07-20',
        periodKey: '2026-07-19',
      });
    });
    // Move into the approved period: target lock must block it.
    await assertFails(
      updateDoc(doc(alice().firestore(), 'timeEntries/e2'), {
        dayKey: '2026-07-15',
        periodKey: PERIOD,
        updatedAt: T0,
      }),
    );
    // And an entry inside the approved period cannot be moved out.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'timeEntries/e3'), closedEntry);
    });
    await assertFails(
      updateDoc(doc(alice().firestore(), 'timeEntries/e3'), {
        dayKey: '2026-07-20',
        periodKey: '2026-07-19',
        updatedAt: T0,
      }),
    );
  });
});
