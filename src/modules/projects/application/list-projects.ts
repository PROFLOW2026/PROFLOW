import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import type { ProjectListFilters, ProjectListItem } from '../domain/types';
import { countProjects, listProjects } from '../data/projects.repository';
import { listProjectsSchema } from '../validation/schemas';
import { resolveAccessibleProjectIds } from './project-access';

async function resolveProjectListFilters(context: OrgContext, rawFilters: ProjectListFilters) {
  const parsed = listProjectsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const restrictToProjectIds = await resolveAccessibleProjectIds(context);
  return { filters: parsed.data, restrictToProjectIds };
}

export async function listProjectsForOrg(
  context: OrgContext,
  rawFilters: ProjectListFilters = {},
): Promise<ProjectListItem[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const { filters, restrictToProjectIds } = await resolveProjectListFilters(context, rawFilters);
  return listProjects(context.db, context.organizationId, filters, { restrictToProjectIds });
}

export async function countProjectsForOrg(
  context: OrgContext,
  rawFilters: ProjectListFilters = {},
): Promise<number> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const { filters, restrictToProjectIds } = await resolveProjectListFilters(context, rawFilters);
  return countProjects(context.db, context.organizationId, filters, { restrictToProjectIds });
}
