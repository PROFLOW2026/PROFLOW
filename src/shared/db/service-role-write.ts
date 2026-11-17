import { sql } from 'drizzle-orm';
import { elevateToServiceRole, restoreRole } from './role-elevation';
import type { DbExecutor } from './types';

/** Postgres 25P01 — SAVEPOINT / SET LOCAL used without an open transaction block. */
function needsOpenTransaction(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    const code = (current as { code?: string }).code;
    if (code === '25P01') return true;
    const message = (current as { message?: string }).message;
    if (message?.includes('SAVEPOINT can only be used in transaction blocks')) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Opens a single connection-level transaction when SET LOCAL / SAVEPOINT need one. */
async function withAdHocTransaction<T>(
  db: DbExecutor,
  run: (executor: DbExecutor) => Promise<T>,
): Promise<T> {
  await db.execute(sql`BEGIN`);
  try {
    const result = await run(db);
    await db.execute(sql`COMMIT`);
    return result;
  } catch (error) {
    try {
      await db.execute(sql`ROLLBACK`);
    } catch {
      // Preserve the original error if rollback fails.
    }
    throw error;
  }
}

async function withOpenTransactionWhenNeeded<T>(
  db: DbExecutor,
  run: (executor: DbExecutor) => Promise<T>,
): Promise<T> {
  try {
    return await run(db);
  } catch (error) {
    if (!needsOpenTransaction(error)) {
      throw error;
    }
    return withAdHocTransaction(db, run);
  }
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
 * Elevates to `service_role` for derived-table writes where migration 0069
 * revoked DML from `authenticated`. Must run inside an open transaction
 * (request handlers and repository `withTransaction` paths). Afterwards the transaction is put back to the
 * role it had (`authenticated` in requests; `service_role` in the committed admin transaction).
 * The write runs in a SAVEPOINT so a failed statement cannot hide its error behind the role restore.
 */
async function runServiceRoleWrite<T>(db: DbExecutor, fn: () => Promise<T>): Promise<T> {
  const back = await elevateToServiceRole(db);
  return withSavepointCleanup(db, 'pf_svc_role', fn, () => restoreRole(db, back));
}

export async function asServiceRoleWrite<T>(
  db: DbExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  return withOpenTransactionWhenNeeded(db, (executor) => runServiceRoleWrite(executor, fn));
}

/**
 * Runs `fn` as the connection session user inside the current transaction.
 * Use when `service_role` has no table GRANT (workspace link tables) but the
 * caller already authorized the action. `SET LOCAL` does not leak to the pool.
 * The write runs in a SAVEPOINT so a failed statement cannot hide its error behind the role restore.
 */
async function runSessionOwnerWrite<T>(db: DbExecutor, fn: () => Promise<T>): Promise<T> {
  await db.execute(sql`set local role none`);
  return withSavepointCleanup(db, 'pf_sess_owner', fn, async () => {
    await db.execute(sql`set local role authenticated`);
  });
}

export async function asSessionOwnerWrite<T>(
  db: DbExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  return withOpenTransactionWhenNeeded(db, (executor) => runSessionOwnerWrite(executor, fn));
}
