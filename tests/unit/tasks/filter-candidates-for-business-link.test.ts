import { describe, expect, it } from 'vitest';
import { filterCandidatesForBusinessLink } from '@/modules/tasks/application/list-linkable-project-tasks';

describe('filterCandidatesForBusinessLink', () => {
  it('keeps same-project tasks and drops already linked', () => {
    const candidates = [
      { id: 't1', projectId: 'p1' },
      { id: 't2', projectId: 'p1' },
      { id: 't3', projectId: 'p2' },
    ];
    const result = filterCandidatesForBusinessLink(candidates, 'p1', new Set(['t2']));
    expect(result.map((row) => row.id)).toEqual(['t1']);
  });
});
