import 'server-only';

import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import { findClientById } from '@/modules/clients/data/clients.repository';
import { findProjectById } from '@/modules/projects/data/projects.repository';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { findFolderMapping } from '../data/folder-mappings.repository';
import type { StorageConnectionRecord } from '../domain/types';
import { resolveSemanticFolderDisplayName } from '../domain/semantic-folders';
import { ensureProjectFolderTree, ensureSemanticFolder } from './folder-provisioning';

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
  if (
    existing?.status === 'ready' &&
    existing.externalFolderId &&
    projectRoot?.status === 'ready' &&
    projectRoot.externalFolderId &&
    existing.externalParentId === projectRoot.externalFolderId
  ) {
    return existing.externalFolderId;
  }

  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project) throw new NotFoundError('Project');
  if (!project.clientId) {
    throw new DomainRuleError(
      'Project storage folders require a linked client',
      'externalStorage.errors.projectFoldersUnavailable',
    );
  }

  const client = await findClientById(context.db, context.organizationId, project.clientId);
  const projectRootId = await ensureProjectFolderTree(context.db, {
    organizationId: context.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    clientId: project.clientId,
    clientName: client?.name ?? 'Client',
    projectId: input.projectId,
    projectName: project.name,
  });

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
