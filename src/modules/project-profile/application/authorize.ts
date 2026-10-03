import type { z } from 'zod';
import { findProjectById, type ProjectRecord } from '@/modules/projects';
import {
  assertProjectCapability,
  loadProjectCapabilities,
  PROJECT_CAPABILITIES,
  type ProjectCapability,
} from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';

export const CAP = {
  VIEW: PROJECT_CAPABILITIES.PROJECT_VIEW,
  MANAGE: PROJECT_CAPABILITIES.PROJECT_MANAGE,
  SETTINGS: PROJECT_CAPABILITIES.PROJECT_SETTINGS_MANAGE,
  SCHEDULE: PROJECT_CAPABILITIES.SCHEDULE_MANAGE,
  TASKS: PROJECT_CAPABILITIES.TASKS_MANAGE,
} as const;

export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

/**
 * Capability check first (never reveals whether a project the caller cannot see exists),
 * then the RLS-bound project lookup.
 */
export async function requireProjectWith(
  context: OrgContext,
  projectId: string,
  capability: ProjectCapability,
): Promise<ProjectRecord> {
  await assertProjectCapability(context, projectId, capability);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  return project;
}

export interface StructurePermissions {
  readonly canView: boolean;
  readonly canManageStructure: boolean;
  readonly canManageSettings: boolean;
  readonly canManageSchedule: boolean;
  readonly canManageTasks: boolean;
}

export async function loadStructurePermissions(
  context: OrgContext,
  projectId: string,
): Promise<StructurePermissions> {
  const held = await loadProjectCapabilities(context, projectId);
  return {
    canView: held.has(CAP.VIEW),
    canManageStructure: held.has(CAP.MANAGE),
    canManageSettings: held.has(CAP.SETTINGS),
    canManageSchedule: held.has(CAP.SCHEDULE),
    canManageTasks: held.has(CAP.TASKS),
  };
}
