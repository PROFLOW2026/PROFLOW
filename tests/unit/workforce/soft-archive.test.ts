import { describe, expect, it } from 'vitest';
import {
  buildEmployeeArchivePatch,
  buildEmployeeRestorePatch,
  isEmployeeSoftArchived,
} from '@/modules/workforce/domain/soft-archive';

describe('employee soft-archive helpers', () => {
  it('archives with inactive status and archivedAt', () => {
    const now = new Date('2026-08-11T10:00:00.000Z');
    expect(buildEmployeeArchivePatch(now)).toEqual({
      status: 'inactive',
      archivedAt: now,
    });
  });

  it('restores by nulling archivedAt and activating', () => {
    expect(buildEmployeeRestorePatch()).toEqual({
      status: 'active',
      archivedAt: null,
    });
  });

  it('detects soft-archived rows via archivedAt', () => {
    expect(isEmployeeSoftArchived({ archivedAt: new Date() })).toBe(true);
    expect(isEmployeeSoftArchived({ archivedAt: null })).toBe(false);
  });
});
