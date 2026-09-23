import { sql, type SQL } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { isAllocationIntentSchemaReady } from '@/modules/financials';

/**
 * Canonical SQL predicate: finalized shared overhead expense that requires Owner
 * project allocation lines (allocation_intent = project_allocate, no project lines).
 *
 * Excludes auto_pool (GCM engine) and company_only (intentional org-only).
 */
export async function sqlExpenseRequiresProjectAllocationFilter(
  db: DbExecutor,
  organizationId: string,
  expenseAlias = 'e',
): Promise<SQL> {
  const intentReady = await isAllocationIntentSchemaReady(db);
  const e = expenseAlias;
  const intentClause = intentReady
    ? sql.raw(`and ${e}.allocation_intent = 'project_allocate'`)
    : sql``;

  return sql`
    ${sql.raw(e)}.organization_id = ${organizationId}
    and ${sql.raw(e)}.status = 'finalized'
    and ${sql.raw(e)}.archived_at is null
    and coalesce(${sql.raw(e)}.inventory_stock_purchase, false) = false
    and ${sql.raw(e)}.project_id is null
    and ${sql.raw(e)}.cost_family = 'shared'
    and ${sql.raw(e)}.voids_expense_id is null
    and ${sql.raw(e)}.adjusts_expense_id is null
    ${intentClause}
    and not exists (
      select 1 from expenses rev
      where rev.voids_expense_id = ${sql.raw(e)}.id
        and rev.organization_id = ${organizationId}
        and rev.status = 'finalized'
        and rev.archived_at is null
    )
    and not exists (
      select 1 from expense_allocations a
      where a.expense_id = ${sql.raw(e)}.id
        and a.organization_id = ${organizationId}
        and a.project_id is not null
    )
  `;
}
