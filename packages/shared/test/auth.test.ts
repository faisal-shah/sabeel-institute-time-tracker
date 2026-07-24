import { describe, it, expect } from 'vitest';
import { isAllowedEmail, ALLOWED_EMAIL_DOMAIN } from '../src';

describe('isAllowedEmail', () => {
  it('accepts a verified org-domain address', () => {
    expect(isAllowedEmail('someone@oursabeel.com', true)).toBe(true);
    expect(isAllowedEmail('Someone.Name@OurSabeel.com', true)).toBe(true); // case-insensitive
  });

  it('rejects an unverified org address', () => {
    expect(isAllowedEmail('someone@oursabeel.com', false)).toBe(false);
  });

  it('rejects non-org domains', () => {
    expect(isAllowedEmail('someone@gmail.com', true)).toBe(false);
    expect(isAllowedEmail('someone@example.com', true)).toBe(false);
  });

  it('rejects look-alike domains that a naive endsWith would let through', () => {
    expect(isAllowedEmail('x@evil-oursabeel.com', true)).toBe(false);
    expect(isAllowedEmail('x@oursabeel.com.attacker.net', true)).toBe(false);
    expect(isAllowedEmail('x@sub.oursabeel.com', true)).toBe(false); // subdomain is a different domain
  });

  it('rejects empty / malformed input', () => {
    expect(isAllowedEmail(null, true)).toBe(false);
    expect(isAllowedEmail(undefined, true)).toBe(false);
    expect(isAllowedEmail('', true)).toBe(false);
    expect(isAllowedEmail('no-at-sign', true)).toBe(false);
  });

  it('pins the domain constant', () => {
    expect(ALLOWED_EMAIL_DOMAIN).toBe('oursabeel.com');
  });
});
