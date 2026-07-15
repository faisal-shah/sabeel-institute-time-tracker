import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const activity = {
  name: 'Food Drive',
  type: 'event',
  status: 'active',
  createdAt: 1,
  createdBy: 'mgr',
};

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
});

afterAll(async () => {
  await testEnv?.cleanup();
});

const member = () =>
  testEnv.authenticatedContext('mem', { status: 'active', role: 'member' });
const manager = () =>
  testEnv.authenticatedContext('mgr', { status: 'active', role: 'manager' });
const pendingUser = () =>
  testEnv.authenticatedContext('pen', { status: 'pending', role: 'member' });

describe('firestore.rules — activities', () => {
  it('managers create and archive activities', async () => {
    const m = manager();
    await assertSucceeds(addDoc(collection(m.firestore(), 'activities'), activity));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activities/a1'), activity);
    });
    await assertSucceeds(
      updateDoc(doc(m.firestore(), 'activities/a1'), { status: 'archived' }),
    );
  });

  it('members and pending users cannot write activities', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activities/a1'), activity);
    });
    await assertFails(addDoc(collection(member().firestore(), 'activities'), activity));
    await assertFails(
      updateDoc(doc(member().firestore(), 'activities/a1'), { status: 'archived' }),
    );
    await assertFails(addDoc(collection(pendingUser().firestore(), 'activities'), activity));
  });

  it('active members can read/list; pending users cannot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activities/a1'), activity);
    });
    await assertSucceeds(getDocs(collection(member().firestore(), 'activities')));
    await assertFails(getDocs(collection(pendingUser().firestore(), 'activities')));
  });

  it('nobody deletes activities — archive only', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'activities/a1'), activity);
    });
    await assertFails(deleteDoc(doc(manager().firestore(), 'activities/a1')));
  });

  it('creation is validated: empty name or bad type rejected', async () => {
    const m = manager();
    await assertFails(
      addDoc(collection(m.firestore(), 'activities'), { ...activity, name: '' }),
    );
    await assertFails(
      addDoc(collection(m.firestore(), 'activities'), { ...activity, type: 'party' }),
    );
  });
});
