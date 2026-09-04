import { and, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  apBills,
  apVendorCredits,
  assets,
  billingRecords,
  boqNodes,
  calendarEvents,
  clientContacts,
  clients,
  contracts,
  crmOpportunities,
  dailyLogs,
  employees,
  estimates,
  expenses,
  inspections,
  inventoryItems,
  materialItems,
  outboundCommunications,
  projectBillingCycles,
  projectBillingPlans,
  projectBoqs,
  projectCloseouts,
  projects,
  punchListItems,
  purchaseOrders,
  recurringFinancialDrafts,
  safetyRecords,
  subcontractAgreements,
  vendors,
  warrantyCoverages,
  approvalRequests,
} from '@drizzle/schema';
import { existsSearchableCustomFieldValueSql } from '@/modules/custom-fields';
import { listAllDocuments } from '@/modules/documents/lookups';
import type { DbExecutor } from '@/shared/db/types';
import type { GlobalSearchHit } from '../domain/types';
import {
  assetSearchHref,
  billingCycleSearchHref,
  billingPlanSearchHref,
  calendarEventSearchHref,
  closeoutSearchHref,
  communicationSearchHref,
  inventoryItemSearchHref,
  materialSearchHref,
  warrantySearchHref,
} from '../domain/hrefs';

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === '42P01' ||
    code === '42703' ||
    /relation .+ does not exist/i.test(message) ||
    /column .+ does not exist/i.test(message)
  );
}

function likeTerm(query: string): string {
  return `%${query.replace(/[%_]/g, ' ').trim()}%`;
}

function projectAccessSql(
  column: ReturnType<typeof sql> | { name?: string },
  allowed: string[] | null,
) {
  if (allowed === null) return sql`true`;
  if (allowed.length === 0) return sql`false`;
  return inArray(column as never, allowed);
}

function moneyContext(
  includeMoney: boolean,
  amount: string | null | undefined,
  currency: string | null | undefined,
): Pick<GlobalSearchHit, 'amount' | 'currency'> {
  if (!includeMoney || !amount) return {};
  return { amount, currency: currency ?? null };
}

export async function searchProjectsByWorkKind(
  db: DbExecutor,
  organizationId: string,
  query: string,
  workKind: 'project' | 'job' | 'work_order',
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const hrefBase =
    workKind === 'job' ? '/jobs' : workKind === 'work_order' ? '/work-orders' : '/projects';
  const kind = workKind;
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      location: projects.location,
      documentNumber: projects.documentNumber,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.workKind, workKind),
        isNull(projects.archivedAt),
        projectAccessSql(projects.id, accessibleProjectIds),
        or(
          ilike(projects.name, term),
          ilike(projects.location, term),
          ilike(projects.documentNumber, term),
          existsSearchableCustomFieldValueSql(organizationId, 'project', projects.id, term),
        )!,
      ),
    )
    .orderBy(projects.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind,
    id: row.id,
    title: row.documentNumber ? `${row.documentNumber} · ${row.name}` : row.name,
    subtitle: [row.status, row.location].filter(Boolean).join(' · ') || null,
    href: `${hrefBase}/${row.id}`,
    status: row.status,
  }));
}

export async function searchClients(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({ id: clients.id, name: clients.name, status: clients.status })
    .from(clients)
    .where(
      and(
        eq(clients.organizationId, organizationId),
        isNull(clients.archivedAt),
        or(
          ilike(clients.name, term),
          ilike(clients.legalName, term),
          existsSearchableCustomFieldValueSql(organizationId, 'client', clients.id, term),
        )!,
      ),
    )
    .orderBy(clients.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'client' as const,
    id: row.id,
    title: row.name,
    subtitle: row.status,
    href: `/clients/${row.id}`,
  }));
}

