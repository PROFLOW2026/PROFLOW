import { describe, expect, it } from 'vitest';
import { buildProjectRestorePatch } from '@/modules/projects/domain/soft-archive';

describe('restore archived project status', () => {
  it('restores completed when the archive before status was completed', () => {
    expect(
      buildProjectRestorePatch({
        id: 'project-1',
        status: 'completed',
        name: 'Finished job',
      }),
    ).toEqual({
      status: 'completed',
      archivedAt: null,
    });
  });

  it('restores cancelled when the archive before status was cancelled', () => {
    expect(buildProjectRestorePatch({ status: 'cancelled' })).toEqual({
      status: 'cancelled',
      archivedAt: null,
    });
  });

  it('restores active when before is missing, invalid, or archived', () => {
    const fallbacks = [
      undefined,
      null,
      {},
      { name: 'No status' },
      { status: null },
      { status: 'archived' },
      { status: 'not-a-status' },
    ];

    for (const before of fallbacks) {
      expect(buildProjectRestorePatch(before)).toEqual({
        status: 'active',
        archivedAt: null,
      });
    }
  });

  it('restores the other live statuses recorded before archive', () => {
    expect(buildProjectRestorePatch({ status: 'draft' }).status).toBe('draft');
    expect(buildProjectRestorePatch({ status: 'on_hold' }).status).toBe('on_hold');
    expect(buildProjectRestorePatch({ status: 'active' }).status).toBe('active');
  });
});
