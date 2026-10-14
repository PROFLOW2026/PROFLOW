import { describe, expect, it } from 'vitest';
import { unifiedTeamHasMembers } from '@/modules/projects/domain/unified-project-team';

describe('setup checklist team signal', () => {
  it('hasTeam when only project capabilities exist', () => {
    expect(
      unifiedTeamHasMembers({
        roster: [],
        capabilities: [{ userId: 'u1', displayName: 'Ada', email: 'ada@example.com' }],
        access: [],
      }),
    ).toBe(true);
  });

  it('hasTeam false when all sources empty', () => {
    expect(
      unifiedTeamHasMembers({
        roster: [],
        capabilities: [],
        access: [],
      }),
    ).toBe(false);
  });
});
