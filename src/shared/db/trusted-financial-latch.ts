import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';

/** Acquire a permission-checked financial lifecycle latch (0070 trusted paths). */
export async function acquireTrustedFinancialLatch(
  db: DbExecutor,
  kind: string,
  organizationId: string,
  permission: string,
): Promise<void> {
  await db.execute(
    sql`SELECT app.trusted_financial_latch_acquire(${kind}, ${organizationId}::uuid, ${permission})`,
  );
}

export async function releaseTrustedFinancialLatch(
  db: DbExecutor,
  kind: string,
): Promise<void> {
  await db.execute(sql`SELECT app.trusted_financial_latch_release(${kind})`);
}

let savepointSeq = 0;

/**
 * Runs `fn` inside a SAVEPOINT. On failure, rolls back to that savepoint and
 * rethrows the original error. `cleanup` runs only while the transaction is
 * still usable, so a later SET or SELECT cannot raise 25P02 and hide it.
 */
async function withSavepointCleanup<T>(
  db: DbExecutor,
  savepointPrefix: string,
  fn: () => Promise<T>,
  cleanup: () => Promise<void>,
): Promise<T> {
  const savepoint = `${savepointPrefix}_${++savepointSeq}`;
  if (!/^pf_[a-z0-9_]+$/.test(savepoint)) {
    throw new Error('invalid savepoint name');
  }

  let established = false;
  let fnDone = false;
  try {
    await db.execute(sql.raw(`SAVEPOINT "${savepoint}"`));
    established = true;
    const result = await fn();
    await db.execute(sql.raw(`RELEASE SAVEPOINT "${savepoint}"`));
    fnDone = true;
    await cleanup();
    return result;
  } catch (error) {
    if (established && !fnDone) {
      let transactionUsable = false;
      try {
        await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`));
        transactionUsable = true;
      } catch {
        transactionUsable = false;
      }
      if (transactionUsable) {
        try {
          await cleanup();
        } catch {
          transactionUsable = false;
        }
      }
      if (transactionUsable) {
        try {
          await db.execute(sql.raw(`RELEASE SAVEPOINT "${savepoint}"`));
        } catch {
          // A failed RELEASE must not replace the original error.
        }
      }
    }
    throw error;
  }
}

/**
 * Permission-checked latch around `fn` (0070). The inner work runs in a SAVEPOINT.
 * On failure the savepoint is rolled back and the original error is rethrown.
 * The latch is released only while the transaction is still usable.
 * This does not widen the latch permission check. service_role is not an org owner.
 */
export async function withTrustedFinancialLatch<T>(
  db: DbExecutor,
  input: {
    readonly kind: string;
    readonly organizationId: string;
    readonly permission: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  await acquireTrustedFinancialLatch(db, input.kind, input.organizationId, input.permission);
  return withSavepointCleanup(db, 'pf_fin_latch', fn, () =>
    releaseTrustedFinancialLatch(db, input.kind),
  );
}
