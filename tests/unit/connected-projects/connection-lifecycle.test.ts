import { describe, expect, it } from 'vitest';
import { invitationRuntimeState, mappingBlocksSync } from '@/modules/connected-projects/domain/connection-lifecycle';

describe('connection invitation runtime state', () => {
  const base = {
    status: 'issued' as const,
    expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    consumedAt: null as Date | null,
    revokedAt: null as Date | null,
  };

  it('marks issued invitations past expiresAt as expired', () => {
    expect(invitationRuntimeState(base, new Date('2026-12-02T00:00:00.000Z'))).toBe('expired');
    expect(invitationRuntimeState(base, new Date('2026-11-01T00:00:00.000Z'))).toBe('valid');
  });

  it('treats consumed and revoked rows before expiry', () => {
    expect(
      invitationRuntimeState({ ...base, consumedAt: new Date('2026-10-01T00:00:00.000Z'), status: 'consumed' }),
    ).toBe('consumed');
    expect(
      invitationRuntimeState({ ...base, revokedAt: new Date('2026-10-01T00:00:00.000Z'), status: 'revoked' }),
    ).toBe('revoked');
  });

  it('honours explicit expired status even before timestamp', () => {
    expect(
      invitationRuntimeState({
        ...base,
        status: 'expired',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      }),
    ).toBe('expired');
  });
});

describe('connected mapping lifecycle helpers', () => {
  it('blocks sync when revoked', () => {
    expect(mappingBlocksSync({ status: 'active', revokedAt: new Date() })).toBe(true);
    expect(mappingBlocksSync({ status: 'revoked', revokedAt: null })).toBe(true);
    expect(mappingBlocksSync({ status: 'active', revokedAt: null })).toBe(false);
  });

});
