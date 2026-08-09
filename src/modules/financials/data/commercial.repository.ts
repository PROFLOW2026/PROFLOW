import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { changeRequests, contracts, contractValueEvents } from '@drizzle/schema';
import { computeCommercialPosition } from '@/modules/commercial/domain/contract-value';
import type {
  ContractValueEventRecord,
  PendingChangeInput,
} from '@/modules/commercial/domain/types';
import type { CommercialPosition } from '@/modules/financials/domain/types';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow, sqlRows } from './sql-rows';

export interface ProjectCommercialData {
  readonly currency: string;
  readonly position: CommercialPosition;
}

export async function loadProjectCommercialData(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectCommercialData | null> {
  const [contract] = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        eq(contracts.projectId, projectId),
        eq(contracts.isPrimary, true),
        isNull(contracts.archivedAt),
      ),
    )
    .limit(1);

  if (!contract) return null;

  const events = await db
    .select()
    .from(contractValueEvents)
    .where(
      and(
        eq(contractValueEvents.organizationId, organizationId),
        eq(contractValueEvents.contractId, contract.id),
      ),
    );

  const pendingResult = await db.execute(sql`
    select cr.status, cr.direction, cr.requested_amount, cr.currency,
      (
        select qv.subtotal_amount
        from quote_versions qv
        inner join quotes q on q.id = qv.quote_id
        where q.change_request_id = cr.id and qv.is_selected = true
        limit 1
      ) as priced_amount
    from change_requests cr
    where cr.organization_id = ${organizationId}
      and cr.project_id = ${projectId}
      and cr.archived_at is null
      and cr.status in ('draft', 'awaiting_approval')
  `);

  const pendingChanges: PendingChangeInput[] = sqlRows<{
    status: string;
    direction: string;
    requested_amount: string | null;
    currency: string;
    priced_amount: string | null;
  }>(pendingResult).map((row) => ({
    status: row.status as PendingChangeInput['status'],
    direction: row.direction as PendingChangeInput['direction'],
    requestedAmount: row.requested_amount,
    currency: row.currency,
    pricedAmount: row.priced_amount,
  }));

  const valueEvents: ContractValueEventRecord[] = events.map((event) => ({
    id: event.id,
    organizationId: event.organizationId,
    contractId: event.contractId,
    projectId: event.projectId,
    kind: event.kind as ContractValueEventRecord['kind'],
    amount: event.amount,
    currency: event.currency,
    changeOrderId: event.changeOrderId,
    effectiveDate: event.effectiveDate,
  }));

  const position = computeCommercialPosition({
    valueEvents,
    pendingChanges,
    currency: contract.currency,
    originalValueFallback: contract.originalValueAmount,
  });

  return { currency: contract.currency, position };
}

/**
 * Set-based commercial positions for many projects (org rollup).
 * Same arithmetic as loadProjectCommercialData — one primary contract per project.
 */
export async function loadCommercialDataForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Map<string, ProjectCommercialData>> {
  const result = new Map<string, ProjectCommercialData>();
  if (projectIds.length === 0) return result;

  const ids = [...projectIds];
  const contractRows = await db
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        inArray(contracts.projectId, ids),
        eq(contracts.isPrimary, true),
        isNull(contracts.archivedAt),
      ),
    );

  const contractByProject = new Map<string, (typeof contractRows)[number]>();
  for (const contract of contractRows) {
    if (!contractByProject.has(contract.projectId)) {
      contractByProject.set(contract.projectId, contract);
    }
  }

  const contractIds = [...contractByProject.values()].map((row) => row.id);
  const eventsByContract = new Map<string, (typeof contractValueEvents.$inferSelect)[]>();
  if (contractIds.length > 0) {
    const events = await db
      .select()
      .from(contractValueEvents)
      .where(
        and(
          eq(contractValueEvents.organizationId, organizationId),
          inArray(contractValueEvents.contractId, contractIds),
        ),
      );
    for (const event of events) {
      const list = eventsByContract.get(event.contractId) ?? [];
      list.push(event);
      eventsByContract.set(event.contractId, list);
    }
  }

  const pendingResult = await db.execute(sql`
    select cr.project_id, cr.status, cr.direction, cr.requested_amount, cr.currency,
      (
        select qv.subtotal_amount
        from quote_versions qv
        inner join quotes q on q.id = qv.quote_id
        where q.change_request_id = cr.id and qv.is_selected = true
        limit 1
      ) as priced_amount
    from change_requests cr
    where cr.organization_id = ${organizationId}
      and cr.project_id in (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
      and cr.archived_at is null
      and cr.status in ('draft', 'awaiting_approval')
  `);

  const pendingByProject = new Map<string, PendingChangeInput[]>();
  for (const row of sqlRows<{
    project_id: string;
    status: string;
    direction: string;
    requested_amount: string | null;
    currency: string;
    priced_amount: string | null;
  }>(pendingResult)) {
    const list = pendingByProject.get(row.project_id) ?? [];
    list.push({
      status: row.status as PendingChangeInput['status'],
      direction: row.direction as PendingChangeInput['direction'],
      requestedAmount: row.requested_amount,
      currency: row.currency,
      pricedAmount: row.priced_amount,
    });
    pendingByProject.set(row.project_id, list);
  }

  for (const [projectId, contract] of contractByProject) {
    const events = eventsByContract.get(contract.id) ?? [];
    const valueEvents: ContractValueEventRecord[] = events.map((event) => ({
      id: event.id,
      organizationId: event.organizationId,
      contractId: event.contractId,
      projectId: event.projectId,
      kind: event.kind as ContractValueEventRecord['kind'],
      amount: event.amount,
      currency: event.currency,
      changeOrderId: event.changeOrderId,
      effectiveDate: event.effectiveDate,
    }));

    const position = computeCommercialPosition({
      valueEvents,
      pendingChanges: pendingByProject.get(projectId) ?? [],
      currency: contract.currency,
      originalValueFallback: contract.originalValueAmount,
    });

    result.set(projectId, { currency: contract.currency, position });
  }

  return result;
}

