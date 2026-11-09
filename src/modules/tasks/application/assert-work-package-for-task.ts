import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { findWorkPackageById } from '@/modules/projects';

/**
 * Validates workPackageId against the task's project (when set).
 */
export async function assertWorkPackageMatchesTaskProject(
  context: OrgContext,
  projectId: string | null,
  workPackageId: string | null | undefined,
): Promise<string | null> {
  if (workPackageId === undefined) {
    throw new ValidationError([{ path: 'workPackageId', message: 'Invalid work package' }]);
  }
  if (workPackageId == null || workPackageId === '') return null;
  if (!projectId) {
    throw new ValidationError([
      { path: 'workPackageId', message: 'Work package requires a project on the task' },
    ]);
  }
  const pkg = await findWorkPackageById(context.db, context.organizationId, workPackageId);
  if (!pkg || pkg.projectId !== projectId) {
    throw new ValidationError([
      { path: 'workPackageId', message: 'Work package not found on this project' },
    ]);
  }
  return workPackageId;
}
