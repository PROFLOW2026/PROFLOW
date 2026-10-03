import { and, desc, eq } from 'drizzle-orm';
import { contractorPerformanceSnapshots } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function insertPerformanceSnapshot(
  db: DbExecutor,
  values: typeof contractorPerformanceSnapshots.$inferInsert,
): Promise<string> {
  const [row] = await db
    .insert(contractorPerformanceSnapshots)
    .values(values)
    .returning({ id: contractorPerformanceSnapshots.id });
  return row!.id;
}

export async function listSnapshotsForAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<readonly (typeof contractorPerformanceSnapshots.$inferSelect)[]> {
  return db
    .select()
    .from(contractorPerformanceSnapshots)
    .where(
      and(
        eq(contractorPerformanceSnapshots.organizationId, organizationId),
        eq(contractorPerformanceSnapshots.subcontractAgreementId, agreementId),
      ),
    )
    .orderBy(desc(contractorPerformanceSnapshots.computedAt));
}
