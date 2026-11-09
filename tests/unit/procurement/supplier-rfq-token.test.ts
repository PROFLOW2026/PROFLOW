import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assessSupplierRfqAccessTokenValidity,
  hashSupplierRfqAccessToken,
  isSupplierRfqAccessTokenConsumed,
  isSupplierRfqAccessTokenExpired,
} from '@/modules/procurement/domain/supplier-rfq-access-token';

describe('supplier RFQ access token helpers', () => {
  it('hashes raw tokens with SHA-256 hex and trims whitespace', () => {
    const raw = '  test-token-value  ';
    const expected = createHash('sha256').update('test-token-value', 'utf8').digest('hex');
    expect(hashSupplierRfqAccessToken(raw)).toBe(expected);
    expect(hashSupplierRfqAccessToken('test-token-value')).toBe(expected);
  });

  it('detects expiry against a reference clock', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    expect(isSupplierRfqAccessTokenExpired(new Date('2026-01-15T11:59:59.000Z'), now)).toBe(true);
    expect(isSupplierRfqAccessTokenExpired(new Date('2026-01-15T12:00:01.000Z'), now)).toBe(false);
  });

  it('detects consumed tokens', () => {
    expect(isSupplierRfqAccessTokenConsumed(null)).toBe(false);
    expect(isSupplierRfqAccessTokenConsumed(undefined)).toBe(false);
    expect(isSupplierRfqAccessTokenConsumed(new Date())).toBe(true);
  });

  it('treats single-use consumption as irreversible for validity checks', () => {
    const usedAt = new Date('2026-05-01T00:00:00.000Z');
    expect(isSupplierRfqAccessTokenConsumed(usedAt)).toBe(true);
    expect(
      assessSupplierRfqAccessTokenValidity({
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        usedAt,
        now: new Date('2026-06-01T00:00:00.000Z'),
      }).kind,
    ).toBe('used');
  });

  it('assesses validity in priority order: used, then expired, else valid', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    expect(
      assessSupplierRfqAccessTokenValidity({
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        usedAt: new Date('2026-05-01T00:00:00.000Z'),
        now,
      }),
    ).toEqual({ kind: 'used' });

    expect(
      assessSupplierRfqAccessTokenValidity({
        expiresAt: new Date('2026-05-01T00:00:00.000Z'),
        usedAt: null,
        now,
      }),
    ).toEqual({ kind: 'expired' });

    expect(
      assessSupplierRfqAccessTokenValidity({
        expiresAt: new Date('2026-07-01T00:00:00.000Z'),
        usedAt: null,
        now,
      }),
    ).toEqual({ kind: 'valid' });
  });
});
