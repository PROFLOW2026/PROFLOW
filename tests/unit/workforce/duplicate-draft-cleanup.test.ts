import { describe, expect, it } from 'vitest';
import { planExactDuplicateDraftRemovals } from '@/modules/workforce/domain/duplicate-draft-cleanup';

function draft(input: {
  id: string;
  employeeId?: string;
  workDate?: string;
  hours?: string;
  projectId?: string | null;
  kind?: string;
  approvalStatus?: string;
  status?: string;
  createdAt?: Date;
}) {
  return {
    id: input.id,
    employeeId: input.employeeId ?? 'emp-1',
    workDate: input.workDate ?? '2026-07-15',
    hours: input.hours ?? '8',
    projectId: input.projectId ?? 'proj-1',
    kind: input.kind ?? 'project',
    approvalStatus: input.approvalStatus ?? 'draft',
    status: input.status ?? 'recorded',
    archivedAt: null as Date | null,
    createdAt: input.createdAt ?? new Date('2026-07-01T10:00:00Z'),
  };
}

describe('planExactDuplicateDraftRemovals', () => {
  it('keeps oldest draft and marks later exact duplicates for removal', () => {
    const older = draft({ id: 'a', createdAt: new Date('2026-07-01T08:00:00Z') });
    const newer = draft({ id: 'b', createdAt: new Date('2026-07-01T09:00:00Z') });
    const plans = planExactDuplicateDraftRemovals([newer, older]);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.keepId).toBe('a');
    expect(plans[0]!.removeIds).toEqual(['b']);
  });

  it('ignores approved rows and non-matching drafts', () => {
    const approved = draft({
      id: 'approved',
      approvalStatus: 'approved',
      createdAt: new Date('2026-07-01T07:00:00Z'),
    });
    const draftA = draft({ id: 'd1', hours: '8' });
    const draftB = draft({ id: 'd2', hours: '7' });
    expect(planExactDuplicateDraftRemovals([approved, draftA, draftB])).toEqual([]);
  });

  it('groups multiple extras in one keep/remove plan', () => {
    const keep = draft({ id: 'keep', createdAt: new Date('2026-07-01T01:00:00Z') });
    const mid = draft({ id: 'mid', createdAt: new Date('2026-07-01T02:00:00Z') });
    const last = draft({ id: 'last', createdAt: new Date('2026-07-01T03:00:00Z') });
    const plans = planExactDuplicateDraftRemovals([last, keep, mid]);
    expect(plans[0]!.keepId).toBe('keep');
    expect(plans[0]!.removeIds).toEqual(['mid', 'last']);
  });
});
