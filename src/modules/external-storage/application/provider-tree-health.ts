import 'server-only';

import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { storageFiles, storageFolderMappings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  findStorageConnectionById,
  updateStorageConnection,
} from '../data/connections.repository';
import { updateFolderMapping } from '../data/folder-mappings.repository';
import {
  PROJECT_TEMPLATE_FOLDER_NAME,
  readProjectTemplateCapability,
  withProjectTemplateCapability,
} from '../domain/project-template';
import {
  PROJECT_SEMANTIC_FOLDERS,
  resolveSemanticFolderDisplayName,
} from '../domain/semantic-folders';
import { sanitizeProviderFolderName } from '../domain/folder-names';
import {
  withStorageTreeHealth,
  type StorageTreeHealthReason,
} from '../domain/storage-tree-health';
import type { StorageConnectionCapabilities } from '../domain/project-template';
import type { StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';
import { clearStorageProviderTreeState } from './storage-tree-reset';

/** Bounded provider probes per provision batch — not a full tree scan. */
export const STORAGE_READY_RECONCILE_BATCH = 8;

export interface ProjectTemplateVerification {
  readonly templateRootId: string | null;
  readonly templateRootExists: boolean;
  readonly missingChildren: readonly string[];
  readonly complete: boolean;
}

async function findChildFolderByName(
  accessToken: string,
  connection: StorageConnectionRecord,
  parentId: string,
  rawName: string,
): Promise<{ id: string; name: string } | null> {
  const adapter = getStorageProviderAdapter(connection.provider);
  const name = sanitizeProviderFolderName(rawName);
  if (adapter.getChildFolderByName) {
    return adapter.getChildFolderByName(accessToken, parentId, name);
  }
  const listing = await adapter.listFolder(accessToken, parentId);
  return listing.folders.find((folder) => folder.name === name) ?? null;
}

async function findOrCreateNamedFolder(
  accessToken: string,
  connection: StorageConnectionRecord,
  parentId: string,
  rawName: string,
): Promise<{ id: string; name: string }> {
  const existing = await findChildFolderByName(accessToken, connection, parentId, rawName);
  if (existing) return existing;
  const adapter = getStorageProviderAdapter(connection.provider);
  return adapter.createFolder(accessToken, {
    name: sanitizeProviderFolderName(rawName),
    parentId,
  });
}

/**
 * Provider-authoritative check of template root + required semantic children.
 * Does not create folders.
 */
export async function verifyProjectTemplateAgainstProvider(
  connection: StorageConnectionRecord,
  accessToken: string,
  templateFolderId?: string | null,
): Promise<ProjectTemplateVerification> {
  const current = readProjectTemplateCapability(connection.capabilitiesJson);
  const folderId = templateFolderId ?? current.externalFolderId;
  if (!folderId) {
    return {
      templateRootId: null,
      templateRootExists: false,
      missingChildren: PROJECT_SEMANTIC_FOLDERS.map((s) => resolveSemanticFolderDisplayName(s)),
      complete: false,
    };
  }

  const adapter = getStorageProviderAdapter(connection.provider);
  const root = await adapter.getFolder(accessToken, folderId);
  if (!root) {
    return {
      templateRootId: folderId,
      templateRootExists: false,
      missingChildren: PROJECT_SEMANTIC_FOLDERS.map((s) => resolveSemanticFolderDisplayName(s)),
      complete: false,
    };
  }

  const missingChildren: string[] = [];
  for (const semantic of PROJECT_SEMANTIC_FOLDERS) {
    const displayName = resolveSemanticFolderDisplayName(semantic);
    const child = await findChildFolderByName(accessToken, connection, folderId, displayName);
    if (!child) missingChildren.push(displayName);
  }

  return {
    templateRootId: folderId,
    templateRootExists: true,
    missingChildren,
    complete: missingChildren.length === 0,
  };
}

/**
 * Ensure template root + every required child exist in the provider.
 * Throws when a required folder cannot be created/found.
 */
export async function ensureProjectTemplateStructure(
  connection: StorageConnectionRecord,
  accessToken: string,
  rootFolderId: string,
  preferredTemplateId?: string | null,
): Promise<{ folderId: string; createdOrRepaired: boolean }> {
  const adapter = getStorageProviderAdapter(connection.provider);
  let folderId = preferredTemplateId ?? null;
  let createdOrRepaired = false;

  if (folderId) {
    const existing = await adapter.getFolder(accessToken, folderId);
    if (!existing) {
      folderId = null;
      createdOrRepaired = true;
    }
  }

  if (!folderId) {
    const created = await findOrCreateNamedFolder(
      accessToken,
      connection,
      rootFolderId,
      PROJECT_TEMPLATE_FOLDER_NAME,
    );
    folderId = created.id;
    createdOrRepaired = true;
  }

  for (const semantic of PROJECT_SEMANTIC_FOLDERS) {
    const displayName = resolveSemanticFolderDisplayName(semantic);
    const before = await findChildFolderByName(accessToken, connection, folderId, displayName);
    if (!before) {
      await findOrCreateNamedFolder(accessToken, connection, folderId, displayName);
      createdOrRepaired = true;
    }
  }

  const verified = await verifyProjectTemplateAgainstProvider(connection, accessToken, folderId);
  if (!verified.complete) {
    throw new Error(
      `Project template incomplete after ensure: missing ${verified.missingChildren.join(', ')}`,
    );
  }

  return { folderId, createdOrRepaired };
}

async function persistTreeHealth(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  status: 'healthy' | 'needs_repair' | 'repairing',
  reason: StorageTreeHealthReason,
  extra?: {
    readonly lastError?: string | null;
    readonly capabilitiesPatch?: Record<string, unknown>;
  },
): Promise<StorageConnectionRecord> {
  const capabilities = withStorageTreeHealth(
    {
      ...(connection.capabilitiesJson ?? {}),
      ...(extra?.capabilitiesPatch ?? {}),
    },
    {
      status,
      reason,
      checkedAt: new Date().toISOString(),
    },
  );
  const updated = await updateStorageConnection(db, organizationId, connection.id, {
    capabilitiesJson: capabilities as Record<string, unknown>,
    ...(extra?.lastError !== undefined ? { lastError: extra.lastError } : {}),
  });
  return updated ?? { ...connection, capabilitiesJson: capabilities };
}

/**
 * Soft-invalidate provider tree bookkeeping while keeping OAuth credentials and
 * connection.status=connected, then recreate root + base folders + template.
 * Does not auto-approve the template.
 */
export async function rebuildStorageTreeKeepingCredentials(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken: string,
): Promise<{
  readonly connection: StorageConnectionRecord;
  readonly rootFolderId: string;
  readonly templateFolderId: string;
}> {
  await clearStorageProviderTreeState(db, organizationId, connection, {
    mode: 'root_missing',
    status: 'connected',
  });

  let refreshed =
    (await findStorageConnectionById(db, organizationId, connection.id)) ?? connection;
  refreshed = await persistTreeHealth(db, organizationId, refreshed, 'repairing', 'root_folder_missing', {
    lastError: 'root_folder_missing',
  });

  const { ensureOrganizationRootFolder } = await import('./folder-provisioning');
  const rootFolderId = await ensureOrganizationRootFolder(
    db,
    organizationId,
    refreshed,
    accessToken,
    { skipMissingRootRebuild: true },
  );

  refreshed =
    (await findStorageConnectionById(db, organizationId, connection.id)) ?? refreshed;

  const { folderId: templateFolderId } = await ensureProjectTemplateStructure(
    refreshed,
    accessToken,
    rootFolderId,
    null,
  );

  const capabilities = withProjectTemplateCapability(
    withStorageTreeHealth(refreshed.capabilitiesJson, {
      status: 'needs_repair',
      reason: null,
      checkedAt: new Date().toISOString(),
    }) as StorageConnectionCapabilities,
    {
      status: 'pending_approval',
      externalFolderId: templateFolderId,
      approvedAt: null,
    },
  );

  const updated = await updateStorageConnection(db, organizationId, connection.id, {
    rootFolderExternalId: rootFolderId,
    capabilitiesJson: capabilities as Record<string, unknown>,
    lastError: null,
    status: 'connected',
  });

  return {
    connection: updated ?? { ...refreshed, capabilitiesJson: capabilities, rootFolderExternalId: rootFolderId },
    rootFolderId,
    templateFolderId,
  };
}

/**
 * Settings-page entry: resolve token + lightweight provider health (root + template).
 * Does not scan clients/projects.
 */
export async function healStorageConnectionTreeForSettings(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<StorageConnectionRecord> {
  if (connection.status !== 'connected') return connection;
  const { resolveValidAccessToken } = await import('./connection-service');
  const accessToken = await resolveValidAccessToken(db, organizationId, connection);
  const health = await checkAndHealProviderTreeHealth(
    db,
    organizationId,
    connection,
    accessToken,
    { autoHealRoot: true },
  );
  return health.connection;
}

export interface ProviderTreeHealthCheckResult {
  readonly connection: StorageConnectionRecord;
  readonly accountValid: boolean;
  readonly rootExists: boolean;
  readonly templateComplete: boolean;
  readonly rebuilt: boolean;
  readonly reason: StorageTreeHealthReason;
}

/**
 * Lightweight live health check: OAuth account + org root + project template.
 * Auto-heals missing org root (credentials preserved). Does not scan clients/projects.
 */
export async function checkAndHealProviderTreeHealth(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken: string,
  options?: { readonly autoHealRoot?: boolean },
): Promise<ProviderTreeHealthCheckResult> {
  const autoHealRoot = options?.autoHealRoot !== false;
  const adapter = getStorageProviderAdapter(connection.provider);
  await adapter.getAccountInfo(accessToken);

  const rootId = connection.rootFolderExternalId;
  if (rootId) {
    const root = await adapter.getFolder(accessToken, rootId);
    if (!root) {
      if (!autoHealRoot) {
        const updated = await persistTreeHealth(
          db,
          organizationId,
          connection,
          'needs_repair',
          'root_folder_missing',
          { lastError: 'root_folder_missing' },
        );
        return {
          connection: updated,
          accountValid: true,
          rootExists: false,
          templateComplete: false,
          rebuilt: false,
          reason: 'root_folder_missing',
        };
      }
      const healed = await rebuildStorageTreeKeepingCredentials(
        db,
        organizationId,
        connection,
        accessToken,
      );
      return {
        connection: healed.connection,
        accountValid: true,
        rootExists: true,
        templateComplete: true,
        rebuilt: true,
        reason: null,
      };
    }
  } else if (autoHealRoot && connection.status === 'connected') {
    const healed = await rebuildStorageTreeKeepingCredentials(
      db,
      organizationId,
      connection,
      accessToken,
    );
    return {
      connection: healed.connection,
      accountValid: true,
      rootExists: true,
      templateComplete: true,
      rebuilt: true,
      reason: null,
    };
  }

  const template = readProjectTemplateCapability(connection.capabilitiesJson);
  let working = connection;
  let templateComplete = false;

  if (rootId || working.rootFolderExternalId) {
    const effectiveRoot = working.rootFolderExternalId ?? rootId!;
    try {
      const ensured = await ensureProjectTemplateStructure(
        working,
        accessToken,
        effectiveRoot,
        template.externalFolderId,
      );
      templateComplete = true;
      const capabilities = withProjectTemplateCapability(
        withStorageTreeHealth(working.capabilitiesJson, {
          status: 'healthy',
          reason: null,
          checkedAt: new Date().toISOString(),
        }) as StorageConnectionCapabilities,
        {
          externalFolderId: ensured.folderId,
          status: template.status === 'approved' ? 'approved' : template.status,
          approvedAt: template.approvedAt,
        },
      );
      const updated = await updateStorageConnection(db, organizationId, working.id, {
        capabilitiesJson: capabilities as Record<string, unknown>,
        lastError:
          working.lastError === 'root_folder_missing' || working.lastError === 'template_incomplete'
            ? null
            : working.lastError,
      });
      working = updated ?? { ...working, capabilitiesJson: capabilities };
    } catch {
      working = await persistTreeHealth(
        db,
        organizationId,
        working,
        'needs_repair',
        template.externalFolderId ? 'template_incomplete' : 'template_missing',
        { lastError: 'template_incomplete' },
      );
      templateComplete = false;
    }
  }

  const reason: StorageTreeHealthReason = templateComplete ? null : 'template_incomplete';
  if (templateComplete && readProjectTemplateCapability(working.capabilitiesJson).status) {
    working = await persistTreeHealth(db, organizationId, working, 'healthy', null, {
      lastError:
        working.lastError === 'template_incomplete' || working.lastError === 'root_folder_missing'
          ? null
          : working.lastError,
    });
  }

  return {
    connection: working,
    accountValid: true,
    rootExists: Boolean(working.rootFolderExternalId),
    templateComplete,
    rebuilt: false,
    reason,
  };
}

/**
 * Invalidate READY mappings whose provider folders were deleted externally.
 * Marks synced files under missing folders as `missing` (no fake healthy bytes).
 */
export async function reconcileStaleReadyMappingsBatch(
  db: DbExecutor,
  input: {
    organizationId: string;
    connection: StorageConnectionRecord;
    accessToken: string;
    limit?: number;
  },
): Promise<{ checked: number; invalidated: number }> {
  const limit = input.limit ?? STORAGE_READY_RECONCILE_BATCH;
  const adapter = getStorageProviderAdapter(input.connection.provider);

  const candidates = await db
    .select({
      id: storageFolderMappings.id,
      externalFolderId: storageFolderMappings.externalFolderId,
      semanticFolderType: storageFolderMappings.semanticFolderType,
      entityId: storageFolderMappings.entityId,
    })
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, input.organizationId),
        eq(storageFolderMappings.connectionId, input.connection.id),
        eq(storageFolderMappings.status, 'ready'),
        sql`${storageFolderMappings.externalFolderId} is not null`,
        sql`${storageFolderMappings.externalFolderId} <> 'pending'`,
        inArray(storageFolderMappings.semanticFolderType, [
          'organization_root',
          'clients_root',
          'projects_root',
          'client_root',
          'project_root',
          'vendors_root',
          'employees_root',
          'organization_documents',
          ...PROJECT_SEMANTIC_FOLDERS,
        ]),
      ),
    )
    .orderBy(asc(storageFolderMappings.id))
    .limit(limit);

  let invalidated = 0;
  for (const row of candidates) {
    const folder = await adapter.getFolder(input.accessToken, row.externalFolderId);
    if (folder) continue;

    await updateFolderMapping(db, input.organizationId, row.id, {
      status: 'pending',
      lastError: 'provider_folder_missing',
    });

    await db
      .update(storageFiles)
      .set({ status: 'missing', updatedAt: new Date() })
      .where(
        and(
          eq(storageFiles.organizationId, input.organizationId),
          eq(storageFiles.connectionId, input.connection.id),
          eq(storageFiles.externalParentFolderId, row.externalFolderId),
          eq(storageFiles.status, 'synced'),
        ),
      );

    if (row.semanticFolderType === 'project_root' && row.entityId) {
      const children = await db
        .select({ id: storageFolderMappings.id })
        .from(storageFolderMappings)
        .where(
          and(
            eq(storageFolderMappings.organizationId, input.organizationId),
            eq(storageFolderMappings.connectionId, input.connection.id),
            eq(storageFolderMappings.entityId, row.entityId),
            eq(storageFolderMappings.status, 'ready'),
            inArray(storageFolderMappings.semanticFolderType, [...PROJECT_SEMANTIC_FOLDERS]),
          ),
        );
      for (const child of children) {
        await updateFolderMapping(db, input.organizationId, child.id, {
          status: 'pending',
          lastError: 'provider_folder_missing',
        });
      }
    }

    invalidated += 1;
  }

  return { checked: candidates.length, invalidated };
}
