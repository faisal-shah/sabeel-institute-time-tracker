import { describe, it, expect } from 'vitest';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { requireAuth, requireActive, requireManager, requireAdmin } from '../../src/auth';

function req(auth: { uid: string; token: Record<string, unknown> } | null): CallableRequest {
  return { auth: auth ?? undefined, data: {}, rawRequest: {} } as unknown as CallableRequest;
}

const activeMember = { uid: 'u1', token: { status: 'active', role: 'member' } };
const activeManager = { uid: 'u2', token: { status: 'active', role: 'manager' } };
const activeAdmin = { uid: 'u3', token: { status: 'active', role: 'manager', admin: true } };
const pending = { uid: 'u4', token: { status: 'pending', role: 'member' } };

describe('auth guards', () => {
  it('requireAuth rejects anonymous, passes any signed-in user', () => {
    expect(() => requireAuth(req(null))).toThrow(/Sign in required/);
    expect(requireAuth(req(pending))).toBe('u4');
  });

  it('requireActive rejects pending users', () => {
    expect(() => requireActive(req(pending))).toThrow(/not active/);
    expect(requireActive(req(activeMember))).toBe('u1');
  });

  it('requireManager rejects active members', () => {
    expect(() => requireManager(req(activeMember))).toThrow(/Manager role required/);
    expect(requireManager(req(activeManager))).toBe('u2');
  });

  it('requireAdmin rejects plain managers — only admins approve users', () => {
    expect(() => requireAdmin(req(activeManager))).toThrow(/Admin required/);
    expect(requireAdmin(req(activeAdmin))).toBe('u3');
  });
});
