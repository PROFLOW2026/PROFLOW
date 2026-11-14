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
  expenses,
  projects,
  purchaseOrders,
  tasks,
  vendors,
  workspaces,
  crmOpportunities,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';
import { GLOBAL_SEARCH_KIND_CAP, ilikeContainsPattern } from '../domain/search-scope';
import { sqlUuidEqAny, taskProjectAccessCondition } from '@/modules/tasks/domain/task-project-access-filter';

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

export interface OpportunitySearchHit {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly stage: string;
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
    const projectAccess = taskProjectAccessCondition(accessibleProjectIds);
    if (projectAccess) conditions.push(projectAccess);
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
      and not (${sqlUuidEqAny(sql`dl.owner_id`, accessibleProjectIds)})
  )`;
}

// ─── Expense search ───────────────────────────────────────────────────────────

export interface ExpenseSearchHit {
  readonly id: string;
  readonly description: string | null;
  readonly status: string;
  readonly expenseDate: string;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly supplierName: string | null;
}

export async function searchExpenses(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<ExpenseSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const term = ilikeContainsPattern(exact);

  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      netAmount: expenses.netAmount,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      supplierName: expenses.supplierName,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        isNull(expenses.archivedAt),
        or(
          ilike(expenses.description, term),
          ilike(expenses.supplierName, term),
          ilike(expenses.notes, term),
        ),
      ),
    )
    .orderBy(desc(expenses.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    status: row.status,
    expenseDate: row.expenseDate,
    netAmount: row.netAmount,
    grossAmount: row.grossAmount,
    currency: row.currency,
    supplierName: row.supplierName,
  }));
}

// ─── Purchase Order search ────────────────────────────────────────────────────

export interface PurchaseOrderSearchHit {
  readonly id: string;
  readonly reference: string | null;
  readonly status: string;
  readonly committedAmount: string;
  readonly currency: string;
  readonly vendorName: string;
}

export async function searchPurchaseOrders(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<PurchaseOrderSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const term = ilikeContainsPattern(exact);

  const rows = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      status: purchaseOrders.status,
      committedAmount: purchaseOrders.committedAmount,
      currency: purchaseOrders.currency,
      vendorName: vendors.name,
    })
    .from(purchaseOrders)
    .innerJoin(
      vendors,
      and(
        eq(vendors.id, purchaseOrders.vendorId),
        eq(vendors.organizationId, purchaseOrders.organizationId),
      ),
    )
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        isNull(purchaseOrders.archivedAt),
        or(
          eq(purchaseOrders.reference, exact),
          ilike(purchaseOrders.reference, term),
          ilike(vendors.name, term),
          ilike(purchaseOrders.notes, term),
        ),
      ),
    )
    .orderBy(desc(purchaseOrders.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    status: row.status,
    committedAmount: row.committedAmount,
    currency: row.currency,
    vendorName: row.vendorName,
  }));
}

export async function searchOpportunities(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<OpportunitySearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];

  const term = ilikeContainsPattern(exact);

  const rows = await db
    .select({
      id: crmOpportunities.id,
      name: crmOpportunities.name,
      status: crmOpportunities.status,
      stage: crmOpportunities.stage,
    })
    .from(crmOpportunities)
    .where(
      and(
        eq(crmOpportunities.organizationId, organizationId),
        isNull(crmOpportunities.archivedAt),
        ilike(crmOpportunities.name, term),
      ),
    )
    .orderBy(desc(crmOpportunities.updatedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    stage: row.stage,
  }));
}

export interface WorkPermitSearchHit {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly projectId: string;
  readonly projectName: string | null;
}

/** Cache only positive probes — missing tables may appear after a later migrate. */
let workPermitsRelationReady: boolean | null = null;
let projectRisksRelationReady: boolean | null = null;

async function workPermitsSearchRelationReady(db: DbExecutor): Promise<boolean> {
  if (workPermitsRelationReady === true) return true;
  const rows = readSqlRows(
    await db.execute(
      sql`select to_regclass('public.work_permits') is not null as present`,
    ),
  );
  const ready = rows[0]?.present === true;
  if (ready) workPermitsRelationReady = true;
  return ready;
}

async function projectRisksSearchRelationReady(db: DbExecutor): Promise<boolean> {
  if (projectRisksRelationReady === true) return true;
  const rows = readSqlRows(
    await db.execute(
      sql`select to_regclass('public.project_risks') is not null as present`,
    ),
  );
  const ready = rows[0]?.present === true;
  if (ready) projectRisksRelationReady = true;
  return ready;
}

export async function searchWorkPermits(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleProjectIds: string[] | null,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<WorkPermitSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];
  if (!(await workPermitsSearchRelationReady(db))) return [];
  const term = ilikeContainsPattern(exact);
  const projectFilter =
    accessibleProjectIds != null && accessibleProjectIds.length > 0
      ? sql`and wp.project_id = any(${accessibleProjectIds}::uuid[])`
      : accessibleProjectIds != null
        ? sql`and false`
        : sql``;

  const rows = await db.execute(sql`
    select
      wp.id,
      wp.title,
      wp.status,
      wp.project_id,
      p.name as project_name
    from public.work_permits wp
    left join public.projects p
      on p.id = wp.project_id and p.organization_id = wp.organization_id
    where wp.organization_id = ${organizationId}::uuid
      and wp.title ilike ${term}
      ${projectFilter}
    order by wp.updated_at desc
    limit ${limit}
  `);
  return readSqlRows(rows).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    status: String(row.status),
    projectId: String(row.project_id),
    projectName: row.project_name != null ? String(row.project_name) : null,
  }));
}

export interface ProjectRiskSearchHit {
  readonly id: string;
  readonly description: string;
  readonly status: string;
  readonly projectId: string;
  readonly projectName: string | null;
}

function readSqlRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
}

export async function searchProjectRisks(
  db: DbExecutor,
  organizationId: string,
  query: string,
  accessibleProjectIds: string[] | null,
  limit = GLOBAL_SEARCH_KIND_CAP,
): Promise<ProjectRiskSearchHit[]> {
  const exact = trimmed(query);
  if (!exact) return [];
  if (!(await projectRisksSearchRelationReady(db))) return [];
  const term = ilikeContainsPattern(exact);
  const projectFilter =
    accessibleProjectIds != null && accessibleProjectIds.length > 0
      ? sql`and pr.project_id = any(${accessibleProjectIds}::uuid[])`
      : accessibleProjectIds != null
        ? sql`and false`
        : sql``;

  const rows = await db.execute(sql`
    select
      pr.id,
      pr.description,
      pr.status,
      pr.project_id,
      p.name as project_name
    from public.project_risks pr
    left join public.projects p
      on p.id = pr.project_id and p.organization_id = pr.organization_id
    where pr.organization_id = ${organizationId}::uuid
      and pr.description ilike ${term}
      ${projectFilter}
    order by (pr.probability * pr.impact) desc, pr.updated_at desc
    limit ${limit}
  `);
  return readSqlRows(rows).map((row) => ({
    id: String(row.id),
    description: String(row.description),
    status: String(row.status),
    projectId: String(row.project_id),
    projectName: row.project_name != null ? String(row.project_name) : null,
  }));
}
