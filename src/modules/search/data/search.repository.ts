import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  apBills,
  assets,
  billingRecords,
  boqNodes,
  clientContacts,
  clients,
  documents,
  employees,
  projectBoqs,
  projects,
  vendors,
} from '@drizzle/schema';
import { existsSearchableCustomFieldValueSql } from '@/modules/custom-fields';
import type { DbExecutor } from '@/shared/db/types';
import type { GlobalSearchHit } from '../domain/types';

function likeTerm(query: string): string {
  return `%${query.replace(/[%_]/g, ' ').trim()}%`;
}

export async function searchProjectsByWorkKind(
  db: DbExecutor,
  organizationId: string,
  query: string,
  workKind: 'project' | 'job' | 'work_order',
  limit: number,
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
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.workKind, workKind),
        isNull(projects.archivedAt),
        or(
          ilike(projects.name, term),
          ilike(projects.location, term),
          existsSearchableCustomFieldValueSql(organizationId, 'project', projects.id, term),
        )!,
      ),
    )
    .orderBy(projects.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind,
    id: row.id,
    title: row.name,
    subtitle: [row.status, row.location].filter(Boolean).join(' · ') || null,
    href: `${hrefBase}/${row.id}`,
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
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: apBills.id,
      reference: apBills.reference,
      status: apBills.status,
      vendorName: vendors.name,
    })
    .from(apBills)
    .innerJoin(vendors, and(eq(apBills.vendorId, vendors.id), eq(vendors.organizationId, organizationId)))
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        isNull(apBills.archivedAt),
        sql`${apBills.status} <> 'void'`,
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
  }));
}

export async function searchBillingRecords(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: billingRecords.id,
      reference: billingRecords.reference,
      status: billingRecords.status,
      kind: billingRecords.kind,
    })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        sql`${billingRecords.status} <> 'void'`,
        ilike(billingRecords.reference, term),
      ),
    )
    .orderBy(billingRecords.updatedAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'billing' as const,
    id: row.id,
    title: row.reference?.trim() || row.id.slice(0, 8),
    subtitle: [row.kind, row.status].join(' · '),
    href: `/billing/${row.id}`,
  }));
}

export async function searchDocuments(
  db: DbExecutor,
  organizationId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchHit[]> {
  const term = likeTerm(query);
  const rows = await db
    .select({
      id: documents.id,
      filename: documents.originalFilename,
      mimeType: documents.mimeType,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, organizationId),
        isNull(documents.deletedAt),
        sql`${documents.status} <> 'deleted'`,
        ilike(documents.originalFilename, term),
      ),
    )
    .orderBy(documents.createdAt)
    .limit(limit);

  return rows.map((row) => ({
    kind: 'document' as const,
    id: row.id,
    title: row.filename,
    subtitle: row.mimeType,
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
    href: `/assets/inventory`,
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
  }));
}
