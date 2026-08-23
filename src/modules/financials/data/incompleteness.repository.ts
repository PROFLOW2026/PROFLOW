import { and, eq, inArray, isNull } from 'drizzle-orm';
import { allocationRunLines, allocationRuns, expenses, purchaseOrders } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export interface ProjectIncompletenessSignals {
  readonly openDraftDocumentCount: number;
  readonly openAllocationCount: number;
}

/**
 * Project-scoped incompleteness for data-confidence (open drafts / allocations).
 * Does not invent Actual — counts only known non-finalized inputs.
 */
export async function loadProjectIncompletenessSignals(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectIncompletenessSignals> {
  const [draftExpenses, draftPos, openAllocations] = await Promise.all([
    db
      .select({ id: expenses.id })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          eq(expenses.projectId, projectId),
          eq(expenses.status, 'draft'),
          isNull(expenses.archivedAt),
        ),
      ),
    db
      .select({ id: purchaseOrders.id })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          eq(purchaseOrders.projectId, projectId),
          eq(purchaseOrders.status, 'draft'),
          isNull(purchaseOrders.archivedAt),
        ),
      ),
    db
      .select({ id: allocationRuns.id })
      .from(allocationRuns)
      .innerJoin(
        allocationRunLines,
        and(
          eq(allocationRunLines.runId, allocationRuns.id),
          eq(allocationRunLines.organizationId, allocationRuns.organizationId),
        ),
      )
      .where(
        and(
          eq(allocationRuns.organizationId, organizationId),
          eq(allocationRuns.status, 'draft'),
          eq(allocationRunLines.projectId, projectId),
        ),
      ),
  ]);

  return {
    openDraftDocumentCount: draftExpenses.length + draftPos.length,
    openAllocationCount: openAllocations.length,
  };
}

export async function loadProjectIncompletenessCounts(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectIncompletenessSignals> {
  return loadProjectIncompletenessSignals(db, organizationId, projectId);
}

/**
 * Batch incompleteness for org rollup — one query group per signal type.
 */
export async function loadProjectIncompletenessSignalsBatch(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Map<string, ProjectIncompletenessSignals>> {
  const result = new Map<string, ProjectIncompletenessSignals>();
  if (projectIds.length === 0) return result;

  for (const projectId of projectIds) {
    result.set(projectId, { openDraftDocumentCount: 0, openAllocationCount: 0 });
  }

  const [draftExpenses, draftPos, openAllocations] = await Promise.all([
    db
      .select({ projectId: expenses.projectId })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, organizationId),
          inArray(expenses.projectId, [...projectIds]),
          eq(expenses.status, 'draft'),
          isNull(expenses.archivedAt),
        ),
      ),
    db
      .select({ projectId: purchaseOrders.projectId })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, organizationId),
          inArray(purchaseOrders.projectId, [...projectIds]),
          eq(purchaseOrders.status, 'draft'),
          isNull(purchaseOrders.archivedAt),
        ),
      ),
    db
      .select({ projectId: allocationRunLines.projectId })
      .from(allocationRuns)
      .innerJoin(
        allocationRunLines,
        and(
          eq(allocationRunLines.runId, allocationRuns.id),
          eq(allocationRunLines.organizationId, allocationRuns.organizationId),
        ),
      )
      .where(
        and(
          eq(allocationRuns.organizationId, organizationId),
          eq(allocationRuns.status, 'draft'),
          inArray(allocationRunLines.projectId, [...projectIds]),
        ),
      ),
  ]);

  const bump = (projectId: string | null, field: keyof ProjectIncompletenessSignals) => {
    if (!projectId) return;
    const current = result.get(projectId);
    if (!current) return;
    result.set(projectId, { ...current, [field]: current[field] + 1 });
  };

  for (const row of draftExpenses) bump(row.projectId, 'openDraftDocumentCount');
  for (const row of draftPos) bump(row.projectId, 'openDraftDocumentCount');
  for (const row of openAllocations) bump(row.projectId, 'openAllocationCount');

  return result;
}
