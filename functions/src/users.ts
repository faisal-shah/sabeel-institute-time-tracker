import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAdmin } from './auth';

export interface UserAccessInput {
  uid: string;
  status?: 'active' | 'disabled';
  role?: 'member' | 'manager';
  admin?: boolean;
}

function validateInput(data: unknown): UserAccessInput {
  const d = data as Partial<UserAccessInput> | null;
  if (!d || typeof d.uid !== 'string' || d.uid.length === 0) {
    throw new HttpsError('invalid-argument', 'uid is required.');
  }
  if (d.status !== undefined && d.status !== 'active' && d.status !== 'disabled') {
    throw new HttpsError('invalid-argument', 'status must be active or disabled.');
  }
  if (d.role !== undefined && d.role !== 'member' && d.role !== 'manager') {
    throw new HttpsError('invalid-argument', 'role must be member or manager.');
  }
  if (d.admin !== undefined && typeof d.admin !== 'boolean') {
    throw new HttpsError('invalid-argument', 'admin must be a boolean.');
  }
  if (d.status === undefined && d.role === undefined && d.admin === undefined) {
    throw new HttpsError('invalid-argument', 'Nothing to change.');
  }
  return { uid: d.uid, status: d.status, role: d.role, admin: d.admin };
}

/**
 * Core of setUserAccess, callable-independent so integration tests can drive it
 * against the emulators. Merges the requested changes into the user doc and
 * mirrors { role, status, admin } into custom claims — the doc is for UI, the
 * claims are what security rules trust.
 */
export async function applyUserAccess(callerUid: string, input: UserAccessInput) {
  const db = getFirestore();
  const auth = getAuth();

  const userRef = db.collection('users').doc(input.uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'No such user.');
  }
  const current = snap.data() as { status: string; role: string; admin: boolean };

  // An admin may not strip their own admin flag or disable themselves — prevents
  // locking the org out of user management entirely.
  if (input.uid === callerUid && (input.admin === false || input.status === 'disabled')) {
    throw new HttpsError('failed-precondition', 'You cannot demote or disable yourself.');
  }

  const next = {
    status: input.status ?? current.status,
    role: input.role ?? current.role,
    admin: input.admin ?? current.admin,
  };

  await auth.setCustomUserClaims(input.uid, next);

  const docUpdate: Record<string, unknown> = { ...next };
  // Epoch ms like every other timestamp in the shared types (see UserDoc).
  if (current.status === 'pending' && next.status === 'active') {
    docUpdate.approvedAt = Date.now();
    docUpdate.approvedBy = callerUid;
  }
  await userRef.update(docUpdate);

  return next;
}

/** Only admins approve/disable users or change roles (product decision). */
export const setUserAccess = onCall(async (req) => {
  const callerUid = requireAdmin(req);
  const input = validateInput(req.data);
  return applyUserAccess(callerUid, input);
});
