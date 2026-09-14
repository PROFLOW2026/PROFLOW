import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { withUserContext } from '@/shared/db/client';
import { ServiceUnavailableError } from '@/shared/errors';
import { findStorageConnectionById } from '../data/connections.repository';
import { listFolderMappingsForProject } from '../data/folder-mappings.repository';
import { bootstrapOrganizationStorageTree } from './bootstrap';
import {
  assertOrganizationStorageAvailable,
  resolveValidAccessToken,
} from './connection-service';
import { ensureOrganizationRootFolder } from './folder-provisioning';

/**
 * Provision org/project folders in a committed transaction separate from browse.
 * Idempotent — safe to call when mappings already exist.
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
  });

  const bootstrapped = await withUserContext(input.userId, async (db) => {
    const row = await findStorageConnectionById(db, input.organizationId, input.connectionId);
    if (!row) {
      throw new ServiceUnavailableError(
        'Storage connection not found',
        'externalStorage.errors.connectionNotFound',
      );
    }
    const accessToken = await resolveValidAccessToken(db, input.organizationId, row);
    return bootstrapOrganizationStorageTree(
      db,
      input.organizationId,
      input.connectionId,
      accessToken,
    );
  });

  if (input.projectId) {
    const sql = await import('@/shared/db/client').then((m) => m.getDb());
    const mappings = await listFolderMappingsForProject(
      sql,
      input.organizationId,
      input.connectionId,
      input.projectId,
    );
    const ready = mappings.filter((m) => m.status === 'ready');
    if (ready.length === 0) {
      throw new ServiceUnavailableError(
        'Project folders not provisioned',
        'externalStorage.errors.fileUnavailable',
      );
    }
  }

  return bootstrapped;
}

export async function ensureOrganizationStorageProvisioned(
  context: OrgContext,
  projectId: string,
): Promise<void> {
  const connection = await assertOrganizationStorageAvailable(context);
  const mappings = await listFolderMappingsForProject(
    context.db,
    context.organizationId,
    connection.id,
    projectId,
  );
  if (mappings.some((m) => m.status === 'ready')) return;

  await commitOrganizationStorageProvision({
    userId: context.userId,
    organizationId: context.organizationId,
    connectionId: connection.id,
    projectId,
  });
}