export async function sumActiveProjectContractValues(
  db: DbExecutor,
  organizationId: string,
  baseCurrency: string,
): Promise<{
  total: string;
  currency: string;
  activeCount: number;
  excludedForeignCurrencyProjectCount: number;
}> {
  const countRow = sqlFirstRow<{ count: number }>(
    await db.execute(sql`
      select count(*)::int as count
      from projects
      where organization_id = ${organizationId}
        and archived_at is null
        and status = 'active'
    `),
  );

  const valueRow = sqlFirstRow<{
    current_value: string;
    excluded_foreign_currency_project_count: number;
  }>(
    await db.execute(sql`
      select
        coalesce(sum(event_totals.base_currency_total), 0)::text as current_value,
        count(*) filter (where event_totals.has_foreign_currency)::int
          as excluded_foreign_currency_project_count
      from projects p
      inner join contracts c on c.project_id = p.id and c.is_primary = true and c.archived_at is null
      inner join lateral (
        select
          coalesce(
            sum(cve.amount) filter (where upper(cve.currency) = upper(${baseCurrency})),
            0
          ) as base_currency_total,
          exists (
            select 1
            from contract_value_events foreign_events
            where foreign_events.contract_id = c.id
              and upper(foreign_events.currency) <> upper(${baseCurrency})
          ) as has_foreign_currency
        from contract_value_events cve
        where cve.contract_id = c.id
      ) event_totals on true
      where p.organization_id = ${organizationId}
        and p.archived_at is null
        and p.status = 'active'
    `),
  );

  return {
    total: valueRow?.current_value ?? '0',
    currency: baseCurrency,
    activeCount: countRow?.count ?? 0,
    excludedForeignCurrencyProjectCount:
      valueRow?.excluded_foreign_currency_project_count ?? 0,
  };
}

export async function sumUnbilledApprovedChanges(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<{ amount: string; count: number }> {
  const row = sqlFirstRow<{ total: string; count: number }>(
    await db.execute(sql`
      select
        coalesce(sum(co.amount), 0)::text as total,
        count(*)::int as count
      from change_orders co
      where co.organization_id = ${organizationId}
        and co.currency = ${currency}
        and co.direction = 'addition'
        and not exists (
          select 1 from billing_lines bl
          where bl.change_order_id = co.id
            and bl.organization_id = ${organizationId}
        )
    `),
  );

  return { amount: row?.total ?? '0', count: row?.count ?? 0 };
}

export async function countPendingChanges(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(changeRequests)
    .where(
      and(
        eq(changeRequests.organizationId, organizationId),
        isNull(changeRequests.archivedAt),
        sql`${changeRequests.status} in ('draft', 'awaiting_approval')`,
      ),
    );

  return row?.count ?? 0;
}

export async function countUnbilledApprovedChanges(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const row = sqlFirstRow<{ count: number }>(
    await db.execute(sql`
      select count(*)::int as count
      from change_orders co
      where co.organization_id = ${organizationId}
        and co.direction = 'addition'
        and not exists (
          select 1 from billing_lines bl
          where bl.change_order_id = co.id
            and bl.organization_id = ${organizationId}
        )
    `),
  );

  return row?.count ?? 0;
}

export function emptyCommercialPosition(currency: string): CommercialPosition {
  return computeCommercialPosition({
    valueEvents: [],
    pendingChanges: [],
    currency,
    originalValueFallback: null,
  });
}
