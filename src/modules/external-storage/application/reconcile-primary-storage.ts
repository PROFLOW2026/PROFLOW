import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import {
  clearPrimaryExcept,
  findStorageConnectionById,
  getPrimaryStorageConnection,
  listStorageConnections,
  updateStorageConnection,
} from '../data/connections.repository';
import type { StorageConnectionRecord } from '../domain/types';
import { isUsableStorageConnection } from '../domain/connection-rules';

/**
 * Resolve the organization's usable primary storage connection.
 * Auto-repairs when a designated primary exists but is not usable (e.g. missing root folder),
 * or when a connected provider with a root folder was never promoted to primary.
 */
export async function ensureUsablePrimaryStorageConnection(
  db: DbExecutor,
  organizationId: string,
  preferredConnectionId?: string,
): Promise<StorageConnectionRecord | null> {
  const { reconcileProvisionedConnectingStorageConnections } = await import(
    './reconcile-connecting-storage'
  );
  await reconcileProvisionedConnectingStorageConnections(db, organizationId);

  const designatedPrimary = await getPrimaryStorageConnection(db, organizationId);
  if (isUsableStorageConnection(designatedPrimary)) {
    return designatedPrimary;
  }

  if (designatedPrimary) {
    await updateStorageConnection(db, organizationId, designatedPrimary.id, {
      isPrimary: false,
    });
  }

  const connections = await listStorageConnections(db, organizationId);
  const usable = connections.filter(
    (connection) =>
      connection.status === 'connected' && Boolean(connection.rootFolderExternalId),
  );
  if (usable.length === 0) {
    return null;
  }

  const chosen =
    (preferredConnectionId
      ? usable.find((connection) => connection.id === preferredConnectionId)
      : null) ?? usable[0]!;

  await clearPrimaryExcept(db, organizationId, chosen.id);
  return (await findStorageConnectionById(db, organizationId, chosen.id)) ?? chosen;
}
