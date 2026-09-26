/**
 * Global Search data layer.
 *
 * Each query is organization-scoped, matches name / document number / reference
 * (or the entity's equivalent indexed identity column), and is capped.
 * Task searches also enforce workspace membership and project-context access.
 */

import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  apBills,
  billingRecords,
  clients,
  contracts,
  documents,
  employees,
  estimates,
  projects,
  tasks,
  vendors,
  workspaces,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';
import { GLOBAL_SEARCH_KIND_CAP, ilikeContainsPattern } from '../domain/search-scope';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface TaskSearchHit {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: string | null;
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
}

export interface ProjectSearchHit {
  readonly id: string;
  readonly name: string;
  readonly documentNumber: string | null;
  readonly displayName: string;
  readonly status: string;
  readonly clientName: string | null;
}

export interface PartySearchHit {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly subtitle: string | null;
}

export interface BillingSearchHit {
  readonly id: string;
  readonly reference: string | null;
  readonly status: string;
  readonly issueDate: string;
  readonly totalAmount: string;
  readonly currency: string;
  readonly clientName: string | null;
}

export interface ApBillSearchHit {
  readonly id: string;
  readonly reference: string | null;
  readonly status: string;
  readonly billDate: string | null;
  readonly totalAmount: string;
  readonly currency: string;
  readonly vendorName: string;
}

export interface QuoteSearchHit {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly validityDate: string | null;
  readonly totalAmount: string | null;
  readonly currency: string;
  readonly clientName: string | null;
}

export interface DocumentSearchHit {
  readonly id: string;
  readonly originalFilename: string;
  readonly status: string;
  readonly category: string | null;
}

export interface EmployeeSearchHit {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly jobTitle: string | null;
  readonly employeeNumber: string | null;
}

export interface ContractSearchHit {
  readonly id: string;
  readonly projectId: string;
  readonly name: string | null;
  readonly contractNumber: string | null;
  readonly reference: string | null;
  readonly status: string;
  readonly projectName: string;
}

function trimmed(query: string): string {
  return query.trim();
}

// ─── Task search ──────────────────────────────────────────────────────────────

/**
 * Search tasks by title, or by the parent project's document number.
 * Strictly filtered by:
 *  - Caller workspace membership (accessibleWorkspaceIds)
 *  - Project-context access (accessibleProjectIds — null means unrestricted)
 *
 * NEVER returns hits from workspaces not in accessibleWorkspaceIds.
 */
