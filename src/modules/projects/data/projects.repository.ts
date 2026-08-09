import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { clients, contracts, projects } from '@drizzle/schema';
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
    clientId: row.clientId,
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
    clientId?: string | null;
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
      clientId: input.clientId ?? null,
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
    clientId: string | null;
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
): Promise<ProjectListItem[]> {
  const conditions = [eq(projects.organizationId, organizationId)];

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

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(projects.name, term), ilike(projects.location, term))!);
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
          and c.is_primary = true
          and c.archived_at is null
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
