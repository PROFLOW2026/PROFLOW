import { and, eq, isNull, sql } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { sqlRows } from './sql-rows';

export interface ActiveProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly clientName: string | null;
  readonly currentContractValue: string | null;
  readonly currency: string | null;
}

export async function listRecentActiveProjects(
  db: DbExecutor,
  organizationId: string,
  limit = 5,
): Promise<ActiveProjectSummary[]> {
  const rows = sqlRows<{
    id: string;
    name: string;
    status: string;
    client_name: string | null;
    current_value: string | null;
    currency: string | null;
  }>(await db.execute(sql`
    select
      p.id,
      p.name,
      p.status,
      c.name as client_name,
      contract_totals.current_value,
      coalesce(p.currency, c2.currency) as currency
    from projects p
    left join clients c on c.id = p.client_id
    left join contracts c2 on c2.project_id = p.id and c2.is_primary = true and c2.archived_at is null
    left join lateral (
      select coalesce(sum(cve.amount), 0)::text as current_value
      from contract_value_events cve
      where cve.contract_id = c2.id
    ) contract_totals on true
    where p.organization_id = ${organizationId}
      and p.archived_at is null
      and p.status = 'active'
    order by p.updated_at desc
    limit ${limit}
  `));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    clientName: row.client_name,
    currentContractValue: row.current_value,
    currency: row.currency,
  }));
}

export async function countActiveProjects(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, 'active'),
        isNull(projects.archivedAt),
      ),
    );

  return row?.count ?? 0;
}

export async function listActiveProjectIds(
  db: DbExecutor,
  organizationId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.status, 'active'),
        isNull(projects.archivedAt),
      ),
    );

  return rows.map((row) => row.id);
}

export async function hasAnyProject(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), isNull(projects.archivedAt)))
    .limit(1);

  return Boolean(row);
}

export async function findProjectCurrency(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  fallbackCurrency: string,
): Promise<string> {
  const [row] = await db
    .select({ currency: projects.currency })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
    .limit(1);

  return (row?.currency ?? fallbackCurrency).toUpperCase();
}

/**
 * Project currency + uncovenanted expected remaining cost (ETC) for forecast.
 * Null ETC amount means zero - never invent a budget from contract/actual.
 * Includes work_kind / pricing_mode for open-price profit gating.
 */
export async function findProjectForecastInputs(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  fallbackCurrency: string,
): Promise<{
  currency: string;
  expectedRemainingCostAmount: string | null;
  workKind: string;
  pricingMode: string | null;
}> {
  const [row] = await db
    .select({
      currency: projects.currency,
      expectedRemainingCostAmount: projects.expectedRemainingCostAmount,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
    })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)))
    .limit(1);

  return {
    currency: (row?.currency ?? fallbackCurrency).toUpperCase(),
    expectedRemainingCostAmount: row?.expectedRemainingCostAmount ?? null,
    workKind: row?.workKind ?? 'project',
    pricingMode: row?.pricingMode ?? null,
  };
}

/**
 * Persist uncovenanted ETC. Amount must be non-negative project-currency decimal string, or null to clear.
 */
export async function updateProjectExpectedRemainingCost(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  expectedRemainingCostAmount: string | null,
): Promise<boolean> {
  const [row] = await db
    .update(projects)
    .set({
      expectedRemainingCostAmount,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.id, projectId),
        isNull(projects.archivedAt),
      ),
    )
    .returning({ id: projects.id });

  return Boolean(row);
}

export async function assertProjectInOrg(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.id, projectId),
        isNull(projects.archivedAt),
      ),
    )
    .limit(1);

  return Boolean(row);
}
