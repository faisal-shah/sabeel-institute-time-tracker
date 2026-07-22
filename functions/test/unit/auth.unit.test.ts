import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { requireAuth, requireActive, requireManagerOrAdmin, requireAdmin } from '../../src/auth';

function req(auth: { uid: string; token: Record<string, unknown> } | null): CallableRequest {
  return { auth: auth ?? undefined, data: {}, rawRequest: {} } as unknown as CallableRequest;
}

const activeMember = { uid: 'u1', token: { status: 'active', role: 'member' } };
const activeManager = { uid: 'u2', token: { status: 'active', role: 'manager' } };
const activeAdmin = { uid: 'u3', token: { status: 'active', role: 'manager', admin: true } };
const pending = { uid: 'u4', token: { status: 'pending', role: 'member' } };
// Admin who is NOT a manager (role member) — the case M3 unlocks.
const adminNonManager = { uid: 'u5', token: { status: 'active', role: 'member', admin: true } };

describe('auth guards', () => {
  it('requireAuth rejects anonymous, passes any signed-in user', () => {
    expect(() => requireAuth(req(null))).toThrow(/Sign in required/);
    expect(requireAuth(req(pending))).toBe('u4');
  });

  it('requireActive rejects pending users', () => {
    expect(() => requireActive(req(pending))).toThrow(/not active/);
    expect(requireActive(req(activeMember))).toBe('u1');
  });

  it('requireManagerOrAdmin: rejects plain members, allows managers AND admin-non-managers', () => {
    expect(() => requireManagerOrAdmin(req(activeMember))).toThrow(/Manager or admin/);
    expect(requireManagerOrAdmin(req(activeManager))).toBe('u2');
    // The M3 case: an admin who isn't a manager can still run reports/activities.
    expect(requireManagerOrAdmin(req(adminNonManager))).toBe('u5');
  });

  it('requireAdmin rejects plain managers — only admins approve users', () => {
    expect(() => requireAdmin(req(activeManager))).toThrow(/Admin required/);
    expect(requireAdmin(req(activeAdmin))).toBe('u3');
  });
});
