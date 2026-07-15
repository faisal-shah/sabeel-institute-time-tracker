import { describe, it, beforeAll, expect } from 'vitest';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { applyUserAccess } from '../../src/users';

// Runs under `firebase emulators:exec` — FIRESTORE_EMULATOR_HOST and
// FIREBASE_AUTH_EMULATOR_HOST are set, so the admin SDK talks to the emulators.

function freshUid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function seedUser(uid: string, doc: Record<string, unknown>) {
  await getAuth().createUser({ uid, email: `${uid}@example.com` });
  await getFirestore().collection('users').doc(uid).set({
    displayName: uid,
    email: `${uid}@example.com`,
    photoURL: null,
    status: 'pending',
    role: 'member',
    admin: false,
    activeEntryId: null,
    createdAt: Date.now(),
    ...doc,
  });
}

beforeAll(() => {
  if (getApps().length === 0) {
    initializeApp({ projectId: 'demo-sabeel' });
  }
});

describe('applyUserAccess (admin approval flow)', () => {
  it('approves a pending user: doc updated, claims mirrored, audit fields set', async () => {
    const admin = freshUid('admin');
    const target = freshUid('newbie');
    await seedUser(admin, { status: 'active', admin: true });
    await seedUser(target, {});

    const result = await applyUserAccess(admin, { uid: target, status: 'active' });
    expect(result).toEqual({ status: 'active', role: 'member', admin: false });

    const doc = (await getFirestore().collection('users').doc(target).get()).data()!;
    expect(doc.status).toBe('active');
    expect(doc.approvedBy).toBe(admin);
    expect(doc.approvedAt).toBeTruthy();

    const claims = (await getAuth().getUser(target)).customClaims;
    expect(claims).toEqual({ status: 'active', role: 'member', admin: false });
  });

  it('promotes to manager without touching status', async () => {
    const admin = freshUid('admin');
    const target = freshUid('member');
    await seedUser(admin, { status: 'active', admin: true });
    await seedUser(target, { status: 'active' });

    const result = await applyUserAccess(admin, { uid: target, role: 'manager' });
    expect(result).toEqual({ status: 'active', role: 'manager', admin: false });
  });

  it('refuses self-demotion and self-disable (lockout guard)', async () => {
    const admin = freshUid('admin');
    await seedUser(admin, { status: 'active', admin: true });

    await expect(applyUserAccess(admin, { uid: admin, admin: false })).rejects.toThrow(
      HttpsError,
    );
    await expect(applyUserAccess(admin, { uid: admin, status: 'disabled' })).rejects.toThrow(
      /cannot demote or disable yourself/,
    );
  });

  it('404s on a user without a profile doc', async () => {
    const admin = freshUid('admin');
    await seedUser(admin, { status: 'active', admin: true });
    await expect(applyUserAccess(admin, { uid: 'ghost-uid', status: 'active' })).rejects.toThrow(
      /No such user/,
    );
  });
});
