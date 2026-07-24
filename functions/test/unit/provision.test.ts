import { describe, it, expect } from 'vitest';
import { decideProvision } from '../../src/provision';

describe('decideProvision', () => {
  const good = {
    email: 'someone@oursabeel.com',
    emailVerified: true,
    displayName: 'Some One',
    photoURL: 'https://example.com/a.png',
  };

  it('provisions a verified org address as pending/member/non-admin', () => {
    const d = decideProvision(good);
    if (d.action !== 'provision') throw new Error('expected provision');
    expect(d.claims).toEqual({ status: 'pending', role: 'member', admin: false });
    expect(d.profile.displayName).toBe('Some One');
    expect(d.profile.email).toBe('someone@oursabeel.com');
    expect(d.profile.photoURL).toBe('https://example.com/a.png');
  });

  it('never provisions an active account — domain match is not approval', () => {
    const d = decideProvision(good);
    if (d.action !== 'provision') throw new Error('expected provision');
    expect(d.claims.status).not.toBe('active');
  });

  it('rejects an unverified org address', () => {
    expect(decideProvision({ ...good, emailVerified: false }).action).toBe('reject');
  });

  it('rejects other domains', () => {
    expect(decideProvision({ ...good, email: 'a@gmail.com' }).action).toBe('reject');
    expect(decideProvision({ ...good, email: 'a@example.com' }).action).toBe('reject');
  });

  it('rejects look-alike domains a naive endsWith would admit', () => {
    for (const email of [
      'a@evil-oursabeel.com',
      'a@oursabeel.com.attacker.net',
      'a@sub.oursabeel.com',
      'a@notoursabeel.com',
    ]) {
      expect(decideProvision({ ...good, email }).action, email).toBe('reject');
    }
  });

  it('rejects a missing email', () => {
    expect(decideProvision({ ...good, email: null }).action).toBe('reject');
    expect(decideProvision({ emailVerified: true }).action).toBe('reject');
  });

  it('falls back to the email local part when Google sends no display name', () => {
    for (const displayName of [null, '', '   ']) {
      const d = decideProvision({ ...good, displayName });
      if (d.action !== 'provision') throw new Error('expected provision');
      expect(d.profile.displayName).toBe('someone');
    }
  });

  it('tolerates a missing photo', () => {
    const d = decideProvision({ ...good, photoURL: null });
    if (d.action !== 'provision') throw new Error('expected provision');
    expect(d.profile.photoURL).toBeNull();
  });
});