export async function searchContacts(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: clientContacts.id,
      name: clientContacts.name,
      email: clientContacts.email,
      phone: clientContacts.phone,
      clientId: clientContacts.clientId,
      clientName: clients.name,
    })
    .from(clientContacts)
    .innerJoin(
      clients,
      and(eq(clientContacts.clientId, clients.id), eq(clients.organizationId, organizationId)),
    )
    .where(
      and(
        eq(clientContacts.organizationId, organizationId),
        or(
          ilike(clientContacts.name, term),
          ilike(clientContacts.email, term),
          ilike(clientContacts.phone, term),
        )!,
      ),
    )
    .orderBy(clientContacts.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'contact' as const,
    id: row.id,
    title: row.name,
    subtitle: [row.clientName, row.email ?? row.phone].filter(Boolean).join(' · ') || null,
    href: `/clients/${row.clientId}`,
  }));
}

export async function searchEmployees(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      employeeNumber: employees.employeeNumber,
    })
    .from(employees)
    .where(
      and(
        eq(employees.organizationId, organizationId),
        isNull(employees.archivedAt),
        or(
          ilike(employees.name, term),
          ilike(employees.email, term),
          ilike(employees.employeeNumber, term),
          ilike(employees.jobTitle, term),
          existsSearchableCustomFieldValueSql(organizationId, 'employee', employees.id, term),
        )!,
      ),
    )
    .orderBy(employees.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'employee' as const,
    id: row.id,
    title: row.name,
    subtitle: [row.jobTitle, row.employeeNumber].filter(Boolean).join(' · ') || null,
    href: `/workforce/employees/${row.id}`,
  }));
}

export async function searchVendors(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({ id: vendors.id, name: vendors.name, status: vendors.status })
    .from(vendors)
    .where(
      and(
        eq(vendors.organizationId, organizationId),
        isNull(vendors.archivedAt),
        or(
          ilike(vendors.name, term),
          ilike(vendors.email, term),
          existsSearchableCustomFieldValueSql(organizationId, 'vendor', vendors.id, term),
        )!,
      ),
    )
    .orderBy(vendors.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'vendor' as const,
    id: row.id,
    title: row.name,
    subtitle: row.status,
    href: `/vendors/${row.id}`,
  }));
}

export async function searchApBills(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: apBills.id,
      reference: apBills.reference,
      status: apBills.status,
      vendorName: vendors.name,
      projectId: apBills.projectId,
      billDate: apBills.billDate,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .innerJoin(vendors, and(eq(apBills.vendorId, vendors.id), eq(vendors.organizationId, organizationId)))
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        isNull(apBills.archivedAt),
        sql`${apBills.status} <> 'void'`,
        or(sql`${apBills.projectId} is null`, projectAccessSql(apBills.projectId, accessibleProjectIds)),
        or(ilike(apBills.reference, term), ilike(vendors.name, term))!,
      ),
    )
    .orderBy(apBills.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'bill' as const,
    id: row.id,
    title: row.reference?.trim() || row.vendorName,
    subtitle: [row.vendorName, row.status].filter(Boolean).join(' · ') || null,
    href: `/procurement/ap/${row.id}`,
    status: row.status,
    contextLabel: row.vendorName,
    date: row.billDate,
    ...moneyContext(true, row.totalAmount, row.currency),
  }));
}

export async function searchBillingRecords(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: billingRecords.id,
      reference: billingRecords.reference,
      status: billingRecords.status,
      kind: billingRecords.kind,
      issueDate: billingRecords.issueDate,
      totalAmount: billingRecords.totalAmount,
      currency: billingRecords.currency,
      projectId: billingRecords.projectId,
    })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        sql`${billingRecords.status} <> 'void'`,
        or(
          sql`${billingRecords.projectId} is null`,
          projectAccessSql(billingRecords.projectId, accessibleProjectIds),
        ),
        ilike(billingRecords.reference, term),
      ),
    )
    .orderBy(billingRecords.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'billing' as const,
    id: row.id,
    title: row.reference?.trim() || row.kind,
    subtitle: [row.kind, row.status].join(' · '),
    href: `/billing/${row.id}`,
    status: row.status,
    date: row.issueDate,
    ...moneyContext(true, row.totalAmount, row.currency),
  }));
}

