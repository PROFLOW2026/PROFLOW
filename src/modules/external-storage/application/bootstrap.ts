import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { runStorageProvisionBatch } from './provision-batch';

/**
 * One resumable batch for an already-open connection.
 * Full organization coverage continues through the storage provision worker.
 */
export async function bootstrapOrganizationStorageTree(
  db: DbExecutor,
  organizationId: string,
  connectionId: string,
  accessToken: string,
): Promise<{ clients: number; projects: number }> {
  const batch = await runStorageProvisionBatch(db, {
    organizationId,
    connectionId,
    accessToken,
  });
  return { clients: batch.clientsProcessed, projects: batch.projectsProcessed };
}
