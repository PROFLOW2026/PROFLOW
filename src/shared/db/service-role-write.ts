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

/**
 * Runs `fn` as the connection session user inside the current transaction.
 * Use when `service_role` has no table GRANT (workspace link tables) but the
 * caller already authorized the action. `SET LOCAL` does not leak to the pool.
 */
export async function asSessionOwnerWrite<T>(
  db: DbExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  await db.execute(sql`set local role none`);
  try {
    return await fn();
  } finally {
    await db.execute(sql`set local role authenticated`);
  }
}
