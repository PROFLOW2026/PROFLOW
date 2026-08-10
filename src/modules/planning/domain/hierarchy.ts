/**
 * Hierarchy integrity for planning work items.
 *
 * DB composite FKs cover project↔org and dependency ends; phase / work-package
 * same-project membership is enforced here before write (Agent A simple FKs).
 */

import { DomainRuleError } from '@/shared/errors';

export const PHASE_CROSS_PROJECT_MESSAGE = 'planning.hierarchy.phaseCrossProject';
export const WORK_PACKAGE_CROSS_PROJECT_MESSAGE = 'planning.hierarchy.workPackageCrossProject';
export const PROJECT_ORG_MISMATCH_MESSAGE = 'planning.hierarchy.projectOrgMismatch';
export const HIERARCHY_RESOLVER_REQUIRED_MESSAGE = 'planning.hierarchy.resolverRequired';

export interface PlanningHierarchyRef {
  readonly organizationId: string;
  readonly projectId: string;
}

export function assertPhaseBelongsToProject(
  phase: PlanningHierarchyRef | null | undefined,
  expected: PlanningHierarchyRef,
): void {
  if (
    !phase ||
    phase.organizationId !== expected.organizationId ||
    phase.projectId !== expected.projectId
  ) {
    throw new DomainRuleError(
      'Phase must belong to the same organization and project',
      PHASE_CROSS_PROJECT_MESSAGE,
    );
  }
}

export function assertWorkPackageBelongsToProject(
  workPackage: PlanningHierarchyRef | null | undefined,
  expected: PlanningHierarchyRef,
): void {
  if (
    !workPackage ||
    workPackage.organizationId !== expected.organizationId ||
    workPackage.projectId !== expected.projectId
  ) {
    throw new DomainRuleError(
      'Work package must belong to the same organization and project',
      WORK_PACKAGE_CROSS_PROJECT_MESSAGE,
    );
  }
}

export function assertProjectBelongsToOrganization(
  project: { readonly id: string; readonly organizationId: string } | null | undefined,
  expected: { readonly organizationId: string; readonly projectId: string },
): void {
  if (
    !project ||
    project.id !== expected.projectId ||
    project.organizationId !== expected.organizationId
  ) {
    throw new DomainRuleError(
      'Project must belong to the organization',
      PROJECT_ORG_MISMATCH_MESSAGE,
    );
  }
}