export async function searchDocuments(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  options: {
    includeCompensation?: boolean;
    accessibleProjectIds?: string[] | null;
  } = {},
): Promise<GlobalSearchHit[]> {
  const rows = await listAllDocuments(db, organizationId, {
    search: query,
    limit,
    includeCompensation: options.includeCompensation === true,
    accessibleProjectIds: options.accessibleProjectIds ?? null,
  });

  return rows.map((row) => ({
    kind: 'document' as const,
    id: row.id,
    title: row.originalFilename,
    subtitle: row.category || row.mimeType,
    href: `/documents?q=${encodeURIComponent(query)}`,
  }));
}

export async function searchAssets(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: assets.id,
      name: assets.name,
      identifier: assets.identifier,
      status: assets.status,
      assetKind: assets.assetKind,
    })
    .from(assets)
    .where(
      and(
        eq(assets.organizationId, organizationId),
        isNull(assets.archivedAt),
        or(
          ilike(assets.name, term),
          ilike(assets.identifier, term),
          ilike(assets.serialNumber, term),
          ilike(assets.model, term),
        )!,
      ),
    )
    .orderBy(assets.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'asset' as const,
    id: row.id,
    title: row.name,
    subtitle: [row.assetKind, row.identifier, row.status].filter(Boolean).join(' · ') || null,
    href: assetSearchHref(row.id),
  }));
}

export async function searchInventoryItems(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: inventoryItems.id,
      name: inventoryItems.name,
      sku: inventoryItems.sku,
      barcode: inventoryItems.barcode,
      unit: inventoryItems.unit,
    })
    .from(inventoryItems)
    .where(
      and(
        eq(inventoryItems.organizationId, organizationId),
        isNull(inventoryItems.archivedAt),
        or(
          ilike(inventoryItems.name, term),
          ilike(inventoryItems.sku, term),
          ilike(inventoryItems.barcode, term),
        )!,
      ),
    )
    .orderBy(inventoryItems.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'inventory_item' as const,
    id: row.id,
    title: row.name,
    subtitle: [row.sku, row.barcode, row.unit].filter(Boolean).join(' · ') || null,
    href: inventoryItemSearchHref(row.id),
  }));
}

/**
 * Materials catalog (name/SKU only - never default price / Actual).
 */
export async function searchMaterials(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: materialItems.id,
      name: materialItems.name,
      sku: materialItems.sku,
      unit: materialItems.unit,
    })
    .from(materialItems)
    .where(
      and(
        eq(materialItems.organizationId, organizationId),
        isNull(materialItems.archivedAt),
        or(ilike(materialItems.name, term), ilike(materialItems.sku, term))!,
      ),
    )
    .orderBy(materialItems.name)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'material' as const,
    id: row.id,
    title: row.name,
    subtitle: [row.sku, row.unit].filter(Boolean).join(' · ') || null,
    href: materialSearchHref(row.id),
  }));
}

/**
 * BOQ item codes / descriptions. Permission-gated by caller (boq.read).
 * Never returns unit prices, contract amounts, or Actual figures.
 */
export async function searchBoqItems(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: boqNodes.id,
      itemCode: boqNodes.itemCode,
      description: boqNodes.description,
      projectId: projectBoqs.projectId,
      projectName: projects.name,
    })
    .from(boqNodes)
    .innerJoin(projectBoqs, eq(projectBoqs.id, boqNodes.boqId))
    .innerJoin(projects, eq(projects.id, projectBoqs.projectId))
    .where(
      and(
        eq(boqNodes.organizationId, organizationId),
        eq(boqNodes.nodeKind, 'item'),
        isNull(boqNodes.archivedAt),
        isNull(projectBoqs.archivedAt),
        projectAccessSql(projectBoqs.projectId, accessibleProjectIds),
        or(ilike(boqNodes.itemCode, term), ilike(boqNodes.description, term))!,
      ),
    )
    .orderBy(boqNodes.itemCode)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'boq_item' as const,
    id: row.id,
    title: row.itemCode ? `${row.itemCode} · ${row.description}` : row.description,
    subtitle: row.projectName,
    href: `/projects/${row.projectId}?tab=boq`,
    contextLabel: row.projectName,
  }));
}

