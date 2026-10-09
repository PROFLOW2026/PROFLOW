import { describe, expect, it, vi } from 'vitest';
import { listTasksPage } from '@/modules/tasks/data/tasks.repository';

function listSelectChain(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select }, where, limit };
}

describe('listTasksPage clientId filter', () => {
  it('applies client filter in SQL before limit+1', async () => {
    const { db, where, limit } = listSelectChain([
      {
        id: 'task-1',
        title: 'Pour',
        status: 'todo',
        priority: 'none',
        sortKey: 'a',
        source: 'manual',
        createdBySystem: false,
        approvalRequired: false,
        isArchived: false,
        organizationId: 'org-1',
        workspaceId: 'ws-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const page = await listTasksPage(
      db as never,
      'org-1',
      ['ws-1'],
      { clientId: 'client-9', limit: 50 },
      { accessibleProjectIds: null },
    );

    expect(page.tasks).toHaveLength(1);
    expect(limit).toHaveBeenCalledWith(51);
    expect(where).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
