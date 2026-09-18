import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { loadStorageConnectionCredentials } from '../data/credentials.repository';
import { listStorageConnections, updateStorageConnection } from '../data/connections.repository';
import { getStorageProviderAdapter } from '../providers/registry';
import { resolveValidAccessToken } from './connection-service';

/**
 * OAuth start sets status=connecting before redirect. If provisioning already
 * completed (root folder + sealed tokens) but status was never flipped back,
 * uploads must still treat the connection as usable.
 */
export async function reconcileProvisionedConnectingStorageConnections(
  db: DbExecutor,
  organizationId: string,
): Promise<void> {
  const connections = await listStorageConnections(db, organizationId);
  for (const connection of connections) {
    if (connection.status !== 'connecting' || !connection.rootFolderExternalId) continue;

    const creds = await loadStorageConnectionCredentials(db, organizationId, connection.id);
    if (!creds?.refreshToken) continue;

    try {
      const accessToken = await resolveValidAccessToken(db, organizationId, connection);
      const adapter = getStorageProviderAdapter(connection.provider);
      await adapter.getAccountInfo(accessToken);
      await updateStorageConnection(db, organizationId, connection.id, {
        status: 'connected',
        lastValidatedAt: new Date(),
        lastError: null,
      });
    } catch {
      // Leave as connecting; caller will surface not-connected if still unusable.
    }
  }
}
