import { describe, expect, it } from 'vitest';
import {
  buildClientArchivePatch,
  buildClientRestorePatch,
  isClientSoftArchived,
} from '@/modules/clients/domain/soft-archive';

describe('client soft-archive helpers', () => {
  it('archives with inactive status and archivedAt', () => {
    const now = new Date('2026-08-11T10:00:00.000Z');
    expect(buildClientArchivePatch(now)).toEqual({
      status: 'inactive',
      archivedAt: now,
    });
  });

  it('restores by nulling archivedAt and activating', () => {
    expect(buildClientRestorePatch()).toEqual({
      status: 'active',
      archivedAt: null,
    });
  });

  it('detects soft-archived rows via archivedAt', () => {
    expect(isClientSoftArchived({ archivedAt: new Date() })).toBe(true);
    expect(isClientSoftArchived({ archivedAt: null })).toBe(false);
  });
});
