import { describe, expect, it } from 'vitest';
import { mergeProjectTeamSources } from '@/modules/projects/domain/unified-project-team';

describe('mergeProjectTeamSources', () => {
  it('merges roster and capabilities for the same user into one row with two tags', () => {
    const merged = mergeProjectTeamSources({
      roster: [
        { employeeId: 'e1', displayName: 'Alice', jobTitle: 'Foreman' },
      ],
      capabilities: [
        { userId: 'u1', displayName: 'Alice', email: 'alice@example.test' },
      ],
      access: [],
    });
    expect(merged).toHaveLength(2);
  });

  it('returns empty when all sources empty', () => {
    expect(
      mergeProjectTeamSources({ roster: [], capabilities: [], access: [] }),
    ).toHaveLength(0);
  });
});
