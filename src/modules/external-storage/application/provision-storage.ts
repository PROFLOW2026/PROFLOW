import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { withUserContext } from '@/shared/db/client';
import { ServiceUnavailableError } from '@/shared/errors';
import { findStorageConnectionById } from '../data/connections.repository';
import { findFolderMapping, listFolderMappingsForProject } from '../data/folder-mappings.repository';
import { isCanonicalProjectRootParent } from '../domain/project-folder-placement';
import { kickStorageProvision } from './kick-storage-provision';
import {
  assertOrganizationStorageAvailable,
  resolveValidAccessToken,
} from './connection-service';
import { ensureOrganizationRootFolder } from './folder-provisioning';
import { provisionStoredProjectFolder } from './project-provision';

/**
 * Ensures the organization root, and one project when requested.
 * The rest of the organization continues in the provision worker.
 */
export async function commitOrganizationStorageProvision(input: {
  userId: string;
  organizationId: string;
  connectionId: string;
  projectId?: string;
}): Promise<{ clients: number; projects: number }> {
  await withUserContext(input.userId, async (db) => {
    const row = await findStorageConnectionById(db, input.organizationId, input.connectionId);
    if (!row || row.status !== 'connected') {
      throw new ServiceUnavailableError(
        'Storage connection not active',
        'externalStorage.errors.reconnectRequired',
      );
    }
    const accessToken = await resolveValidAccessToken(db, input.organizationId, row);
    await ensureOrganizationRootFolder(db, input.organizationId, row, accessToken);
    if (input.projectId) {
      await provisionStoredProjectFolder(db, {
        organizationId: input.organizationId,
        connection: row,
        accessToken,
        projectId: input.projectId,
      });
    }
  });
  kickStorageProvision();
  return { clients: 0, projects: input.projectId ? 1 : 0 };
}

export async function ensureOrganizationStorageProvisioned(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  const connection = await assertOrganizationStorageAvailable(context);
  const [projectsRoot, mappings] = await Promise.all([
    findFolderMapping(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      semanticFolderType: 'projects_root',
    }),
    listFolderMappingsForProject(context.db, context.organizationId, connection.id, projectId),
  ]);
  const projectRoot = mappings.find((mapping) => mapping.semanticFolderType === 'project_root');
  if (
    projectRoot?.status === 'ready' &&
    isCanonicalProjectRootParent(projectRoot.externalParentId, projectsRoot?.externalFolderId)
  ) {
    return;
  }

  await commitOrganizationStorageProvision({
    userId: context.userId,
    organizationId: context.organizationId,
    connectionId: connection.id,
    projectId,
  });
}
