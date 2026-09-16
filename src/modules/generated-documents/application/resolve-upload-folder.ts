import 'server-only';

import {
  assertOrganizationStorageAvailable,
  resolveValidAccessToken,
} from '@/modules/external-storage/application/connection-service';
import {
  ensureNestedFolderPath,
  resolveUploadFolderId,
} from '@/modules/external-storage/application/folder-provisioning';
import { findFolderMapping } from '@/modules/external-storage/data/folder-mappings.repository';
import { resolveSemanticFolderDisplayName } from '@/modules/external-storage/domain/semantic-folders';
import type { OrgContext } from '@/shared/auth/context';
import type { GeneratedDocumentBinding } from '../domain/types';

export async function resolveGeneratedUploadFolderId(
  context: OrgContext,
  binding: GeneratedDocumentBinding,
): Promise<string> {
  const connection = await assertOrganizationStorageAvailable(context);
  const accessToken = await resolveValidAccessToken(
    context.db,
    context.organizationId,
    connection,
  );

  let semanticParentId: string;
  if (binding.folderEntityType === 'project' && binding.folderEntityId) {
    const projectRoot = await findFolderMapping(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      semanticFolderType: 'project_root',
      entityType: 'project',
      entityId: binding.folderEntityId,
    });
    semanticParentId = await resolveUploadFolderId(context.db, {
      organizationId: context.organizationId,
      connection,
      accessToken,
      semanticFolderType: binding.semanticFolder,
      entityType: binding.folderEntityType,
      entityId: binding.folderEntityId,
      parentFolderId: projectRoot?.externalFolderId ?? connection.rootFolderExternalId ?? undefined,
      displayName: resolveSemanticFolderDisplayName(binding.semanticFolder),
    });
  } else if (binding.semanticFolder === 'employees_root') {
    const orgRoot = await findFolderMapping(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      semanticFolderType: 'organization_root',
    });
    const employeesRoot = await resolveUploadFolderId(context.db, {
      organizationId: context.organizationId,
      connection,
      accessToken,
      semanticFolderType: 'employees_root',
      entityType: null,
      entityId: null,
      parentFolderId: orgRoot?.externalFolderId ?? connection.rootFolderExternalId ?? undefined,
      displayName: resolveSemanticFolderDisplayName('employees_root'),
    });
    semanticParentId = employeesRoot;
  } else {
    const orgRoot = await findFolderMapping(context.db, {
      organizationId: context.organizationId,
      connectionId: connection.id,
      semanticFolderType: 'organization_root',
    });
    semanticParentId = await resolveUploadFolderId(context.db, {
      organizationId: context.organizationId,
      connection,
      accessToken,
      semanticFolderType: binding.semanticFolder,
      entityType: binding.folderEntityType,
      entityId: binding.folderEntityId,
      parentFolderId: orgRoot?.externalFolderId ?? connection.rootFolderExternalId ?? undefined,
      displayName: resolveSemanticFolderDisplayName(binding.semanticFolder),
    });
  }

  if (binding.nestedPathSegments.length === 0) {
    return semanticParentId;
  }

  return ensureNestedFolderPath(
    accessToken,
    connection,
    semanticParentId,
    binding.nestedPathSegments,
  );
}
