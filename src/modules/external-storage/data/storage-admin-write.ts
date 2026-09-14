import 'server-only';

import { sql } from 'drizzle-orm';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Commits storage writes on a separate admin connection so token refresh and
 * provisioning survive request-transaction rollbacks (e.g. failed browse).
 */
export async function runCommittedStorageWrite<T>(fn: (db: DbExecutor) => Promise<T>): Promise<T> {
  const adminDb = getAdminDb();
  return adminDb.transaction(async (tx) => {
    await tx.execute(sql`set local role service_role`);
    return fn(tx as DbExecutor);
  });
}
