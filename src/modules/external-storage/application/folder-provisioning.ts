import 'server-only';

import type { SemanticFolderType } from '@drizzle/schema/external-storage';
import type { DbExecutor } from '@/shared/db/types';
import { updateStorageConnection } from '../data/connections.repository';
import {
  findFolderMapping,
  insertFolderMapping,
  updateFolderMapping,
} from '../data/folder-mappings.repository';
import {
  ORGANIZATION_BASE_FOLDERS,
  PROJECT_SEMANTIC_FOLDERS,
  resolveSemanticFolderDisplayName,
} from '../domain/semantic-folders';
import { projectStorageFolderName } from '../domain/project-folder-placement';
import { sanitizeProviderFolderName } from '../domain/folder-names';
import {
  normalizeProviderFolderId,
  resolveProviderRootFolderId,
} from '../domain/provider-roots';
import type { ProviderFolderItem, StorageConnectionRecord } from '../domain/types';
import { ProviderHttpError } from '../providers/http-utils';
import { getStorageProviderAdapter } from '../providers/registry';

async function resolveListFolderParentId(
  accessToken: string,
  provider: StorageConnectionRecord['provider'],
  parentId: string | null,
): Promise<string> {
  if (parentId !== null) {
    return normalizeProviderFolderId(provider, parentId);
  }
  const adapter = getStorageProviderAdapter(provider);
  if (adapter.getDriveRoot) {
    const driveRoot = await adapter.getDriveRoot(accessToken);
    return driveRoot.id;
  }
  return resolveProviderRootFolderId(provider);
}

async function findChildFolderByName(
  accessToken: string,
  provider: StorageConnectionRecord['provider'],
  parentId: string | null,
  name: string,
): Promise<ProviderFolderItem | null> {
  const adapter = getStorageProviderAdapter(provider);
  if (adapter.getChildFolderByName) {
    return adapter.getChildFolderByName(accessToken, parentId, name);
  }
  const listParentId = await resolveListFolderParentId(accessToken, provider, parentId);
  const listing = await adapter.listFolder(accessToken, listParentId);
  return listing.folders.find((folder) => folder.name === name) ?? null;
}

async function resolveOrCreateFolder(
  accessToken: string,
  connection: StorageConnectionRecord,
  input: { name: string; parentId: string | null },
): Promise<ProviderFolderItem> {
  const adapter = getStorageProviderAdapter(connection.provider);
  const existing = await findChildFolderByName(
    accessToken,
    connection.provider,
    input.parentId,
    input.name,
  );
  if (existing) return existing;

  try {
    return await adapter.createFolder(accessToken, input);
  } catch (error) {
    if (error instanceof ProviderHttpError) {
      if (error.isNameAlreadyExists()) {
        const existing = await findChildFolderByName(
          accessToken,
          connection.provider,
          input.parentId,
          input.name,
        );
        if (existing) return existing;
      }
      const retry = await findChildFolderByName(
        accessToken,
        connection.provider,
        input.parentId,
        input.name,
      );
      if (retry) return retry;

      if (error.isQuotaExceeded() && input.parentId === null && adapter.getDriveRoot) {
        const driveRoot = await adapter.getDriveRoot(accessToken);
        const nested = await findChildFolderByName(
          accessToken,
          connection.provider,
          driveRoot.id,
          input.name,
        );
        if (nested) return nested;
        // Quota-full drives cannot create a new top-level folder — anchor at drive root.
        return driveRoot;
      }
    }
    throw error;
  }
}

async function isDriveRootAnchor(
  accessToken: string,
  connection: StorageConnectionRecord,
  folderId: string,
): Promise<boolean> {
  const adapter = getStorageProviderAdapter(connection.provider);
  if (!adapter.getDriveRoot) return false;
  const driveRoot = await adapter.getDriveRoot(accessToken);
  if (folderId === driveRoot.id) return true;
  const folder = await adapter.getFolder(accessToken, folderId);
  return folder?.name === 'root';
}

/** Resolve a dedicated ProjectFlow folder — never keep the OneDrive drive root as org root. */
async function resolveDedicatedProjectFlowRoot(
  accessToken: string,
  connection: StorageConnectionRecord,
  currentRootId: string | null,
): Promise<string> {
  const rootName = connection.rootFolderName || 'ProjectFlow';
  if (currentRootId && !(await isDriveRootAnchor(accessToken, connection, currentRootId))) {
    const adapter = getStorageProviderAdapter(connection.provider);
    const existing = await adapter.getFolder(accessToken, currentRootId);
    if (existing && existing.name === rootName) {
      return currentRootId;
    }
  }

  const dedicated = await resolveOrCreateFolder(accessToken, connection, {
    name: rootName,
    parentId: null,
  });
  if (await isDriveRootAnchor(accessToken, connection, dedicated.id)) {
    throw new Error('Could not create dedicated ProjectFlow folder');
  }
  return dedicated.id;
}

