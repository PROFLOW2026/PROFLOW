import 'server-only';

import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { findFolderMapping } from '../data/folder-mappings.repository';
import type { StorageConnectionRecord } from '../domain/types';
import { isCanonicalProjectRootParent } from '../domain/project-folder-placement';
import { resolveSemanticFolderDisplayName } from '../domain/semantic-folders';
import { ensureSemanticFolder } from './folder-provisioning';
import { provisionStoredProjectFolder } from './project-provision';

/**
 * Ensures a project-scoped semantic folder exists and returns its provider folder id.
 * Task / task_comment attachments must never land in organization-level folders.
 */
export async function resolveProjectScopedUploadFolderId(
  context: OrgContext,
  input: {
    connection: StorageConnectionRecord;
    accessToken: string;
    projectId: string;
    semanticFolderType: SemanticFolderType;
  },
): Promise<string> {
  const projectRoot = await findFolderMapping(context.db, {
    organizationId: context.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: 'project_root',
    entityType: 'project',
    entityId: input.projectId,
  });
  const existing = await findFolderMapping(context.db, {
    organizationId: context.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: input.semanticFolderType,
    entityType: 'project',
    entityId: input.projectId,
  });
  const projectsRoot = await findFolderMapping(context.db, {
    organizationId: context.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: 'projects_root',
  });
  const canonicalRoot = isCanonicalProjectRootParent(
    projectRoot?.externalParentId,
    projectsRoot?.externalFolderId,
  );
  if (
    existing?.status === 'ready' &&
    existing.externalFolderId &&
    canonicalRoot &&
    projectRoot?.status === 'ready' &&
    projectRoot.externalFolderId &&
    existing.externalParentId === projectRoot.externalFolderId
  ) {
    return existing.externalFolderId;
  }

  const projectRootId = await provisionStoredProjectFolder(context.db, {
    organizationId: context.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    projectId: input.projectId,
  });
  if (!projectRootId) throw new NotFoundError('Project');

  const folderId = await ensureSemanticFolder(context.db, {
    organizationId: context.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    semanticFolderType: input.semanticFolderType,
    parentFolderId: projectRootId,
    displayName: resolveSemanticFolderDisplayName(input.semanticFolderType),
    entityType: 'project',
    entityId: input.projectId,
  });
  if (!folderId) {
    throw new ServiceUnavailableError(
      'Project storage folder is not ready',
      'externalStorage.errors.projectFoldersUnavailable',
    );
  }

  return folderId;
}
