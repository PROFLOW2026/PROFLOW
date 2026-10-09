import { describe, expect, it, vi } from 'vitest';
import { queryMyWork } from '@/modules/tasks/data/my-work.repository';

function assignedToMeSelectChain(taskRows: unknown[]) {
  const offset = vi.fn().mockResolvedValue(taskRows);
  const limit = vi.fn().mockReturnValue({ offset });
  const orderBy = vi.fn().mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ orderBy });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  const selectDistinctOn = vi.fn().mockReturnValue({ from });
  return {
    db: { selectDistinctOn, from, innerJoin, where, orderBy, limit, offset },
    limit,
    innerJoin,
    selectDistinctOn,
  };
}

describe('my work assigned_to_me', () => {
  it('uses a single JOIN query with limit+1 (no unbounded ID list)', async () => {
    const taskRows = [{ id: 'task-1', title: 'Example' }];
    const { db, limit, innerJoin, selectDistinctOn } = assignedToMeSelectChain(taskRows);

    const tasks = await queryMyWork(db as never, {
      orgMemberId: 'mem-1',
      assigneeEmployeeId: 'emp-1',
      organizationId: 'org-1',
      workspaceIds: ['ws-1'],
      view: 'assigned_to_me',
      today: '2026-10-10',
      limit: 10,
    });

    expect(tasks).toHaveLength(1);
    expect(innerJoin).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(11);
    expect(selectDistinctOn).toHaveBeenCalledTimes(1);
  });

  it('returns empty when no assignee identity is available', async () => {
    const db = { selectDistinctOn: vi.fn() };

    const tasks = await queryMyWork(db as never, {
      orgMemberId: '',
      assigneeEmployeeId: null,
      organizationId: 'org-1',
      workspaceIds: ['ws-1'],
      view: 'assigned_to_me',
      today: '2026-10-10',
    });

    expect(tasks).toEqual([]);
    expect(db.selectDistinctOn).not.toHaveBeenCalled();
  });
});