export async function searchTasks(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleWorkspaceIds: string[],
  accessibleProjectIds: string[] | null,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<TaskSearchHit[]> {
  const exact = trimmed(query);
  if (!exact || accessibleWorkspaceIds.length === 0) return [];

  const term = ilikeContainsPattern(exact);

  const conditions = [
    eq(tasks.organizationId, organizationId),
    inArray(tasks.workspaceId, accessibleWorkspaceIds),
    isNull(tasks.archivedAt),
    or(ilike(tasks.title, term), ilike(projects.documentNumber, term), eq(projects.documentNumber, exact))!,
  ];

  // Project-context filter: tasks with no project are always visible in accessible workspaces;
  // tasks with a project must be in accessibleProjectIds.
  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) {
      conditions.push(isNull(tasks.projectId));
    } else {
      conditions.push(
        sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`,
      );
    }
  }

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      workspaceId: tasks.workspaceId,
      workspaceName: workspaces.name,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectDocumentNumber: projects.documentNumber,
    })
    .from(tasks)
    .innerJoin(
      workspaces,
      and(eq(workspaces.id, tasks.workspaceId), eq(workspaces.organizationId, tasks.organizationId)),
    )
    .leftJoin(
      projects,
      and(eq(projects.id, tasks.projectId), eq(projects.organizationId, tasks.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate,
    workspaceId: r.workspaceId,
    workspaceName: r.workspaceName,
    projectId: r.projectId ?? null,
    projectName: r.projectName
      ? formatProjectDisplayName(r.projectName, r.projectDocumentNumber)
      : null,
  }));
}

/**
 * Search projects by name or document number.
 * Filtered by accessibleProjectIds (null = unrestricted).
 */
export async function searchProjects(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleProjectIds: string[] | null,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<ProjectSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const term = ilikeContainsPattern(exact);

  const conditions = [
    eq(projects.organizationId, organizationId),
    isNull(projects.archivedAt),
    or(ilike(projects.name, term), ilike(projects.documentNumber, term), eq(projects.documentNumber, exact))!,
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) return [];
    conditions.push(inArray(projects.id, accessibleProjectIds));
  }

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      documentNumber: projects.documentNumber,
      status: projects.status,
      clientName: clients.name,
    })
    .from(projects)
    .leftJoin(
      clients,
      and(eq(clients.id, projects.clientId), eq(clients.organizationId, projects.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(desc(projects.updatedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    documentNumber: r.documentNumber,
    displayName: formatProjectDisplayName(r.name, r.documentNumber),
    status: r.status,
    clientName: r.clientName,
  }));
}

export async function searchClients(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<PartySearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      email: clients.email,
    })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        isNull(clients.archivedAt),
        ilike(clients.name, ilikeContainsPattern(exact)),
      ),
    )
    .orderBy(desc(clients.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    subtitle: row.email,
  }));
}

export async function searchVendors(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<PartySearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const rows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      status: vendors.status,
      email: vendors.email,
    })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, organizationId),
        isNull(vendors.archivedAt),
        ilike(vendors.name, ilikeContainsPattern(exact)),
      ),
    )
    .orderBy(desc(vendors.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    subtitle: row.email,
  }));
}

export async function searchBillingRecords(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<BillingSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const rows = await db
    .select({
      id: billingRecords.id,
      reference: billingRecords.reference,
      status: billingRecords.status,
      issueDate: billingRecords.issueDate,
      totalAmount: billingRecords.totalAmount,
      currency: billingRecords.currency,
      clientName: clients.name,
    })
    .from(billingRecords)
    .leftJoin(
      clients,
      and(
        eq(clients.id, billingRecords.clientId),
        eq(clients.organizationId, billingRecords.organizationId),
      ),
    )
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        or(eq(billingRecords.reference, exact), ilike(billingRecords.reference, ilikeContainsPattern(exact))),
      ),
    )
    .orderBy(desc(billingRecords.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    issueDate: row.issueDate,
    totalAmount: row.totalAmount,
    currency: row.currency,
    clientName: row.clientName,
  }));
}

export async function searchApBills(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<ApBillSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const rows = await db
    .select({
      id: apBills.id,
      reference: apBills.reference,
      status: apBills.status,
      billDate: apBills.billDate,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
      vendorName: vendors.name,
    })
    .from(apBills)
    .innerJoin(
      vendors,
      and(eq(vendors.id, apBills.vendorId), eq(vendors.organizationId, apBills.organizationId)),
    )
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        isNull(apBills.archivedAt),
        or(
          eq(apBills.reference, exact),
          ilike(apBills.reference, ilikeContainsPattern(exact)),
          ilike(vendors.name, ilikeContainsPattern(exact)),
        ),
      ),
    )
    .orderBy(desc(apBills.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    billDate: row.billDate,
    totalAmount: row.totalAmount,
    currency: row.currency,
    vendorName: row.vendorName,
  }));
}

/** Product quotes live on `estimates`, not change-order quotes. */
export async function searchQuotes(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<QuoteSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const rows = await db
    .select({
      id: estimates.id,
      title: estimates.title,
      status: estimates.status,
      validityDate: estimates.validityDate,
      totalAmount: estimates.totalAmount,
      currency: estimates.currency,
      clientName: clients.name,
    })
    .from(estimates)
    .leftJoin(
      clients,
      and(eq(clients.id, estimates.clientId), eq(clients.organizationId, estimates.organizationId)),
    )
    .where(
      and(
        eq(estimates.organizationId, organizationId),
        isNull(estimates.archivedAt),
        ilike(estimates.title, ilikeContainsPattern(exact)),
      ),
    )
    .orderBy(desc(estimates.updatedAt))
    .limit(limit);

  return rows;
}

/**
 * Filename search. Compensation files stay hidden unless the caller already
 * has workforce cost read. Project-linked files follow the same access set
 * as the documents list (`null` = unrestricted).
 */
export async function searchDocuments(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleProjectIds: string[] | null,
  includeCompensation: boolean,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<DocumentSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const conditions = [
    eq(documents.organizationId, organizationId),
    isNull(documents.deletedAt),
    sql`${documents.status} <> 'deleted'`,
    ilike(documents.originalFilename, ilikeContainsPattern(exact)),
  ];

  if (!includeCompensation) {
    conditions.push(sql`${documents.privacyClass} is distinct from 'compensation'`);
  }

  const projectRestriction = documentProjectRestriction(organizationId, accessibleProjectIds);
  if (projectRestriction) conditions.push(projectRestriction);

  const rows = await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      status: documents.status,
      category: documents.category,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(desc(documents.updatedAt))
    .limit(limit);

  return rows;
}

export async function searchEmployees(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<EmployeeSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      status: employees.status,
      jobTitle: employees.jobTitle,
      employeeNumber: employees.employeeNumber,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        isNull(employees.archivedAt),
        or(
          ilike(employees.name, ilikeContainsPattern(exact)),
          eq(employees.employeeNumber, exact),
          ilike(employees.employeeNumber, ilikeContainsPattern(exact)),
        ),
      ),
    )
    .orderBy(desc(employees.updatedAt))
    .limit(limit);

  return rows;
}

export async function searchContracts(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleProjectIds: string[] | null,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<ContractSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];
  if (accessibleProjectIds !== null && accessibleProjectIds.length === 0) return [];

  const term = ilikeContainsPattern(exact);
  const conditions = [
    eq(contracts.organizationId, organizationId),
    isNull(contracts.archivedAt),
    or(
      ilike(contracts.name, term),
      eq(contracts.contractNumber, exact),
      ilike(contracts.contractNumber, term),
      eq(contracts.reference, exact),
      ilike(contracts.reference, term),
    )!,
  ];

  if (accessibleProjectIds !== null) {
    conditions.push(inArray(contracts.projectId, accessibleProjectIds));
  }

  const rows = await db
    .select({
      id: contracts.id,
      projectId: contracts.projectId,
      name: contracts.name,
      contractNumber: contracts.contractNumber,
      reference: contracts.reference,
      status: contracts.status,
      projectName: projects.name,
    })
    .from(contracts)
    .innerJoin(
      projects,
      and(eq(projects.id, contracts.projectId), eq(projects.organizationId, contracts.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(desc(contracts.updatedAt))
    .limit(limit);

  return rows;
}

function documentProjectRestriction(organizationId: string, accessibleProjectIds: string[] | null) {
  if (accessibleProjectIds === null) return undefined;
  if (accessibleProjectIds.length === 0) {
    return sql`not exists (
      select 1 from document_links dl
      where dl.document_id = ${documents.id}
        and dl.organization_id = ${organizationId}
        and dl.owner_type in ('project', 'work_order')
    )`;
  }
  return sql`not exists (
    select 1 from document_links dl
    where dl.document_id = ${documents.id}
      and dl.organization_id = ${organizationId}
      and dl.owner_type in ('project', 'work_order')
      and not (dl.owner_id = any(${accessibleProjectIds}))
  )`;
}
