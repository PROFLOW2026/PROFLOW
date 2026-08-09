import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates/dates';
import { deriveArtifactStatus, resolveArtifactStatus } from '@/modules/compliance/domain/status';

const today = businessDate('2026-08-09');

describe('deriveArtifactStatus', () => {
  it('returns valid when there is no expiry date', () => {
    expect(deriveArtifactStatus({ expiresOn: null, today })).toBe('valid');
    expect(deriveArtifactStatus({ expiresOn: undefined, today })).toBe('valid');
  });

  it('returns expired when expiry is before today', () => {
    expect(deriveArtifactStatus({ expiresOn: '2026-08-08', today })).toBe('expired');
    expect(deriveArtifactStatus({ expiresOn: '2025-01-01', today })).toBe('expired');
  });

  it('returns expiring_soon within 30 days inclusive', () => {
    expect(deriveArtifactStatus({ expiresOn: '2026-08-09', today })).toBe('expiring_soon');
    expect(deriveArtifactStatus({ expiresOn: '2026-09-08', today })).toBe('expiring_soon');
  });

  it('returns valid when expiry is more than 30 days away', () => {
    expect(deriveArtifactStatus({ expiresOn: '2026-09-09', today })).toBe('valid');
    expect(deriveArtifactStatus({ expiresOn: '2027-01-01', today })).toBe('valid');
  });

  it('preserves manual pending and revoked', () => {
    expect(
      deriveArtifactStatus({ expiresOn: '2027-01-01', manualStatus: 'pending', today }),
    ).toBe('pending');
    expect(
      deriveArtifactStatus({ expiresOn: '2025-01-01', manualStatus: 'revoked', today }),
    ).toBe('revoked');
  });
});

describe('resolveArtifactStatus', () => {
  it('keeps stored manual statuses', () => {
    expect(
      resolveArtifactStatus({
        expiresOn: '2025-01-01',
        storedStatus: 'pending',
        today,
      }),
    ).toBe('pending');
  });

  it('re-derives non-manual statuses from expiry', () => {
    expect(
      resolveArtifactStatus({
        expiresOn: '2026-08-01',
        storedStatus: 'valid',
        today,
      }),
    ).toBe('expired');
  });
});
