import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { clients, employeeProjectAssignments, employees, projectServiceDetails, projects } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  DispatchListItem,
  ProjectServiceDetailsRecord,
  ServicePriority,
  ServiceStatus,
  WorkOrderListItem,
} from '../domain/types';

function asDateString(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapServiceDetails(
  row: typeof projectServiceDetails.$inferSelect,
): ProjectServiceDetailsRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    category: row.category,
    priority: row.priority as ServicePriority,
    serviceStatus: row.serviceStatus as ServiceStatus,
    requestedDate: asDateString(row.requestedDate),
    scheduledStartAt: row.scheduledStartAt,
    scheduledEndAt: row.scheduledEndAt,
    siteAddress: row.siteAddress,
    contactName: row.contactName,
    contactPhone: row.contactPhone,
    checklistTemplateId: row.checklistTemplateId,
    recurrenceDefinitionId: row.recurrenceDefinitionId,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertServiceDetails(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    category?: string | null;
    priority?: ServicePriority;
    serviceStatus?: ServiceStatus;
    requestedDate?: string | null;
    scheduledStartAt?: Date | null;
    scheduledEndAt?: Date | null;
    siteAddress?: string | null;
    contactName?: string | null;
    contactPhone?: string | null;
    checklistTemplateId?: string | null;
    recurrenceDefinitionId?: string | null;
    notes?: string | null;
  },
): Promise<ProjectServiceDetailsRecord> {
  const [row] = await db
    .insert(projectServiceDetails)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      category: input.category ?? null,
      priority: input.priority ?? 'normal',
      serviceStatus: input.serviceStatus ?? 'new',
      requestedDate: input.requestedDate ?? null,
      scheduledStartAt: input.scheduledStartAt ?? null,
      scheduledEndAt: input.scheduledEndAt ?? null,
      siteAddress: input.siteAddress ?? null,
      contactName: input.contactName ?? null,
      contactPhone: input.contactPhone ?? null,
      checklistTemplateId: input.checklistTemplateId ?? null,
      recurrenceDefinitionId: input.recurrenceDefinitionId ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  if (!row) {
    throw new Error('Failed to insert project_service_details');
  }

  return mapServiceDetails(row);
}

export async function findServiceDetailsByProjectId(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectServiceDetailsRecord | null> {
  const [row] = await db
    .select()
    .from(projectServiceDetails)
    .where(
      and(
        eq(projectServiceDetails.organizationId, organizationId),
        eq(projectServiceDetails.projectId, projectId),
      ),
    )
    .limit(1);

  return row ? mapServiceDetails(row) : null;
}

export async function updateServiceDetailsByProjectId(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  patch: Partial<{
    category: string | null;
    priority: ServicePriority;
    serviceStatus: ServiceStatus;
    requestedDate: string | null;
    scheduledStartAt: Date | null;
    scheduledEndAt: Date | null;
    siteAddress: string | null;
    contactName: string | null;
    contactPhone: string | null;
    checklistTemplateId: string | null;
    notes: string | null;
  }>,
): Promise<ProjectServiceDetailsRecord | null> {
  const [row] = await db
    .update(projectServiceDetails)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectServiceDetails.organizationId, organizationId),
        eq(projectServiceDetails.projectId, projectId),
      ),
    )
    .returning();

  return row ? mapServiceDetails(row) : null;
}

