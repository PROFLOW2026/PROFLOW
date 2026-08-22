import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findProjectById } from '@/modules/projects';
import { listPlansForProject as listPlansRows } from '../data/plans.repository';
import {
  listPlansForProjectSchema,
  type ListPlansForProjectInput,
} from '../validation/schemas';

function throwZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): never {
  throw new ValidationError(
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

export async function listBillingPlansForProject(
  context: OrgContext,
  raw: ListPlansForProjectInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const parsed = listPlansForProjectSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');

  return listPlansRows(context.db, context.organizationId, input.projectId, {
    contractId: input.contractId,
    includeArchived: input.includeArchived,
  });
}
