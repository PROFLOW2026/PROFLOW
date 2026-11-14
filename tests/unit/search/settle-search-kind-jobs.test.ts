import { describe, expect, it } from 'vitest';
import { flattenSettledSearchKindJobs } from '@/modules/search/domain/settle-search-kind-jobs';

describe('flattenSettledSearchKindJobs (BUG-014)', () => {
  it('keeps fulfilled kinds when an optional kind rejects', async () => {
    const settled = await Promise.allSettled([
      Promise.resolve([{ id: 'task-1' }]),
      Promise.reject(new Error('relation "public.project_risks" does not exist')),
      Promise.resolve([{ id: 'project-1' }]),
    ]);

    expect(flattenSettledSearchKindJobs(settled)).toEqual([
      { id: 'task-1' },
      { id: 'project-1' },
    ]);
  });

  it('returns empty when every kind rejects', async () => {
    const settled = await Promise.allSettled([
      Promise.reject(new Error('missing work_permits')),
      Promise.reject(new Error('missing project_risks')),
    ]);
    expect(flattenSettledSearchKindJobs(settled)).toEqual([]);
  });
});
