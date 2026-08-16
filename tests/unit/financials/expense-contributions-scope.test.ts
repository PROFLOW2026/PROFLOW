import { describe, expect, it } from 'vitest';
import { loadExpenseContributionsForProjects } from '@/modules/financials/data/expenses.repository';

describe('loadExpenseContributionsForProjects', () => {
  it('returns no rows without querying when the project id set is empty', async () => {
    const contributions = await loadExpenseContributionsForProjects(
      // Intentionally unused - empty scope must short-circuit.
      null as never,
      'org-1',
      [],
    );
    expect(contributions).toEqual([]);
  });
});
