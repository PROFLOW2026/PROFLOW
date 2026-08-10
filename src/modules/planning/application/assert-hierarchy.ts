import { findPhaseById, findProjectById, findWorkPackageById } from '@/modules/projects';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError } from '@/shared/errors';
import {
  assertPhaseBelongsToProject,
  assertProjectBelongsToOrganization,
  assertWorkPackageBelongsToProject,
  HIERARCHY_RESOLVER_REQUIRED_MESSAGE,
  type PlanningHierarchyRef,
} from '../domain/hierarchy';

export interface PlanningHierarchyLookups {
  readonly findProject?: (
    organizationId: string,
    projectId: string,
  ) => Promise<{ id: string; organizationId: string } | null>;
  readonly findPhase?: (
    organizationId: string,
    phaseId: string,
  ) => Promise<PlanningHierarchyRef | null>;
  readonly findWorkPackage?: (
    organizationId: string,
    workPackageId: string,
  ) => Promise<PlanningHierarchyRef | null>;
}

/**
 * Validates work-item project/org consistency and optional phase / WP links.
 * Call before every upsert that may set phaseId or workPackageId.
 */
export async function assertPlanningHierarchy(input: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly phaseId: string | null;
  readonly workPackageId: string | null;
  readonly db?: DbExecutor | null;
  readonly lookups?: PlanningHierarchyLookups;
  /** When true, always resolve project (even if phase/WP unset). */
  readonly requireProject?: boolean;
}): Promise<void> {
  const expected: PlanningHierarchyRef = {
    organizationId: input.organizationId,
    projectId: input.projectId,
  };

  const findProject =
    input.lookups?.findProject ??
    (input.db
      ? async (organizationId: string, projectId: string) => {
          const row = await findProjectById(input.db!, organizationId, projectId);
          return row
            ? { id: row.id, organizationId: row.organizationId }
            : null;
        }
      : null);

  const findPhase =
    input.lookups?.findPhase ??
    (input.db
      ? async (organizationId: string, phaseId: string) => {
          const row = await findPhaseById(input.db!, organizationId, phaseId);
          return row
            ? { organizationId: row.organizationId, projectId: row.projectId }
            : null;
        }
      : null);

  const findWorkPackage =
    input.lookups?.findWorkPackage ??
    (input.db
      ? async (organizationId: string, workPackageId: string) => {
          const row = await findWorkPackageById(input.db!, organizationId, workPackageId);
          return row
            ? { organizationId: row.organizationId, projectId: row.projectId }
            : null;
        }
      : null);

  const needsResolution =
    input.requireProject === true || input.phaseId != null || input.workPackageId != null;

  if (!needsResolution) return;

  if (findProject) {
    const project = await findProject(input.organizationId, input.projectId);
    assertProjectBelongsToOrganization(project, {
      organizationId: input.organizationId,
      projectId: input.projectId,
    });
  } else if (input.requireProject) {
    throw new DomainRuleError(
      'Planning hierarchy validation requires a project resolver',
      HIERARCHY_RESOLVER_REQUIRED_MESSAGE,
    );
  }

  if (input.phaseId) {
    if (!findPhase) {
      throw new DomainRuleError(
        'Planning hierarchy validation requires a phase resolver',
        HIERARCHY_RESOLVER_REQUIRED_MESSAGE,
      );
    }
    const phase = await findPhase(input.organizationId, input.phaseId);
    assertPhaseBelongsToProject(phase, expected);
  }

  if (input.workPackageId) {
    if (!findWorkPackage) {
      throw new DomainRuleError(
        'Planning hierarchy validation requires a work-package resolver',
        HIERARCHY_RESOLVER_REQUIRED_MESSAGE,
      );
    }
    const workPackage = await findWorkPackage(input.organizationId, input.workPackageId);
    assertWorkPackageBelongsToProject(workPackage, expected);
  }
}