/** First active team member as interim primary assignee (until dedicated column). */
async function loadAssigneeMap(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Map<string, { employeeId: string; name: string }>> {
  const map = new Map<string, { employeeId: string; name: string }>();
  if (projectIds.length === 0) return map;

  const rows = await db
    .select({
      projectId: employeeProjectAssignments.projectId,
      employeeId: employees.id,
      name: employees.name,
      role: employeeProjectAssignments.role,
      createdAt: employeeProjectAssignments.createdAt,
    })
    .from(employeeProjectAssignments)
    .innerJoin(employees, eq(employees.id, employeeProjectAssignments.employeeId))
    .where(
      and(
        eq(employeeProjectAssignments.organizationId, organizationId),
        eq(employeeProjectAssignments.status, 'active'),
        inArray(employeeProjectAssignments.projectId, [...projectIds]),
      ),
    );

  // Prefer role=assignee, else earliest assignment.
  const sorted = [...rows].sort((a, b) => {
    const aPref = a.role === 'assignee' ? 0 : 1;
    const bPref = b.role === 'assignee' ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  for (const row of sorted) {
    if (map.has(row.projectId)) continue;
    map.set(row.projectId, {
      employeeId: row.employeeId,
      name: row.name,
    });
  }

  return map;
}

export async function listWorkOrdersWithDetails(
  db: DbExecutor,
  organizationId: string,
  filters: {
    search?: string | null;
    serviceStatus?: ServiceStatus | null;
    includeArchived?: boolean;
  } = {},
): Promise<WorkOrderListItem[]> {
  const conditions = [
    eq(projects.organizationId, organizationId),
    eq(projects.workKind, 'work_order'),
  ];

  if (!filters.includeArchived) {
    conditions.push(sql`${projects.archivedAt} is null`);
    conditions.push(sql`${projects.status} <> 'archived'`);
  }

  if (filters.serviceStatus) {
    conditions.push(eq(projectServiceDetails.serviceStatus, filters.serviceStatus));
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      sql`(
        ${projects.name} ilike ${term}
        or coalesce(${projects.location}, '') ilike ${term}
        or coalesce(${projectServiceDetails.siteAddress}, '') ilike ${term}
        or coalesce(${clients.name}, '') ilike ${term}
      )`,
    );
  }

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      pricingMode: projects.pricingMode,
      clientId: projects.clientId,
      clientName: clients.name,
      location: projects.location,
      description: projects.description,
      startDate: projects.startDate,
      currency: projects.currency,
      archivedAt: projects.archivedAt,
      service: projectServiceDetails,
      contractCurrency: sql<string | null>`(
        select c.currency from contracts c
        where c.project_id = ${projects.id}
          and c.organization_id = ${organizationId}
          and c.archived_at is null
        order by c.created_at asc
        limit 1
      )`,
      currentContractValue: sql<string | null>`(
        select coalesce(sum(cve.amount)::text, null)
        from contract_value_events cve
        join contracts c on c.id = cve.contract_id
        where c.project_id = ${projects.id}
          and c.organization_id = ${organizationId}
          and c.archived_at is null
      )`,
    })
    .from(projects)
    .leftJoin(
      projectServiceDetails,
      and(
        eq(projectServiceDetails.projectId, projects.id),
        eq(projectServiceDetails.organizationId, organizationId),
      ),
    )
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(...conditions))
    .orderBy(sql`${projects.updatedAt} desc`)
    .limit(200);

  const assigneeMap = await loadAssigneeMap(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => {
    const assignee = assigneeMap.get(row.id);
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      pricingMode: (row.pricingMode as WorkOrderListItem['pricingMode']) ?? null,
      clientId: row.clientId,
      clientName: row.clientName,
      location: row.location,
      description: row.description,
      startDate: asDateString(row.startDate),
      currency: row.currency,
      contractCurrency: row.contractCurrency,
      currentContractValue: row.currentContractValue,
      archivedAt: row.archivedAt,
      service: row.service ? mapServiceDetails(row.service) : null,
      assigneeName: assignee?.name ?? null,
      assigneeEmployeeId: assignee?.employeeId ?? null,
    };
  });
}

export async function listDispatchRows(
  db: DbExecutor,
  organizationId: string,
  range: { start: Date; endExclusive: Date },
  filters: {
    assigneeEmployeeId?: string | null;
    serviceStatus?: ServiceStatus | null;
  } = {},
): Promise<DispatchListItem[]> {
  const conditions = [
    eq(projects.organizationId, organizationId),
    eq(projects.workKind, 'work_order'),
    sql`${projects.archivedAt} is null`,
    gte(projectServiceDetails.scheduledStartAt, range.start),
    lt(projectServiceDetails.scheduledStartAt, range.endExclusive),
  ];

  if (filters.serviceStatus) {
    conditions.push(eq(projectServiceDetails.serviceStatus, filters.serviceStatus));
  }

  const rows = await db
    .select({
      projectId: projects.id,
      name: projects.name,
      clientName: clients.name,
      siteAddress: projectServiceDetails.siteAddress,
      serviceStatus: projectServiceDetails.serviceStatus,
      priority: projectServiceDetails.priority,
      scheduledStartAt: projectServiceDetails.scheduledStartAt,
      scheduledEndAt: projectServiceDetails.scheduledEndAt,
    })
    .from(projects)
    .innerJoin(
      projectServiceDetails,
      and(
        eq(projectServiceDetails.projectId, projects.id),
        eq(projectServiceDetails.organizationId, organizationId),
      ),
    )
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(...conditions))
    .orderBy(projectServiceDetails.scheduledStartAt)
    .limit(300);

  const assigneeMap = await loadAssigneeMap(
    db,
    organizationId,
    rows.map((row) => row.projectId),
  );

  return rows
    .map((row) => {
      const assignee = assigneeMap.get(row.projectId);
      return {
        projectId: row.projectId,
        name: row.name,
        clientName: row.clientName,
        siteAddress: row.siteAddress,
        serviceStatus: row.serviceStatus as ServiceStatus,
        priority: row.priority as ServicePriority,
        scheduledStartAt: row.scheduledStartAt,
        scheduledEndAt: row.scheduledEndAt,
        assigneeName: assignee?.name ?? null,
        assigneeEmployeeId: assignee?.employeeId ?? null,
      };
    })
    .filter((row) =>
      filters.assigneeEmployeeId
        ? row.assigneeEmployeeId === filters.assigneeEmployeeId
        : true,
    );
}

export async function findActiveAssigneeEmployeeId(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<string | null> {
  const map = await loadAssigneeMap(db, organizationId, [projectId]);
  return map.get(projectId)?.employeeId ?? null;
}

