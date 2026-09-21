import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { storageFolderMappings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { updateStorageConnection } from '../data/connections.repository';
import {
  PROJECT_TEMPLATE_FOLDER_NAME,
  isProjectTemplateApproved,
  readProjectTemplateCapability,
  withProjectTemplateCapability,
  type ProjectTemplateSetupStatus,
  type StorageConnectionCapabilities,
} from '../domain/project-template';
import {
  PROJECT_SEMANTIC_FOLDERS,
  resolveSemanticFolderDisplayName,
} from '../domain/semantic-folders';
import { sanitizeProviderFolderName } from '../domain/folder-names';
import type { StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';

async function findOrCreateNamedFolder(
  accessToken: string,
  connection: StorageConnectionRecord,
  parentId: string,
  rawName: string,
): Promise<{ id: string; name: string }> {
  const adapter = getStorageProviderAdapter(connection.provider);
  const name = sanitizeProviderFolderName(rawName);
  if (adapter.getChildFolderByName) {
    const existing = await adapter.getChildFolderByName(accessToken, parentId, name);
    if (existing) return existing;
  } else {
    const listing = await adapter.listFolder(accessToken, parentId);
    const existing = listing.folders.find((folder) => folder.name === name);
    if (existing) return existing;
  }
  return adapter.createFolder(accessToken, { name, parentId });
}

async function connectionHasReadyProjectRoots(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(storageFolderMappings)
    .where(
      and(
        eq(storageFolderMappings.organizationId, organizationId),
        eq(storageFolderMappings.connectionId, connectionId),
        eq(storageFolderMappings.semanticFolderType, 'project_root'),
        eq(storageFolderMappings.status, 'ready'),
        sql`${storageFolderMappings.externalFolderId} is not null`,
        sql`${storageFolderMappings.externalFolderId} <> 'pending'`,
      ),
    );
  return (row?.n ?? 0) > 0;
}

/**
 * Ensures ProjectFlow/תבנית פרויקט exists with the default 01–08 folders.
 * Does not map the template as a project. Persists folder id in capabilitiesJson.
 */
export async function ensureDefaultProjectTemplate(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken: string,
  rootFolderId: string,
  options?: { readonly resetApproval?: boolean },
): Promise<{ folderId: string; status: ProjectTemplateSetupStatus }> {
  const current = readProjectTemplateCapability(connection.capabilitiesJson);
  let folderId = current.externalFolderId;

  if (folderId) {
    const adapter = getStorageProviderAdapter(connection.provider);
    const existing = await adapter.getFolder(accessToken, folderId);
    if (!existing) folderId = null;
  }

  if (!folderId) {
    const created = await findOrCreateNamedFolder(
      accessToken,
      connection,
      rootFolderId,
      PROJECT_TEMPLATE_FOLDER_NAME,
    );
    folderId = created.id;
  }

  for (const semantic of PROJECT_SEMANTIC_FOLDERS) {
    try {
      await findOrCreateNamedFolder(
        accessToken,
        connection,
        folderId,
        resolveSemanticFolderDisplayName(semantic),
      );
    } catch {
      // Default template folders are best-effort; quota must not fail OAuth.
    }
  }

  let status: ProjectTemplateSetupStatus = current.status;
  if (options?.resetApproval) {
    status = 'pending_approval';
  } else if (status !== 'approved' && status !== 'editing') {
    const legacyProvisioned = await connectionHasReadyProjectRoots(
      db,
      organizationId,
      connection.id,
    );
    status = legacyProvisioned ? 'approved' : 'pending_approval';
  }

  const capabilities = withProjectTemplateCapability(connection.capabilitiesJson, {
    status,
    externalFolderId: folderId,
    approvedAt:
      status === 'approved'
        ? current.approvedAt ?? new Date().toISOString()
        : options?.resetApproval
          ? null
          : current.approvedAt,
  });

  await updateStorageConnection(db, organizationId, connection.id, {
    capabilitiesJson: capabilities as Record<string, unknown>,
  });

  return { folderId, status };
}

/** Lazy-upgrade pre-gate connections that already have project folders. */
export async function reconcileProjectTemplateGateState(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<StorageConnectionRecord> {
  const current = readProjectTemplateCapability(connection.capabilitiesJson);
  if (current.status === 'approved') return connection;

  let shouldApprove = false;
  if (!capabilitiesHasProjectTemplateKey(connection.capabilitiesJson)) {
    shouldApprove = true;
  } else {
    shouldApprove = await connectionHasReadyProjectRoots(db, organizationId, connection.id);
  }
  if (!shouldApprove) return connection;

  const capabilities = withProjectTemplateCapability(connection.capabilitiesJson, {
    status: 'approved',
    approvedAt: current.approvedAt ?? new Date().toISOString(),
  });
  const updated = await updateStorageConnection(db, organizationId, connection.id, {
    capabilitiesJson: capabilities as Record<string, unknown>,
  });
  return updated ?? { ...connection, capabilitiesJson: capabilities };
}

function capabilitiesHasProjectTemplateKey(
  capabilities: StorageConnectionCapabilities | null | undefined,
): boolean {
  return Boolean(capabilities && Object.prototype.hasOwnProperty.call(capabilities, 'projectTemplate'));
}

export function connectionTemplateApproved(connection: StorageConnectionRecord): boolean {
  return isProjectTemplateApproved(connection.capabilitiesJson);
}

export async function markProjectTemplateApproved(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<StorageConnectionRecord> {
  const capabilities = withProjectTemplateCapability(connection.capabilitiesJson, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
  });
  const updated = await updateStorageConnection(db, organizationId, connection.id, {
    capabilitiesJson: capabilities as Record<string, unknown>,
  });
  return updated ?? { ...connection, capabilitiesJson: capabilities };
}

export async function markProjectTemplateEditing(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
): Promise<StorageConnectionRecord> {
  const capabilities = withProjectTemplateCapability(connection.capabilitiesJson, {
    status: 'editing',
  });
  const updated = await updateStorageConnection(db, organizationId, connection.id, {
    capabilitiesJson: capabilities as Record<string, unknown>,
  });
  return updated ?? { ...connection, capabilitiesJson: capabilities };
}

export async function resolveProjectTemplateWebUrl(
  connection: StorageConnectionRecord,
  accessToken: string,
): Promise<string | null> {
  const template = readProjectTemplateCapability(connection.capabilitiesJson);
  if (!template.externalFolderId) return null;
  const adapter = getStorageProviderAdapter(connection.provider);
  if (adapter.getProviderWebUrl) {
    return adapter.getProviderWebUrl(accessToken, template.externalFolderId);
  }
  const folder = await adapter.getFolder(accessToken, template.externalFolderId);
  return folder?.webUrl ?? null;
}

export type { StorageConnectionCapabilities };
