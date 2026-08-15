import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { clients, contracts, projects } from '@drizzle/schema';
import { existsSearchableCustomFieldValueSql } from '@/modules/custom-fields';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ProjectListFilters,
  ProjectListItem,
  ProjectRecord,
  ProjectSortField,
  SortDirection,
} from '../domain/types';

function mapProject(row: typeof projects.$inferSelect): ProjectRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    workKind: (row.workKind as ProjectRecord['workKind']) ?? 'project',
    pricingMode: (row.pricingMode as ProjectRecord['pricingMode']) ?? null,
    clientId: row.clientId,
    primaryContactId: row.primaryContactId,
    currency: row.currency,
    description: row.description,
    location: row.location,
    projectRole: row.projectRole,
    deliveryMode: row.deliveryMode,
    startDate: row.startDate,
    targetEndDate: row.targetEndDate,
    actualEndDate: row.actualEndDate,
    progressPercent: row.progressPercent,
    progressStatus: (row.progressStatus as ProjectRecord['progressStatus']) ?? null,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sortColumn(field: ProjectSortField) {
  switch (field) {
    case 'name':
      return projects.name;
    case 'status':
      return projects.status;
    case 'updated_at':
      return projects.updatedAt;
    case 'created_at':
    default:
      return projects.createdAt;
  }
}

function sortDirection(direction: SortDirection) {
  return direction === 'asc' ? asc : desc;
}

export async function insertProject(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    status?: ProjectRecord['status'];
    workKind?: ProjectRecord['workKind'];
    pricingMode?: ProjectRecord['pricingMode'];
    clientId?: string | null;
    primaryContactId?: string | null;
    currency?: string | null;
    description?: string | null;
    location?: string | null;
    projectRole?: string | null;
    deliveryMode?: string | null;
    startDate?: string | null;
    targetEndDate?: string | null;
    actualEndDate?: string | null;
    notes?: string | null;
  },
): Promise<ProjectRecord> {
  const [row] = await db
    .insert(projects)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      status: input.status ?? 'active',
      workKind: input.workKind ?? 'project',
      pricingMode: input.pricingMode ?? null,
      clientId: input.clientId ?? null,
      primaryContactId: input.primaryContactId ?? null,
      currency: input.currency ?? null,
      description: input.description ?? null,
      location: input.location ?? null,
      projectRole: input.projectRole ?? null,
      deliveryMode: input.deliveryMode ?? null,
      startDate: input.startDate ?? null,
      targetEndDate: input.targetEndDate ?? null,
      actualEndDate: input.actualEndDate ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapProject(row!);
}

export async function updateProjectById(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  patch: Partial<{
    name: string;
    status: ProjectRecord['status'];
    workKind: ProjectRecord['workKind'];
    pricingMode: ProjectRecord['pricingMode'];
    clientId: string | null;
    primaryContactId: string | null;
    currency: string | null;
    description: string | null;
    location: string | null;
    projectRole: string | null;
    deliveryMode: string | null;
    startDate: string | null;
    targetEndDate: string | null;
    actualEndDate: string | null;
    progressPercent: string | null;
    progressStatus: ProjectRecord['progressStatus'];
    notes: string | null;
    archivedAt: Date | null;
  }>,
): Promise<ProjectRecord | null> {
  const [row] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .returning();

  return row ? mapProject(row) : null;
}

export async function findProjectById(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectRecord | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  return row ? mapProject(row) : null;
}

export async function listProjects(
  db: DbExecutor,
  organizationId: string,
  filters: ProjectListFilters = {},
  options: { restrictToProjectIds?: string[] | null } = {},
): Promise<ProjectListItem[]> {
  if (options.restrictToProjectIds && options.restrictToProjectIds.length === 0) {
    return [];
  }

  const conditions = [eq(projects.organizationId, organizationId)];
  if (options.restrictToProjectIds) {
    conditions.push(inArray(projects.id, options.restrictToProjectIds));
  }

  if (!filters.includeArchived) {
    conditions.push(isNull(projects.archivedAt));
    conditions.push(sql`${projects.status} <> 'archived'`);
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(projects.status, filters.status));
  }

  if (filters.clientId) {
    conditions.push(eq(projects.clientId, filters.clientId));
  }

  if (filters.workKind) {
    conditions.push(eq(projects.workKind, filters.workKind));
  }

  if (filters.awaitingPayment) {
    // Outstanding = signed finalized billing − recorded payments (never a stored balance).
    conditions.push(sql`(
      coalesce((
        select sum(case when br.kind = 'credit_note' then -br.total_amount else br.total_amount end)
        from billing_records br
        where br.project_id = ${projects.id}
          and br.organization_id = ${organizationId}
          and br.archived_at is null
          and br.status not in ('draft', 'void')
      ), 0)
      - coalesce((
        select sum(p.amount)
        from payments p
        join billing_records br on br.id = p.billing_record_id
        where br.project_id = ${projects.id}
          and br.organization_id = ${organizationId}
          and br.archived_at is null
          and br.status not in ('draft', 'void')
          and p.status = 'recorded'
      ), 0)
      - coalesce((
        select sum(br.retention_held_remaining)
        from billing_records br
        where br.project_id = ${projects.id}
          and br.organization_id = ${organizationId}
          and br.archived_at is null
          and br.status not in ('draft', 'void')
          and br.kind <> 'credit_note'
      ), 0)
    ) > 0`);
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(projects.name, term),
        ilike(projects.location, term),
        existsSearchableCustomFieldValueSql(organizationId, 'project', projects.id, term),
      )!,
    );
  }

  const sortBy = filters.sortBy ?? 'updated_at';
  const sortDir = filters.sortDirection ?? 'desc';

  const rows = await db
    .select({
      project: projects,
      clientName: clients.name,
      workPackageCount: sql<number>`(
        select count(*)::int from work_packages wp
        where wp.project_id = ${projects.id}
          and wp.organization_id = ${organizationId}
          and wp.archived_at is null
      )`,
      contractCurrency: contracts.currency,
      currentContractValue: sql<string | null>`(
        select coalesce(sum(cve.amount)::text, null)
        from contract_value_events cve
        join contracts c on c.id = cve.contract_id
        where c.project_id = ${projects.id}
          and c.organization_id = ${organizationId}
          and c.archived_at is null
          and upper(cve.currency) = upper(coalesce(
            (
              select primary_c.currency
              from contracts primary_c
              where primary_c.project_id = ${projects.id}
                and primary_c.organization_id = ${organizationId}
                and primary_c.is_primary = true
                and primary_c.archived_at is null
              limit 1
            ),
            ${projects.currency}
          ))
      )`,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(
      contracts,
      and(
        eq(contracts.projectId, projects.id),
        eq(contracts.isPrimary, true),
        isNull(contracts.archivedAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(sortDirection(sortDir)(sortColumn(sortBy)))
    .limit(
      resolveListLimit(filters.limit, {
        hardCap:
          filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapProject(row.project),
    clientName: row.clientName,
    workPackageCount: row.workPackageCount,
    currentContractValue: row.currentContractValue,
    contractCurrency: row.contractCurrency ?? row.project.currency,
    expectedRemainingCostAmount: row.project.expectedRemainingCostAmount,
  }));
}

export async function countProjectsByClientId(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.clientId, clientId),
        isNull(projects.archivedAt),
      ),
    );

  return row?.count ?? 0;
}
