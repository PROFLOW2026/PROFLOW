/**
 * ONE capability model for project goals across main, employee, and contractor surfaces.
 *
 * Surface (app type) never grants or denies alone — only permissions / grants do.
 *
 * Internal (main + employee):
 * - VIEW: project capability `project.view`
 * - EDIT: org permission `projects.update` OR `planning.write` (BUG-009 by design; matches RLS 0201)
 *
 * Contractor (external):
 * - VIEW: only goals explicitly marked contractor-visible — never the full list via
 *   `ext.project.view` / generic project view (intentional no-leak).
 * - EDIT: never (managers edit on internal surfaces only).
 *
 * Documented in `docs/product/infra-three-surface-parity-matrix.md` (Project goals section).
 */

export type ProjectGoalsActorKind = 'internal' | 'external';

export interface ProjectGoalsPermissionFacts {
  readonly actorKind: ProjectGoalsActorKind;
  /** Internal: holds project.view. External: holds a project-covering grant (route gate only). */
  readonly canAccessProject: boolean;
  /** Internal only: projects.update | planning.write. Always false for external. */
  readonly canMutateGoals: boolean;
  /**
   * External only: true when at least one goal is marked visible to this contractor.
   * Without a visibility column (migrations frozen), resolvers pass false → fail-closed empty view.
   */
  readonly hasContractorVisibleGoals?: boolean;
}

export interface ProjectGoalsCapabilities {
  /** May open the goals surface and see the authorized subset. */
  readonly canView: boolean;
  /** May create / update goal status. */
  readonly canEdit: boolean;
  /** True when the actor may view but not edit (UX: view-only banner). */
  readonly viewOnly: boolean;
}

export function resolveProjectGoalsCapabilities(
  facts: ProjectGoalsPermissionFacts,
): ProjectGoalsCapabilities {
  if (facts.actorKind === 'external') {
    // Route may be reachable with a project grant; data is never the full internal list.
    const canView = facts.canAccessProject;
    return { canView, canEdit: false, viewOnly: canView };
  }

  const canView = facts.canAccessProject;
  const canEdit = canView && facts.canMutateGoals;
  return {
    canView,
    canEdit,
    viewOnly: canView && !canEdit,
  };
}

/** Pure helper mirroring RLS write keys (0201) / `assertProjectGoalMutationAccess`. */
export function hasProjectGoalMutationPermission(canMutateGoals: boolean): boolean {
  return canMutateGoals;
}
