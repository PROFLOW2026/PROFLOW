import { describe, expect, it, vi } from 'vitest';
import { resolveUwmTaskOverdueRecipients } from '@/modules/notifications/application/task-overdue-recipients';

vi.mock('@/modules/notifications/data/permission-holders.repository', () => ({
  listUserIdsWithPermission: vi.fn(async () => ['manager-1']),
}));

describe('resolveUwmTaskOverdueRecipients', () => {
  it('uses assignee/owner/follower ids when present', async () => {
    const recipients = await resolveUwmTaskOverdueRecipients(
      { db: {} as never, organizationId: 'org' } as never,
      {
        id: 'task-1',
        reference: 'Task',
        extra: null,
        deepLink: '/tasks/task-1',
        recipientUserIds: ['assignee-a', 'owner-b'],
      },
      8,
    );
    expect([...recipients].sort()).toEqual(['assignee-a', 'owner-b'].sort());
  });

  it('falls back to TASKS_MANAGE_ALL holders when task has no stakeholders', async () => {
    const recipients = await resolveUwmTaskOverdueRecipients(
      { db: {} as never, organizationId: 'org' } as never,
      {
        id: 'task-2',
        reference: 'Task',
        extra: null,
        deepLink: '/tasks/task-2',
        recipientUserIds: [],
      },
      8,
    );
    expect(recipients).toEqual(['manager-1']);
  });
});
