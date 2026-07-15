import { CallableRequest, HttpsError } from 'firebase-functions/v2/https';

export interface Claims {
  role?: 'member' | 'manager';
  status?: 'pending' | 'active' | 'disabled';
  admin?: boolean;
}

export function requireAuth(req: CallableRequest): string {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  return req.auth.uid;
}

export function requireActive(req: CallableRequest): string {
  const uid = requireAuth(req);
  const claims = (req.auth?.token ?? {}) as Claims;
  if (claims.status !== 'active') {
    throw new HttpsError('permission-denied', 'Account is not active.');
  }
  return uid;
}

export function requireManager(req: CallableRequest): string {
  const uid = requireActive(req);
  const claims = (req.auth?.token ?? {}) as Claims;
  if (claims.role !== 'manager') {
    throw new HttpsError('permission-denied', 'Manager role required.');
  }
  return uid;
}

/** Only admins approve/disable users and change roles (Faisal's decision). */
export function requireAdmin(req: CallableRequest): string {
  const uid = requireActive(req);
  const claims = (req.auth?.token ?? {}) as Claims;
  if (claims.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required.');
  }
  return uid;
}