export async function searchExpenses(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      supplierName: expenses.supplierName,
      status: expenses.status,
      expenseDate: expenses.expenseDate,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      projectId: expenses.projectId,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        isNull(expenses.archivedAt),
        sql`${expenses.status} <> 'void'`,
        or(sql`${expenses.projectId} is null`, projectAccessSql(expenses.projectId, accessibleProjectIds)),
        or(ilike(expenses.description, term), ilike(expenses.supplierName, term), ilike(expenses.notes, term))!,
      ),
    )
    .orderBy(expenses.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'expense' as const,
    id: row.id,
    title: row.description?.trim() || row.supplierName || 'Expense',
    subtitle: [row.supplierName, row.status].filter(Boolean).join(' · ') || null,
    href: `/expenses/${row.id}`,
    status: row.status,
    contextLabel: row.supplierName,
    date: row.expenseDate ? String(row.expenseDate) : null,
    ...moneyContext(true, row.grossAmount, row.currency),
  }));
}

export async function searchQuotes(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: estimates.id,
      title: estimates.title,
      status: estimates.status,
      totalAmount: estimates.totalAmount,
      currency: estimates.currency,
      clientName: clients.name,
    })
    .from(estimates)
    .leftJoin(clients, and(eq(estimates.clientId, clients.id), eq(clients.organizationId, organizationId)))
    .where(
      and(
        eq(estimates.organizationId, organizationId),
        isNull(estimates.archivedAt),
        or(ilike(estimates.title, term), ilike(clients.name, term))!,
      ),
    )
    .orderBy(estimates.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'quote' as const,
    id: row.id,
    title: row.title,
    subtitle: [row.clientName, row.status].filter(Boolean).join(' · ') || null,
    href: `/quotes/${row.id}`,
    status: row.status,
    contextLabel: row.clientName,
    ...moneyContext(true, row.totalAmount, row.currency),
  }));
}

export async function searchOpportunities(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: crmOpportunities.id,
      name: crmOpportunities.name,
      status: crmOpportunities.status,
      stage: crmOpportunities.stage,
      expectedValueAmount: crmOpportunities.expectedValueAmount,
      currency: crmOpportunities.currency,
    })
    .from(crmOpportunities)
    .where(
      and(
        eq(crmOpportunities.organizationId, organizationId),
        isNull(crmOpportunities.archivedAt),
        ilike(crmOpportunities.name, term),
      ),
    )
    .orderBy(crmOpportunities.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'opportunity' as const,
    id: row.id,
    title: row.name,
    subtitle: [row.stage, row.status].filter(Boolean).join(' · ') || null,
    href: `/crm/opportunities/${row.id}`,
    status: row.status,
    ...moneyContext(true, row.expectedValueAmount, row.currency),
  }));
}

export async function searchContracts(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: contracts.id,
      name: contracts.name,
      contractNumber: contracts.contractNumber,
      reference: contracts.reference,
      status: contracts.status,
      projectId: contracts.projectId,
      projectName: projects.name,
    })
    .from(contracts)
    .innerJoin(projects, and(eq(contracts.projectId, projects.id), eq(projects.organizationId, organizationId)))
    .where(
      and(
        eq(contracts.organizationId, organizationId),
        isNull(contracts.archivedAt),
        projectAccessSql(contracts.projectId, accessibleProjectIds),
        or(
          ilike(contracts.name, term),
          ilike(contracts.contractNumber, term),
          ilike(contracts.reference, term),
          ilike(projects.name, term),
        )!,
      ),
    )
    .orderBy(contracts.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'contract' as const,
    id: row.id,
    title: row.contractNumber || row.name || row.reference || row.projectName,
    subtitle: [row.projectName, row.status].filter(Boolean).join(' · ') || null,
    href: `/projects/${row.projectId}?tab=contracts`,
    status: row.status,
    contextLabel: row.projectName,
  }));
}