async function ensureOrganizationBaseFolders(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken: string,
  rootId: string,
): Promise<void> {
  for (const semantic of ORGANIZATION_BASE_FOLDERS) {
    try {
      await ensureSemanticFolder(db, {
        organizationId,
        connection,
        accessToken,
        semanticFolderType: semantic,
        parentFolderId: rootId,
        displayName: resolveSemanticFolderDisplayName(semantic),
      });
    } catch {
      // Base folders are best-effort during connect; quota or provider limits must not fail OAuth.
    }
  }
}

export async function ensureOrganizationRootFolder(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken: string,
): Promise<string> {
  const existing = await findFolderMapping(db, {
    organizationId,
    connectionId: connection.id,
    semanticFolderType: 'organization_root',
  });

  const rootId = await resolveDedicatedProjectFlowRoot(
    accessToken,
    connection,
    existing?.status === 'ready'
      ? existing.externalFolderId
      : connection.rootFolderExternalId,
  );

  await updateStorageConnection(db, organizationId, connection.id, {
    rootFolderExternalId: rootId,
    rootFolderName: connection.rootFolderName || 'ProjectFlow',
  });

  if (existing) {
    await updateFolderMapping(db, organizationId, existing.id, {
      externalFolderId: rootId,
      displayName: connection.rootFolderName || 'ProjectFlow',
      status: 'ready',
      lastError: null,
    });
  } else {
    await insertFolderMapping(db, {
      organizationId,
      connectionId: connection.id,
      semanticFolderType: 'organization_root',
      externalFolderId: rootId,
      displayName: connection.rootFolderName || 'ProjectFlow',
      status: 'ready',
    });
  }

  await ensureOrganizationBaseFolders(db, organizationId, connection, accessToken, rootId);
  return rootId;
}

export async function ensureSemanticFolder(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    semanticFolderType: SemanticFolderType;
    parentFolderId: string;
    displayName: string;
    entityType?: string | null;
    entityId?: string | null;
  },
): Promise<string> {
  const existing = await findFolderMapping(db, {
    organizationId: input.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: input.semanticFolderType,
    entityType: input.entityType,
    entityId: input.entityId,
  });

  const parentAligned =
    Boolean(existing?.externalParentId) && existing.externalParentId === input.parentFolderId;

  if (existing?.status === 'ready' && parentAligned) {
    const adapter = getStorageProviderAdapter(input.connection.provider);
    const folder = await adapter.getFolder(input.accessToken, existing.externalFolderId);
    if (folder) {
      const desiredName = sanitizeProviderFolderName(input.displayName);
      if (folder.name !== desiredName) {
        const renamed = await adapter.renameFolder(input.accessToken, folder.id, desiredName);
        await updateFolderMapping(db, input.organizationId, existing.id, {
          externalFolderId: renamed.id,
          displayName: input.displayName,
          status: 'ready',
          lastError: null,
        });
        return renamed.id;
      }
      if (existing.displayName !== input.displayName) {
        await updateFolderMapping(db, input.organizationId, existing.id, {
          displayName: input.displayName,
          status: 'ready',
          lastError: null,
        });
      }
      return existing.externalFolderId;
    }
  }

  const providerFolderName = sanitizeProviderFolderName(input.displayName);

  try {
    const created = await resolveOrCreateFolder(input.accessToken, input.connection, {
      name: providerFolderName,
      parentId: input.parentFolderId,
    });

    if (existing) {
      await updateFolderMapping(db, input.organizationId, existing.id, {
        externalFolderId: created.id,
        externalParentId: input.parentFolderId,
        displayName: input.displayName,
        status: 'ready',
        lastError: null,
      });
    } else {
      await insertFolderMapping(db, {
        organizationId: input.organizationId,
        connectionId: input.connection.id,
        semanticFolderType: input.semanticFolderType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        externalFolderId: created.id,
        externalParentId: input.parentFolderId,
        displayName: input.displayName,
        status: 'ready',
      });
    }
    return created.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'folder_create_failed';
    if (existing) {
      await updateFolderMapping(db, input.organizationId, existing.id, {
        status: 'error',
        lastError: message,
      });
    } else {
      await insertFolderMapping(db, {
        organizationId: input.organizationId,
        connectionId: input.connection.id,
        semanticFolderType: input.semanticFolderType,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        externalFolderId: 'pending',
        externalParentId: input.parentFolderId,
        displayName: input.displayName,
        status: 'error',
        lastError: message,
      });
    }
    throw error;
  }
}

