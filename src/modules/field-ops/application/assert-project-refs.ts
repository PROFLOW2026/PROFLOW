import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { findProjectById } from '@/modules/projects';
import { findWorkPackageById } from '@/modules/projects';

/** Ensures project / work-package FKs stay inside the active organization. */
export async function assertProjectRefsInOrg(
  context: OrgContext,
  input: { projectId: string; workPackageId?: string | null },
): Promise<void> {
  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');

  if (!input.workPackageId) return;

  const workPackage = await findWorkPackageById(
    context.db,
    context.organizationId,
    input.workPackageId,
  );
  if (!workPackage || workPackage.archivedAt) throw new NotFoundError('Work area');
  if (workPackage.projectId !== input.projectId) {
    throw new DomainRuleError(
      'Work area does not belong to the selected project',
      'errors.validationFailed',
    );
  }
}
