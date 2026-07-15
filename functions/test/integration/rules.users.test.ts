import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const pendingProfile = {
  displayName: 'New Volunteer',
  email: 'new@example.com',
  photoURL: null,
  status: 'pending',
  role: 'member',
  admin: false,
  activeEntryId: null,
  createdAt: 1,
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

const activeClaims = { status: 'active', role: 'member' };
const managerClaims = { status: 'active', role: 'manager' };

describe('firestore.rules — users self-registration', () => {
  it('lets a signed-in user create their own pending profile', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertSucceeds(setDoc(doc(alice.firestore(), 'users/alice'), pendingProfile));
  });

  it('blocks creating a profile that is not pending/member/non-admin', async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(
      setDoc(doc(alice.firestore(), 'users/alice'), { ...pendingProfile, status: 'active' }),
    );
    await assertFails(
      setDoc(doc(alice.firestore(), 'users/alice'), { ...pendingProfile, role: 'manager' }),
    );
    await assertFails(
      setDoc(doc(alice.firestore(), 'users/alice'), { ...pendingProfile, admin: true }),
    );
  });

  it("blocks creating someone else's profile", async () => {
    const alice = testEnv.authenticatedContext('alice');
    await assertFails(setDoc(doc(alice.firestore(), 'users/bob'), pendingProfile));
  });

  it('blocks anonymous access entirely', async () => {
    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(anon.firestore(), 'users/alice')));
    await assertFails(setDoc(doc(anon.firestore(), 'users/anon'), pendingProfile));
  });
});

describe('firestore.rules — users privilege escalation', () => {
  it('blocks a user from changing their own role/status/admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice'), {
        ...pendingProfile,
        status: 'active',
      });
    });
    const alice = testEnv.authenticatedContext('alice', activeClaims);
    const me = doc(alice.firestore(), 'users/alice');
    await assertFails(updateDoc(me, { role: 'manager' }));
    await assertFails(updateDoc(me, { admin: true }));
    await assertFails(updateDoc(me, { status: 'active', role: 'manager' }));
    // But the allowed self-service fields work:
    await assertSucceeds(updateDoc(me, { displayName: 'Alice A.' }));
    await assertSucceeds(updateDoc(me, { activeEntryId: 'entry1' }));
  });

  it('pending users (no active claim) cannot even self-update cosmetics', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/carol'), pendingProfile);
    });
    const carol = testEnv.authenticatedContext('carol', { status: 'pending', role: 'member' });
    await assertFails(updateDoc(doc(carol.firestore(), 'users/carol'), { displayName: 'C' }));
  });

  it('admins who are not managers can still read profiles (approval needs name+email)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/newbie'), pendingProfile);
    });
    const admin = testEnv.authenticatedContext('adm', {
      status: 'active',
      role: 'member',
      admin: true,
    });
    await assertSucceeds(getDoc(doc(admin.firestore(), 'users/newbie')));
  });

  it('managers can read any profile; members only their own', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice'), { ...pendingProfile, status: 'active' });
    });
    const manager = testEnv.authenticatedContext('mgr', managerClaims);
    await assertSucceeds(getDoc(doc(manager.firestore(), 'users/alice')));
    const bob = testEnv.authenticatedContext('bob', activeClaims);
    await assertFails(getDoc(doc(bob.firestore(), 'users/alice')));
  });
});