export async function ensureClientFolderTree(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    clientId: string;
    clientName: string;
  },
): Promise<string> {
  const clientsRoot = await findFolderMapping(db, {
    organizationId: input.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: 'clients_root',
  });
  if (!clientsRoot) {
    throw new Error('clients_root mapping missing');
  }

  return ensureSemanticFolder(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    semanticFolderType: 'client_root',
    parentFolderId: clientsRoot.externalFolderId,
    displayName: input.clientName,
    entityType: 'client',
    entityId: input.clientId,
  });
}

export async function ensureProjectsRootFolder(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
  },
): Promise<string> {
  const orgRoot = await findFolderMapping(db, {
    organizationId: input.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: 'organization_root',
  });
  if (!orgRoot?.externalFolderId) {
    throw new Error('organization_root mapping missing');
  }
  return ensureSemanticFolder(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    semanticFolderType: 'projects_root',
    parentFolderId: orgRoot.externalFolderId,
    displayName: resolveSemanticFolderDisplayName('projects_root'),
  });
}

export async function ensureProjectFolderTree(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    projectId: string;
    projectName: string;
    documentNumber?: string | null;
    clientId?: string | null;
    clientName?: string | null;
  },
): Promise<string> {
  if (input.clientId) {
    await ensureClientFolderTree(db, {
      organizationId: input.organizationId,
      connection: input.connection,
      accessToken: input.accessToken,
      clientId: input.clientId,
      clientName: input.clientName?.trim() || 'Client',
    });
  }

  const projectsRootId = await ensureProjectsRootFolder(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
  });

  const projectRootId = await ensureSemanticFolder(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    semanticFolderType: 'project_root',
    parentFolderId: projectsRootId,
    displayName: projectStorageFolderName(input.projectName, input.documentNumber),
    entityType: 'project',
    entityId: input.projectId,
  });

  for (const semantic of PROJECT_SEMANTIC_FOLDERS) {
    await ensureSemanticFolder(db, {
      organizationId: input.organizationId,
      connection: input.connection,
      accessToken: input.accessToken,
      semanticFolderType: semantic,
      parentFolderId: projectRootId,
      displayName: resolveSemanticFolderDisplayName(semantic),
      entityType: 'project',
      entityId: input.projectId,
    });
  }

  const { upsertProjectInfoFile } = await import('./project-info-file');
  await upsertProjectInfoFile(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    projectId: input.projectId,
    projectFolderId: projectRootId,
  });

  return projectRootId;
}

/** Idempotent nested folder chain under an existing provider folder (generated docs). */
export async function ensureNestedFolderPath(
  accessToken: string,
  connection: StorageConnectionRecord,
  parentFolderId: string,
  segmentNames: readonly string[],
): Promise<string> {
  let currentParentId = parentFolderId;
  for (const rawName of segmentNames) {
    const name = sanitizeProviderFolderName(rawName);
    const folder = await resolveOrCreateFolder(accessToken, connection, {
      name,
      parentId: currentParentId,
    });
    currentParentId = folder.id;
  }
  return currentParentId;
}

export async function resolveUploadFolderId(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    semanticFolderType: SemanticFolderType;
    entityType?: string | null;
    entityId?: string | null;
    parentFolderId?: string;
    displayName?: string;
  },
): Promise<string> {
  const existing = await findFolderMapping(db, {
    organizationId: input.organizationId,
    connectionId: input.connection.id,
    semanticFolderType: input.semanticFolderType,
    entityType: input.entityType,
    entityId: input.entityId,
  });
  const parentAligned =
    Boolean(existing?.externalParentId) &&
    Boolean(input.parentFolderId) &&
    existing?.externalParentId === input.parentFolderId;
  if (existing?.status === 'ready' && existing.externalFolderId && (parentAligned || !input.parentFolderId)) {
    return existing.externalFolderId;
  }

  if (!input.parentFolderId || !input.displayName) {
    throw new Error('Folder mapping missing and cannot be created without parent');
  }

  return ensureSemanticFolder(db, {
    organizationId: input.organizationId,
    connection: input.connection,
    accessToken: input.accessToken,
    semanticFolderType: input.semanticFolderType,
    parentFolderId: input.parentFolderId,
    displayName: input.displayName,
    entityType: input.entityType,
    entityId: input.entityId,
  });
}
