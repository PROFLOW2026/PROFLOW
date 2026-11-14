import { describe, expect, it } from 'vitest';
import { resolveProjectGoalsCapabilities } from '@/modules/project-goals/domain/permissions';

describe('project goals capability resolver (BUG-009 / BUG-015)', () => {
  it('lets an internal viewer list without edit when mutation permissions are missing', () => {
    const caps = resolveProjectGoalsCapabilities({
      actorKind: 'internal',
      canAccessProject: true,
      canMutateGoals: false,
    });
    expect(caps).toEqual({ canView: true, canEdit: false, viewOnly: true });
  });

  it('gives the same view+edit to employee and main when permissions match', () => {
    const caps = resolveProjectGoalsCapabilities({
      actorKind: 'internal',
      canAccessProject: true,
      canMutateGoals: true,
    });
    expect(caps).toEqual({ canView: true, canEdit: true, viewOnly: false });
  });

  it('denies internal access without project.view', () => {
    const caps = resolveProjectGoalsCapabilities({
      actorKind: 'internal',
      canAccessProject: false,
      canMutateGoals: true,
    });
    expect(caps.canView).toBe(false);
    expect(caps.canEdit).toBe(false);
  });

  it('never grants contractor edit; view is route-level only (data filtered separately)', () => {
    const withGrant = resolveProjectGoalsCapabilities({
      actorKind: 'external',
      canAccessProject: true,
      canMutateGoals: true,
      hasContractorVisibleGoals: false,
    });
    expect(withGrant.canEdit).toBe(false);
    expect(withGrant.canView).toBe(true);
    expect(withGrant.viewOnly).toBe(true);

    const noGrant = resolveProjectGoalsCapabilities({
      actorKind: 'external',
      canAccessProject: false,
      canMutateGoals: false,
    });
    expect(noGrant.canView).toBe(false);
  });
});
