import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { storageFolderMappings } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { updateStorageConnection } from '../data/connections.repository';
import {
  isProjectTemplateApproved,
  readProjectTemplateCapability,
  withProjectTemplateCapability,
  type ProjectTemplateSetupStatus,
  type StorageConnectionCapabilities,
} from '../domain/project-template';
import type { StorageConnectionRecord } from '../domain/types';
import { getStorageProviderAdapter } from '../providers/registry';
import {
  ensureProjectTemplateStructure,
  verifyProjectTemplateAgainstProvider,
} from './provider-tree-health';

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
 * Ensures ProjectFlow/תבנית פרויקט exists with ALL required semantic folders
 * verified against the provider. Failures are not swallowed.
 */
export async function ensureDefaultProjectTemplate(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken: string,
  rootFolderId: string,
  options?: { readonly resetApproval?: boolean },
): Promise<{ folderId: string; status: ProjectTemplateSetupStatus; complete: boolean }> {
  const current = readProjectTemplateCapability(connection.capabilitiesJson);

  const ensured = await ensureProjectTemplateStructure(
    connection,
    accessToken,
    rootFolderId,
    current.externalFolderId,
  );

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
    externalFolderId: ensured.folderId,
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

  return { folderId: ensured.folderId, status, complete: true };
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

/**
 * Approve only after provider verification (and best-effort self-heal) of the
 * template root and every required semantic child folder.
 */
export async function markProjectTemplateApproved(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  accessToken?: string,
): Promise<StorageConnectionRecord> {
  if (accessToken) {
    const rootId = connection.rootFolderExternalId;
    if (!rootId) {
      const { DomainRuleError } = await import('@/shared/errors');
      throw new DomainRuleError(
        'Storage root folder is not provisioned',
        'externalStorage.errors.rootNotReady',
      );
    }

    try {
      await ensureProjectTemplateStructure(
        connection,
        accessToken,
        rootId,
        readProjectTemplateCapability(connection.capabilitiesJson).externalFolderId,
      );
    } catch {
      const { DomainRuleError } = await import('@/shared/errors');
      throw new DomainRuleError(
        'Project template is incomplete in provider storage',
        'externalStorage.errors.templateIncomplete',
      );
    }

    const verified = await verifyProjectTemplateAgainstProvider(connection, accessToken);
    if (!verified.complete) {
      const { DomainRuleError } = await import('@/shared/errors');
      throw new DomainRuleError(
        'Project template is incomplete in provider storage',
        'externalStorage.errors.templateIncomplete',
      );
    }

    const refreshedCaps = withProjectTemplateCapability(connection.capabilitiesJson, {
      externalFolderId: verified.templateRootId,
    });
    connection = { ...connection, capabilitiesJson: refreshedCaps };
  }

  const capabilities = withProjectTemplateCapability(connection.capabilitiesJson, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
  });
  const updated = await updateStorageConnection(db, organizationId, connection.id, {
    capabilitiesJson: capabilities as Record<string, unknown>,
    lastError: null,
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
