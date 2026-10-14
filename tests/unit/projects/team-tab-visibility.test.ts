import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveProjectTeamTabVisible } from '@/modules/projects/application/resolve-project-team-tab-visible';

describe('resolveProjectTeamTabVisible', () => {
  it('shows team tab with project read but without workforce read', () => {
    const can = (key: string) => key === PERMISSIONS.PROJECTS_READ;
    expect(resolveProjectTeamTabVisible(can)).toBe(true);
  });

  it('hides team tab without workforce or project read', () => {
    const can = () => false;
    expect(resolveProjectTeamTabVisible(can)).toBe(false);
  });
});
