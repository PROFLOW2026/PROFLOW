import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { resolveTaskPostponementManagerRecipientUserIds } from '@/modules/tasks/application/notify-task-postponed-by-employee';

vi.mock('@/modules/recurring-drafts/application/ops-worker', () => ({
  findActiveOrgOwnerUserId: vi.fn().mockResolvedValue({ userId: 'owner-user' }),
}));

vi.mock('@/modules/projects/application/project-participants', () => ({
  listEffectiveProjectParticipants: vi.fn().mockResolvedValue([
    {
      participantKey: 'm:mem-1',
      kind: 'org_member',
      employeeId: null,
      orgMemberId: 'mem-1',
      userId: 'pm-user',
      displayName: 'PM',
      jobTitle: null,
      assignmentRole: 'project_manager',
      isProjectManager: true,
    },
    {
      participantKey: 'e:emp-2',
      kind: 'employee',
      employeeId: 'emp-2',
      orgMemberId: null,
      userId: 'assignee-user',
      displayName: 'Worker',
      jobTitle: null,
      assignmentRole: null,
      isProjectManager: false,
    },
  ]),
}));

function testContext(): OrgContext {
  return {
    userId: 'actor-user',
    organizationId: 'org-1',
    membershipId: 'mem-actor',
    locale: 'he-IL',
    db: {} as OrgContext['db'],
    organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions: new Map() as OrgContext['permissions'],
    roleKeys: ['employee'],
  };
}

describe('resolveTaskPostponementManagerRecipientUserIds', () => {
  it('notifies org owner and project managers only', async () => {
    const recipients = await resolveTaskPostponementManagerRecipientUserIds(testContext(), {
      projectId: 'proj-1',
    });
    expect(recipients.sort()).toEqual(['owner-user', 'pm-user'].sort());
    expect(recipients).not.toContain('assignee-user');
  });

  it('notifies org owner when task has no project', async () => {
    const recipients = await resolveTaskPostponementManagerRecipientUserIds(testContext(), {
      projectId: null,
    });
    expect(recipients).toEqual(['owner-user']);
  });
});
