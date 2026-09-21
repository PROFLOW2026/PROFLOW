import { describe, expect, it } from 'vitest';
import {
  isProjectTemplateApproved,
  readProjectTemplateCapability,
  withProjectTemplateCapability,
} from '@/modules/external-storage/domain/project-template';

describe('project template capabilities', () => {
  it('defaults to pending approval when missing', () => {
    expect(readProjectTemplateCapability(undefined)).toEqual({
      status: 'pending_approval',
      externalFolderId: null,
      approvedAt: null,
    });
    expect(isProjectTemplateApproved({})).toBe(false);
  });

  it('reads approved status', () => {
    const caps = withProjectTemplateCapability(
      {},
      {
        status: 'approved',
        externalFolderId: 'tmpl-1',
        approvedAt: '2026-01-01T00:00:00.000Z',
      },
    );
    expect(isProjectTemplateApproved(caps)).toBe(true);
    expect(readProjectTemplateCapability(caps).externalFolderId).toBe('tmpl-1');
  });

  it('preserves folder id when marking editing', () => {
    const base = withProjectTemplateCapability(
      {},
      { status: 'pending_approval', externalFolderId: 'tmpl-2' },
    );
    const next = withProjectTemplateCapability(base, { status: 'editing' });
    expect(readProjectTemplateCapability(next)).toMatchObject({
      status: 'editing',
      externalFolderId: 'tmpl-2',
    });
  });
});
