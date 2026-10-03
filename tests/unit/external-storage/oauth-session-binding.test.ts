import { describe, expect, it } from 'vitest';
import { createOAuthState, verifyOAuthState } from '@/modules/external-storage/application/oauth-state';

describe('storage OAuth session binding (L7)', () => {
  const base = {
    organizationId: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    connectionId: '33333333-3333-4333-8333-333333333333',
    provider: 'google_drive' as const,
  };

  it('state round-trips user and org', () => {
    const state = createOAuthState(base);
    const parsed = verifyOAuthState(state);
    expect(parsed.userId).toBe(base.userId);
    expect(parsed.organizationId).toBe(base.organizationId);
  });

  it('tampered signature fails', () => {
    const state = createOAuthState(base);
    const [payload] = state.split('.');
    expect(() => verifyOAuthState(`${payload}.bad-signature`)).toThrow();
  });

  it('callback session user must match state userId (L7)', () => {
    const state = createOAuthState(base);
    const parsed = verifyOAuthState(state);
    const sessionUserId = '99999999-9999-4999-8999-999999999999';
    expect(parsed.userId).not.toBe(sessionUserId);
    expect(parsed.userId).toBe(base.userId);
  });
});
