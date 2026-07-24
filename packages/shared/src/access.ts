import type { UserRole, UserStatus } from './types';

/**
 * What a brand-new account gets, as custom claims. Never active — the
 * `onUserCreate` trigger sets these, and an admin must approve to move `status`
 * to 'active'. Kept here as a single source so the trigger and any test agree.
 */
export const NEW_USER_ACCESS: { status: UserStatus; role: UserRole; admin: boolean } = {
  status: 'pending',
  role: 'member',
  admin: false,
};
