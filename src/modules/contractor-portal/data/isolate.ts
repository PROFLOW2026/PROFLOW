import type { DbExecutor } from '@/shared/db/types';

/**
 * Runs a read so that its failure cannot poison the caller's transaction: inside a transaction it
 * becomes a SAVEPOINT (drizzle nested transaction); on a plain pool executor it runs as-is.
 */
export async function isolatedRead<T>(db: DbExecutor, fn: (db: DbExecutor) => Promise<T>): Promise<T> {
  if ('rollback' in db) {
    return db.transaction((savepoint) => fn(savepoint));
  }
  return fn(db);
}