export async function searchPurchaseOrders(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      status: purchaseOrders.status,
      vendorName: vendors.name,
      projectId: purchaseOrders.projectId,
      orderedOn: purchaseOrders.orderedOn,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, and(eq(purchaseOrders.vendorId, vendors.id), eq(vendors.organizationId, organizationId)))
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        isNull(purchaseOrders.archivedAt),
        or(
          sql`${purchaseOrders.projectId} is null`,
          projectAccessSql(purchaseOrders.projectId, accessibleProjectIds),
        ),
        or(ilike(purchaseOrders.reference, term), ilike(vendors.name, term))!,
      ),
    )
    .orderBy(purchaseOrders.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'purchase_order' as const,
    id: row.id,
    title: row.reference?.trim() || row.vendorName,
    subtitle: [row.vendorName, row.status].filter(Boolean).join(' · ') || null,
    href: `/procurement/${row.id}`,
    status: row.status,
    contextLabel: row.vendorName,
    date: row.orderedOn,
  }));
}

export async function searchSubcontracts(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: subcontractAgreements.id,
      title: subcontractAgreements.title,
      subcontractNumber: subcontractAgreements.subcontractNumber,
      status: subcontractAgreements.status,
      vendorId: subcontractAgreements.vendorId,
      vendorName: vendors.name,
      projectId: subcontractAgreements.projectId,
      projectName: projects.name,
    })
    .from(subcontractAgreements)
    .innerJoin(
      vendors,
      and(eq(subcontractAgreements.vendorId, vendors.id), eq(vendors.organizationId, organizationId)),
    )
    .innerJoin(
      projects,
      and(eq(subcontractAgreements.projectId, projects.id), eq(projects.organizationId, organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
        projectAccessSql(subcontractAgreements.projectId, accessibleProjectIds),
        or(
          ilike(subcontractAgreements.title, term),
          ilike(subcontractAgreements.subcontractNumber, term),
          ilike(vendors.name, term),
        )!,
      ),
    )
    .orderBy(subcontractAgreements.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'subcontract' as const,
    id: row.id,
    title: row.subcontractNumber ? `${row.subcontractNumber} · ${row.title}` : row.title,
    subtitle: [row.vendorName, row.projectName, row.status].filter(Boolean).join(' · ') || null,
    href: `/vendors/${row.vendorId}`,
    status: row.status,
    contextLabel: row.projectName,
  }));
}

export async function searchVendorCredits(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: apVendorCredits.id,
      reference: apVendorCredits.reference,
      status: apVendorCredits.status,
      vendorName: vendors.name,
      projectId: apVendorCredits.projectId,
      creditDate: apVendorCredits.creditDate,
      grossAmount: apVendorCredits.grossAmount,
      currency: apVendorCredits.currency,
    })
    .from(apVendorCredits)
    .innerJoin(
      vendors,
      and(eq(apVendorCredits.vendorId, vendors.id), eq(vendors.organizationId, organizationId)),
    )
    .where(
      and(
        eq(apVendorCredits.organizationId, organizationId),
        isNull(apVendorCredits.archivedAt),
        sql`${apVendorCredits.status} <> 'void'`,
        or(
          sql`${apVendorCredits.projectId} is null`,
          projectAccessSql(apVendorCredits.projectId, accessibleProjectIds),
        ),
        or(ilike(apVendorCredits.reference, term), ilike(vendors.name, term))!,
      ),
    )
    .orderBy(apVendorCredits.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'vendor_credit' as const,
    id: row.id,
    title: row.reference?.trim() || row.vendorName,
    subtitle: [row.vendorName, row.status].filter(Boolean).join(' · ') || null,
    href: `/procurement/ap/credits/${row.id}`,
    status: row.status,
    date: row.creditDate,
    ...moneyContext(true, row.grossAmount, row.currency),
  }));
}

