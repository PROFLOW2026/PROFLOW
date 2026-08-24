import { sql } from 'drizzle-orm';
import type { DbExecutor } from './types';

/**
 * Elevates to `service_role` for derived-table writes where migration 0069
 * revoked DML from `authenticated`. Must run inside an open transaction
 * (request handlers and repository `withTransaction` paths).
 */
export async function asServiceRoleWrite<T>(
  db: DbExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  await db.execute(sql`set local role service_role`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`set local role authenticated`);
  }
}
