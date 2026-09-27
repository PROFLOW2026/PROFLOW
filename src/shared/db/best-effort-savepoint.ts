import { sql } from 'drizzle-orm';
import type { DbExecutor } from './types';

let savepointSeq = 0;

/**
 * Runs a non-critical side effect inside the current Postgres transaction.
 * Failures roll back only to a SAVEPOINT so the outer transaction stays usable.
 */
export async function runBestEffortInTransaction(
  db: DbExecutor,
  fn: () => Promise<void>,
): Promise<void> {
  const savepoint = `best_effort_${++savepointSeq}`;
  await db.execute(sql.raw(`SAVEPOINT "${savepoint}"`));
  try {
    await fn();
  } catch {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`));
  }
}