export async function searchDailyLogs(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: dailyLogs.id,
      summary: dailyLogs.summary,
      logDate: dailyLogs.logDate,
      status: dailyLogs.status,
      projectId: dailyLogs.projectId,
      projectName: projects.name,
    })
    .from(dailyLogs)
    .innerJoin(projects, and(eq(dailyLogs.projectId, projects.id), eq(projects.organizationId, organizationId)))
    .where(
      and(
        eq(dailyLogs.organizationId, organizationId),
        isNull(dailyLogs.archivedAt),
        projectAccessSql(dailyLogs.projectId, accessibleProjectIds),
        or(ilike(dailyLogs.summary, term), ilike(dailyLogs.workPerformed, term), ilike(projects.name, term))!,
      ),
    )
    .orderBy(dailyLogs.logDate)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'daily_log' as const,
    id: row.id,
    title: row.summary,
    subtitle: [row.projectName, row.logDate, row.status].filter(Boolean).join(' · ') || null,
    href: `/field-ops/logs/${row.id}`,
    status: row.status,
    contextLabel: row.projectName,
    date: row.logDate,
  }));
}

export async function searchPunchItems(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: punchListItems.id,
      title: punchListItems.title,
      status: punchListItems.status,
      projectId: punchListItems.projectId,
      projectName: projects.name,
      dueDate: punchListItems.dueDate,
    })
    .from(punchListItems)
    .innerJoin(
      projects,
      and(eq(punchListItems.projectId, projects.id), eq(projects.organizationId, organizationId)),
    )
    .where(
      and(
        eq(punchListItems.organizationId, organizationId),
        isNull(punchListItems.archivedAt),
        projectAccessSql(punchListItems.projectId, accessibleProjectIds),
        or(ilike(punchListItems.title, term), ilike(punchListItems.description, term))!,
      ),
    )
    .orderBy(punchListItems.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'punch' as const,
    id: row.id,
    title: row.title,
    subtitle: [row.projectName, row.status].filter(Boolean).join(' · ') || null,
    href: `/field-ops/punch/${row.id}`,
    status: row.status,
    contextLabel: row.projectName,
    date: row.dueDate,
  }));
}

export async function searchInspections(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: inspections.id,
      title: inspections.title,
      status: inspections.status,
      projectId: inspections.projectId,
      projectName: projects.name,
      scheduledOn: inspections.scheduledOn,
    })
    .from(inspections)
    .innerJoin(projects, and(eq(inspections.projectId, projects.id), eq(projects.organizationId, organizationId)))
    .where(
      and(
        eq(inspections.organizationId, organizationId),
        isNull(inspections.archivedAt),
        projectAccessSql(inspections.projectId, accessibleProjectIds),
        ilike(inspections.title, term),
      ),
    )
    .orderBy(inspections.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'inspection' as const,
    id: row.id,
    title: row.title,
    subtitle: [row.projectName, row.status].filter(Boolean).join(' · ') || null,
    href: `/field-ops/inspections/${row.id}`,
    status: row.status,
    contextLabel: row.projectName,
    date: row.scheduledOn,
  }));
}

export async function searchSafetyRecords(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: safetyRecords.id,
      title: safetyRecords.title,
      status: safetyRecords.status,
      recordType: safetyRecords.recordType,
      projectId: safetyRecords.projectId,
    })
    .from(safetyRecords)
    .where(
      and(
        eq(safetyRecords.organizationId, organizationId),
        isNull(safetyRecords.archivedAt),
        or(
          sql`${safetyRecords.projectId} is null`,
          projectAccessSql(safetyRecords.projectId, accessibleProjectIds),
        ),
        or(ilike(safetyRecords.title, term), ilike(safetyRecords.description, term))!,
      ),
    )
    .orderBy(safetyRecords.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'safety' as const,
    id: row.id,
    title: row.title,
    subtitle: [row.recordType, row.status].filter(Boolean).join(' · ') || null,
    href: `/safety/${row.id}`,
    status: row.status,
  }));
}

