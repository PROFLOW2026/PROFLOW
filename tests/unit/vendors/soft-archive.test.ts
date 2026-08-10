import { describe, expect, it } from 'vitest';
import {
  buildVendorArchivePatch,
  buildVendorRestorePatch,
  isVendorSoftArchived,
} from '@/modules/vendors/domain/soft-archive';

describe('vendor soft-archive helpers', () => {
  it('archives with inactive status and archivedAt', () => {
    const now = new Date('2026-08-11T10:00:00.000Z');
    expect(buildVendorArchivePatch(now)).toEqual({
      status: 'inactive',
      archivedAt: now,
    });
  });

  it('restores by nulling archivedAt and activating', () => {
    expect(buildVendorRestorePatch()).toEqual({
      status: 'active',
      archivedAt: null,
    });
  });

  it('detects soft-archived rows via archivedAt', () => {
    expect(isVendorSoftArchived({ archivedAt: new Date() })).toBe(true);
    expect(isVendorSoftArchived({ archivedAt: null })).toBe(false);
  });
});
