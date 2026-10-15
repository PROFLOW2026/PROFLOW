import { describe, expect, it } from 'vitest';
import { parseWorkTaskListFilters } from '@/modules/tasks/domain/work-task-search-params';

describe('parseWorkTaskListFilters archived lens', () => {
  it('maps archived=true to archivedOnly and includeArchived', () => {
    const filters = parseWorkTaskListFilters({ archived: 'true' });
    expect(filters.archivedOnly).toBe(true);
    expect(filters.includeArchived).toBe(true);
  });

  it('ignores archived when not set', () => {
    const filters = parseWorkTaskListFilters({});
    expect(filters.archivedOnly).toBeUndefined();
    expect(filters.includeArchived).toBeUndefined();
  });
});
