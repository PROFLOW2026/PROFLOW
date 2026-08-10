import { describe, expect, it } from 'vitest';
import {
  buildProjectArchivePatch,
  buildProjectRestorePatch,
  isProjectLifecycleClosed,
  isProjectSoftArchived,
} from '@/modules/projects/domain/soft-archive';

describe('project soft-archive helpers', () => {
  it('archives with archived status and archivedAt', () => {
    const now = new Date('2026-08-11T10:00:00.000Z');
    expect(buildProjectArchivePatch(now)).toEqual({
      status: 'archived',
      archivedAt: now,
    });
  });

  it('restores by nulling archivedAt and returning to active', () => {
    expect(buildProjectRestorePatch()).toEqual({
      status: 'active',
      archivedAt: null,
    });
  });

  it('treats archived status or archivedAt as soft-archived', () => {
    expect(isProjectSoftArchived({ status: 'archived', archivedAt: null })).toBe(true);
    expect(isProjectSoftArchived({ status: 'active', archivedAt: new Date() })).toBe(true);
    expect(isProjectSoftArchived({ status: 'completed', archivedAt: null })).toBe(false);
    expect(isProjectSoftArchived({ status: 'cancelled', archivedAt: null })).toBe(false);
  });

  it('distinguishes completed/cancelled from soft-archive', () => {
    expect(isProjectLifecycleClosed('completed')).toBe(true);
    expect(isProjectLifecycleClosed('cancelled')).toBe(true);
    expect(isProjectLifecycleClosed('archived')).toBe(false);
    expect(isProjectLifecycleClosed('active')).toBe(false);
  });
});
