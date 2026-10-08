import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { CloseoutStatus } from '../domain/types';
import { listCloseoutStatusesByProjectIds } from '../data/closeout.repository';

/** Header badge read. Does not load the closeout workspace, warranty, or project engines. */
export async function listCloseoutStatusesForProjects(
  context: OrgContext,
  projectIds: readonly string[],
): Promise<readonly { readonly projectId: string; readonly status: CloseoutStatus }[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  try {
    return await listCloseoutStatusesByProjectIds(
      context.db,
      context.organizationId,
      projectIds,
    );
  } catch {
    return [];
  }
}
