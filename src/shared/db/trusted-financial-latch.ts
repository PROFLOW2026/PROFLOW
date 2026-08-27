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
  try {
    return await fn();
  } finally {
    await releaseTrustedFinancialLatch(db, input.kind);
  }
}
