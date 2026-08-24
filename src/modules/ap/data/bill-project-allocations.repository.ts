import { and, asc, eq, inArray } from 'drizzle-orm';
import { apBillProjectAllocations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BillAllocationMethod } from '../domain/bill-project-allocation';

export type ApBillProjectAllocationRow = typeof apBillProjectAllocations.$inferSelect;

export async function listBillProjectAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
  statuses: readonly ('draft' | 'applied' | 'superseded')[] = ['draft', 'applied'],
): Promise<ApBillProjectAllocationRow[]> {
  return db
    .select()
    .from(apBillProjectAllocations)
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        eq(apBillProjectAllocations.apBillId, apBillId),
        inArray(apBillProjectAllocations.status, [...statuses]),
      ),
    )
    .orderBy(asc(apBillProjectAllocations.sortOrder));
}

export async function listAppliedBillProjectAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<ApBillProjectAllocationRow[]> {
  return listBillProjectAllocations(db, organizationId, apBillId, ['applied']);
}

/** Soft-retire applied/draft active rows so a replacement set can be inserted. */
export async function supersedeActiveBillAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<void> {
  await db
    .update(apBillProjectAllocations)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        eq(apBillProjectAllocations.apBillId, apBillId),
        inArray(apBillProjectAllocations.status, ['draft', 'applied']),
      ),
    );
}

/** Soft-retire applied rows only (drafts stay for promotion). */
export async function supersedeAppliedBillAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<void> {
  await db
    .update(apBillProjectAllocations)
    .set({ status: 'superseded', updatedAt: new Date() })
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        eq(apBillProjectAllocations.apBillId, apBillId),
        eq(apBillProjectAllocations.status, 'applied'),
      ),
    );
}

/** Hard-delete draft rows only (applied/superseded are immutable). */
export async function deleteDraftBillAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<void> {
  await db
    .delete(apBillProjectAllocations)
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        eq(apBillProjectAllocations.apBillId, apBillId),
        eq(apBillProjectAllocations.status, 'draft'),
      ),
    );
}

export async function insertBillProjectAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
  currency: string,
  status: 'draft' | 'applied',
  lines: readonly {
    /** Required when targetType is `project` (default). Must be null for overhead. */
    projectId?: string | null;
    /**
     * Schema allows `overhead` (project_id null). Default remains `project`.
     * `resolveBillProjectAllocationLines` stays project-only; overhead is a
     * persist option. Company Actual remainder already covers under-NET.
     */
    targetType?: 'project' | 'overhead';
    method: BillAllocationMethod;
    amount: string;
    percent?: string | null;
    basisDays?: string | null;
    notes?: string | null;
    sortOrder: number;
    supersedesAllocationId?: string | null;
  }[],
): Promise<ApBillProjectAllocationRow[]> {
  if (lines.length === 0) return [];

  const appliedAt = status === 'applied' ? new Date() : null;
  const rows = await db
    .insert(apBillProjectAllocations)
    .values(
      lines.map((line) => {
        const targetType = line.targetType ?? 'project';
        return {
          organizationId,
          apBillId,
          targetType,
          projectId: targetType === 'overhead' ? null : (line.projectId ?? null),
          method: line.method,
          amount: line.amount,
          currency,
          percent: line.percent ?? null,
          basisDays: line.basisDays ?? null,
          notes: line.notes ?? null,
          sortOrder: line.sortOrder,
          status,
          supersedesAllocationId: line.supersedesAllocationId ?? null,
          appliedAt,
        };
      }),
    )
    .returning();

  return rows;
}

export async function applyDraftBillAllocations(
  db: DbExecutor,
  organizationId: string,
  apBillId: string,
): Promise<ApBillProjectAllocationRow[]> {
  const rows = await db
    .update(apBillProjectAllocations)
    .set({
      status: 'applied',
      appliedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        eq(apBillProjectAllocations.apBillId, apBillId),
        eq(apBillProjectAllocations.status, 'draft'),
      ),
    )
    .returning();
  return rows;
}
