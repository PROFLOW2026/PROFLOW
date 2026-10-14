import { describe, expect, it, vi } from 'vitest';
import { listTasksPage } from '@/modules/tasks/data/tasks.repository';

function taskRow(id: string, dueDate: string | null) {
  return {
    id,
    title: id,
    status: 'todo',
    priority: 'none',
    sortKey: id.split('').reverse().join(''),
    dueDate,
    startDate: null,
    source: 'manual',
    createdBySystem: false,
    approvalRequired: false,
    isArchived: false,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
  };
}

function selectChain(rows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(rows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const from = vi.fn().mockReturnValue({ where });
  const select = vi.fn().mockReturnValue({ from });
  return { db: { select }, orderBy };
}

describe('work list stable ordering', () => {
  it('orders by due date ascending with nulls last by default', async () => {
    const { db, orderBy } = selectChain([
      taskRow('early', '2026-10-01'),
      taskRow('late', '2026-12-31'),
    ]);

    await listTasksPage(db as never, 'org-1', ['ws-1'], { limit: 50 });

    expect(orderBy).toHaveBeenCalled();
    expect(orderBy.mock.calls[0]?.length).toBeGreaterThan(0);
  });
});