export async function searchWarrantyCoverages(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: warrantyCoverages.id,
        title: warrantyCoverages.title,
        status: warrantyCoverages.status,
        endDate: warrantyCoverages.endDate,
        projectId: warrantyCoverages.projectId,
        projectName: projects.name,
      })
      .from(warrantyCoverages)
      .innerJoin(
        projects,
        and(
          eq(projects.id, warrantyCoverages.projectId),
          eq(projects.organizationId, warrantyCoverages.organizationId),
        ),
      )
      .where(
        and(
          eq(warrantyCoverages.organizationId, organizationId),
          isNull(warrantyCoverages.archivedAt),
          projectAccessSql(warrantyCoverages.projectId, accessibleProjectIds),
          or(ilike(warrantyCoverages.title, term), ilike(projects.name, term))!,
        ),
      )
      .orderBy(warrantyCoverages.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'warranty' as const,
      id: row.id,
      title: row.title,
      subtitle: [row.projectName, row.status, row.endDate].filter(Boolean).join(' · ') || null,
      href: warrantySearchHref(row.id, row.projectId),
      status: row.status,
      contextLabel: row.projectName,
      date: row.endDate,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchCommunications(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: outboundCommunications.id,
        subject: outboundCommunications.subject,
        status: outboundCommunications.status,
        recipientName: outboundCommunications.recipientName,
        recipientEmail: outboundCommunications.recipientEmail,
        projectId: outboundCommunications.projectId,
      })
      .from(outboundCommunications)
      .where(
        and(
          eq(outboundCommunications.organizationId, organizationId),
          isNull(outboundCommunications.archivedAt),
          or(
            sql`${outboundCommunications.projectId} is null`,
            projectAccessSql(outboundCommunications.projectId, accessibleProjectIds),
          ),
          or(
            ilike(outboundCommunications.subject, term),
            ilike(outboundCommunications.recipientName, term),
            ilike(outboundCommunications.recipientEmail, term),
          )!,
        ),
      )
      .orderBy(outboundCommunications.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'communication' as const,
      id: row.id,
      title: row.subject,
      subtitle: [row.recipientName ?? row.recipientEmail, row.status].filter(Boolean).join(' · ') || null,
      href: communicationSearchHref(row.id),
      status: row.status,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchCalendarEvents(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: calendarEvents.id,
        title: calendarEvents.title,
        eventKind: calendarEvents.eventKind,
        eventDate: calendarEvents.eventDate,
        projectId: calendarEvents.projectId,
      })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.organizationId, organizationId),
          isNull(calendarEvents.archivedAt),
          or(
            sql`${calendarEvents.projectId} is null`,
            projectAccessSql(calendarEvents.projectId, accessibleProjectIds),
          ),
          or(ilike(calendarEvents.title, term), ilike(calendarEvents.notes, term))!,
        ),
      )
      .orderBy(calendarEvents.eventDate)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'calendar_event' as const,
      id: row.id,
      title: row.title,
      subtitle: [row.eventKind, row.eventDate].filter(Boolean).join(' · ') || null,
      href: calendarEventSearchHref(row.id),
      date: row.eventDate,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchCloseouts(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: projectCloseouts.id,
        status: projectCloseouts.status,
        projectId: projectCloseouts.projectId,
        projectName: projects.name,
      })
      .from(projectCloseouts)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectCloseouts.projectId),
          eq(projects.organizationId, projectCloseouts.organizationId),
        ),
      )
      .where(
        and(
          eq(projectCloseouts.organizationId, organizationId),
          eq(projects.workKind, 'project'),
          isNull(projects.archivedAt),
          projectAccessSql(projectCloseouts.projectId, accessibleProjectIds),
          or(ilike(projects.name, term), ilike(projects.documentNumber, term))!,
        ),
      )
      .orderBy(projectCloseouts.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'closeout' as const,
      id: row.id,
      title: row.projectName,
      subtitle: row.status,
      href: closeoutSearchHref(row.projectId),
      status: row.status,
      contextLabel: row.projectName,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchBillingPlans(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: projectBillingPlans.id,
        name: projectBillingPlans.name,
        status: projectBillingPlans.status,
        projectId: projectBillingPlans.projectId,
        projectName: projects.name,
        currency: projectBillingPlans.currency,
      })
      .from(projectBillingPlans)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectBillingPlans.projectId),
          eq(projects.organizationId, projectBillingPlans.organizationId),
        ),
      )
      .where(
        and(
          eq(projectBillingPlans.organizationId, organizationId),
          isNull(projectBillingPlans.archivedAt),
          sql`${projectBillingPlans.status} <> 'archived'`,
          isNull(projects.archivedAt),
          projectAccessSql(projectBillingPlans.projectId, accessibleProjectIds),
          or(ilike(projectBillingPlans.name, term), ilike(projects.name, term))!,
        ),
      )
      .orderBy(projectBillingPlans.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'billing_plan' as const,
      id: row.id,
      title: row.name,
      subtitle: [row.projectName, row.status].filter(Boolean).join(' · ') || null,
      href: billingPlanSearchHref(row.projectId, row.id),
      status: row.status,
      contextLabel: row.projectName,
      currency: row.currency,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchBillingCycles(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
  accessibleProjectIds: string[] | null = null,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: projectBillingCycles.id,
        title: projectBillingCycles.title,
        status: projectBillingCycles.status,
        cycleNumber: projectBillingCycles.cycleNumber,
        accountDate: projectBillingCycles.accountDate,
        projectId: projectBillingCycles.projectId,
        projectName: projects.name,
        planName: projectBillingPlans.name,
      })
      .from(projectBillingCycles)
      .innerJoin(
        projectBillingPlans,
        and(
          eq(projectBillingPlans.id, projectBillingCycles.planId),
          eq(projectBillingPlans.organizationId, projectBillingCycles.organizationId),
        ),
      )
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectBillingCycles.projectId),
          eq(projects.organizationId, projectBillingCycles.organizationId),
        ),
      )
      .where(
        and(
          eq(projectBillingCycles.organizationId, organizationId),
          inArray(projectBillingCycles.status, [
            'draft',
            'ready',
            'submitted',
            'partially_approved',
            'approved',
          ]),
          isNull(projects.archivedAt),
          projectAccessSql(projectBillingCycles.projectId, accessibleProjectIds),
          or(
            ilike(projectBillingCycles.title, term),
            ilike(projectBillingPlans.name, term),
            ilike(projects.name, term),
            sql`cast(${projectBillingCycles.cycleNumber} as text) ilike ${term}`,
          )!,
        ),
      )
      .orderBy(projectBillingCycles.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'billing_cycle' as const,
      id: row.id,
      title: row.title?.trim() || `#${row.cycleNumber}`,
      subtitle: [row.planName, row.status, `#${row.cycleNumber}`].filter(Boolean).join(' · ') || null,
      href: billingCycleSearchHref(row.projectId, row.id),
      status: row.status,
      contextLabel: row.projectName,
      date: row.accountDate,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchRecurringDrafts(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: recurringFinancialDrafts.id,
        title: recurringFinancialDrafts.title,
        draftKind: recurringFinancialDrafts.draftKind,
        status: recurringFinancialDrafts.status,
        nextRunDate: recurringFinancialDrafts.nextRunDate,
      })
      .from(recurringFinancialDrafts)
      .where(
        and(
          eq(recurringFinancialDrafts.organizationId, organizationId),
          isNull(recurringFinancialDrafts.archivedAt),
          ilike(recurringFinancialDrafts.title, term),
        ),
      )
      .orderBy(recurringFinancialDrafts.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'recurring_draft' as const,
      id: row.id,
      title: row.title,
      subtitle: [row.draftKind, row.status, row.nextRunDate].filter(Boolean).join(' · ') || null,
      href: `/recurring-drafts/${row.id}`,
      status: row.status,
      date: row.nextRunDate,
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function searchApprovalRequests(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  try {
    const rows = await db
      .select({
        id: approvalRequests.id,
        entityType: approvalRequests.entityType,
        entityId: approvalRequests.entityId,
        status: approvalRequests.status,
        amount: approvalRequests.amount,
        currency: approvalRequests.currency,
      })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.organizationId, organizationId),
          or(
            ilike(approvalRequests.entityType, term),
            ilike(approvalRequests.status, term),
          )!,
        ),
      )
      .orderBy(approvalRequests.updatedAt)
      .limit(limit);

    return rows.map((row) => ({
      kind: 'approval' as const,
      id: row.id,
      title: row.entityType,
      subtitle: row.entityId,
      href: '/approvals',
      status: row.status,
      ...moneyContext(true, row.amount, row.currency),
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}
