import { describe, expect, it } from 'vitest';
import {
  acknowledgementPending,
  contractorCanSeeDrawing,
  planRevisionPublish,
  suggestNextRevisionLabel,
} from '@/modules/project-plans/domain/revisions';

describe('plan revision domain rules', () => {
  it('suggests the next revision label', () => {
    expect(suggestNextRevisionLabel(null)).toBe('0');
    expect(suggestNextRevisionLabel('3')).toBe('4');
    expect(suggestNextRevisionLabel('P02')).toBe('P03');
  });

  it('supersedes the current revision when publishing a draft', () => {
    const plan = planRevisionPublish(
      [
        { id: 'a', sequence: 1, status: 'current', fileReady: true, revisionLabel: '1' },
        { id: 'b', sequence: 2, status: 'draft', fileReady: true, revisionLabel: '2' },
      ],
      'b',
    );
    expect(plan).toEqual({ ok: true, publishId: 'b', supersedeId: 'a' });
  });

  it('blocks publish when a newer revision is already published', () => {
    const plan = planRevisionPublish(
      [
        { id: 'a', sequence: 2, status: 'current', fileReady: true, revisionLabel: '2' },
        { id: 'b', sequence: 1, status: 'draft', fileReady: true, revisionLabel: '1' },
      ],
      'b',
    );
    expect(plan).toEqual({ ok: false, reason: 'newer_published' });
  });

  it('computes contractor visibility and acknowledgement pending', () => {
    expect(
      contractorCanSeeDrawing({
        status: 'active',
        hasPublishedRevision: true,
        visibility: 'all_contractors',
        hasPlanViewOnProject: true,
        distributedToContractor: false,
      }),
    ).toBe(true);
    expect(
      acknowledgementPending({
        revisionStatus: 'current',
        acknowledgementRequired: true,
        acknowledgedByMe: false,
      }),
    ).toBe(true);
  });
});
