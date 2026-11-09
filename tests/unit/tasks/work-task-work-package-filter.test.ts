import { describe, expect, it, vi } from 'vitest';
import { parseWorkTaskListFilters } from '@/modules/tasks/domain/work-task-search-params';
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

describe('parseWorkTaskListFilters workPackageId', () => {
  it('maps workPackageId from URL query', () => {
    const filters = parseWorkTaskListFilters({ workPackageId: '018f1234-5678-7abc-8def-0123456789ab' });
    expect(filters.workPackageId).toBe('018f1234-5678-7abc-8def-0123456789ab');
  });

  it('ignores empty workPackageId', () => {
    const filters = parseWorkTaskListFilters({});
    expect(filters.workPackageId).toBeUndefined();
  });
});

describe('listTasksPage workPackageId filter', () => {
  it('applies eq on tasks.workPackageId', async () => {
    const workPackageId = '018f1234-5678-7abc-8def-0123456789cd';
    const { db, where } = listSelectChain([
      {
        id: 'task-1',
        title: 'Package task',
        status: 'todo',
        priority: 'none',
        sortKey: 'a',
        source: 'manual',
        createdBySystem: false,
        approvalRequired: false,
        isArchived: false,
        organizationId: 'org-1',
        workspaceId: 'ws-1',
        workPackageId,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await listTasksPage(
      db as never,
      'org-1',
      ['ws-1'],
      { workPackageId, limit: 50 },
      { accessibleProjectIds: null },
    );

    expect(where).toHaveBeenCalledTimes(1);
    expect(db.select).toHaveBeenCalledTimes(1);
  });
});
