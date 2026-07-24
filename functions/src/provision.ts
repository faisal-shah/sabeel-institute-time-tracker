import { NEW_USER_ACCESS, isAllowedEmail } from '@sabeel/shared';
import type { UserRole, UserStatus } from '@sabeel/shared';

/**
 * The decision half of new-user provisioning, kept pure so it can be tested
 * exhaustively without an emulator or the Admin SDK. `authTrigger.ts` performs
 * the effects. (Mirrors the sibling kanban app's provision.ts.)
 */
export type ProvisionDecision =
  | { action: 'reject'; email: string | null }
  | {
      action: 'provision';
      claims: { status: UserStatus; role: UserRole; admin: boolean };
      profile: { displayName: string; email: string; photoURL: string | null };
    };

export function decideProvision(user: {
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  photoURL?: string | null;
}): ProvisionDecision {
  const { email, emailVerified = false } = user;

  // The one domain gate. The OAuth consent screen is External, so Google will
  // hand us any account; this check (shared `isAllowedEmail`) is the real one.
  if (!isAllowedEmail(email, emailVerified)) {
    return { action: 'reject', email: email ?? null };
  }

  return {
    action: 'provision',
    claims: { ...NEW_USER_ACCESS },
    profile: {
      // Fall back to the local part rather than an empty row in the admin's
      // approval list — they approve people by name and address.
      displayName: user.displayName?.trim() || (email as string).split('@')[0],
      email: email as string,
      photoURL: user.photoURL ?? null,
    },
  };
}
