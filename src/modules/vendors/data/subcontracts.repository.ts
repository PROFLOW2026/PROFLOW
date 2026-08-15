/**
 * Subcontract agreements persistence.
 *
 * Paid/outstanding reads `ap_bills` tagged with this agreement's id
 * (`subcontract_agreement_id`). Two agreements on the same vendor+project
 * never share billed / paid / outstanding. AP public `getVendorApOutstanding`
 * can apply the same agreement filter. Never posts or drafts AP.
 *
 * Documents use `document_links` with owner_type `subcontract_agreement`
 * via the canonical documents linker.
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  apBills,
  apPaymentApplications,
  apPayments,
  contracts,
  documentLinks,
  documents,
  projects,
  subcontractAgreements,
  subcontractValueEvents,
  vendors,
} from '@drizzle/schema';
import { addMoney, money, zeroMoney } from '@/shared/money';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  SubcontractAgreementRecord,
  SubcontractApBillCashRow,
  SubcontractLinkedDocument,
  SubcontractListItem,
  SubcontractParentContractOption,
  SubcontractStatus,
  SubcontractValueEventKind,
  SubcontractValueEventRecord,
} from '../domain/subcontract-types';
import { computeSubcontractCashPosition } from '../domain/subcontract-cash';
import { computeCurrentSubcontractValue } from '../domain/subcontract-value';

function mapAgreement(row: typeof subcontractAgreements.$inferSelect): SubcontractAgreementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subcontractNumber: row.subcontractNumber,
    vendorId: row.vendorId,
    projectId: row.projectId,
    parentContractId: row.parentContractId,
    title: row.title,
    status: row.status as SubcontractStatus,
    originalAmount: row.originalAmount,
    currency: row.currency,
    retentionPercent: row.retentionPercent,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEvent(row: typeof subcontractValueEvents.$inferSelect): SubcontractValueEventRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subcontractId: row.subcontractId,
    kind: row.kind as SubcontractValueEventKind,
    amount: row.amount,
    currency: row.currency,
    effectiveDate: row.effectiveDate,
    reason: row.reason,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertSubcontractAgreement(
  db: DbExecutor,
  input: {
    organizationId: string;
    subcontractNumber?: string | null;
    vendorId: string;
    projectId: string;
    parentContractId?: string | null;
    title: string;
    originalAmount: string;
    currency: string;
    retentionPercent?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
    createdByUserId: string | null;
  },
): Promise<SubcontractAgreementRecord> {
  const [row] = await db
    .insert(subcontractAgreements)
    .values({
      organizationId: input.organizationId,
      subcontractNumber: input.subcontractNumber ?? null,
      vendorId: input.vendorId,
      projectId: input.projectId,
      parentContractId: input.parentContractId ?? null,
      title: input.title,
      status: 'draft',
      originalAmount: input.originalAmount,
      currency: input.currency,
      retentionPercent: input.retentionPercent ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId,
    })
    .returning();

  return mapAgreement(row!);
}

export async function insertSubcontractValueEvent(
  db: DbExecutor,
  input: {
    organizationId: string;
    subcontractId: string;
    kind: SubcontractValueEventKind;
    amount: string;
    currency: string;
    effectiveDate: string;
    reason?: string | null;
    actorUserId: string | null;
  },
): Promise<SubcontractValueEventRecord> {
  const [row] = await db
    .insert(subcontractValueEvents)
    .values({
      organizationId: input.organizationId,
      subcontractId: input.subcontractId,
      kind: input.kind,
      amount: input.amount,
      currency: input.currency,
      effectiveDate: input.effectiveDate,
      reason: input.reason ?? null,
      actorUserId: input.actorUserId,
    })
    .returning();

  return mapEvent(row!);
}

export async function findSubcontractAgreementById(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementRecord | null> {
  const [row] = await db
    .select()
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.id, subcontractId),
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapAgreement(row) : null;
}

export async function findSubcontractAgreementByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementRecord | null> {
  const [row] = await db
    .select()
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.id, subcontractId),
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .for('update')
    .limit(1);

  return row ? mapAgreement(row) : null;
}

export async function updateSubcontractAgreementById(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
  patch: Partial<{
    subcontractNumber: string | null;
    vendorId: string;
    projectId: string;
    parentContractId: string | null;
    title: string;
    status: SubcontractStatus;
    retentionPercent: string | null;
    startDate: string | null;
    endDate: string | null;
    notes: string | null;
  }>,
  options?: { readonly fromStatuses?: readonly SubcontractStatus[] },
): Promise<SubcontractAgreementRecord | null> {
  const conditions = [
    eq(subcontractAgreements.id, subcontractId),
    eq(subcontractAgreements.organizationId, organizationId),
  ];
  if (options?.fromStatuses && options.fromStatuses.length > 0) {
    conditions.push(inArray(subcontractAgreements.status, [...options.fromStatuses]));
  }

  const [row] = await db
    .update(subcontractAgreements)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(...conditions))
    .returning();

  return row ? mapAgreement(row) : null;
}

export async function listSubcontractValueEvents(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractValueEventRecord[]> {
  const rows = await db
    .select()
    .from(subcontractValueEvents)
    .where(
      and(
        eq(subcontractValueEvents.organizationId, organizationId),
        eq(subcontractValueEvents.subcontractId, subcontractId),
      ),
    )
    .orderBy(subcontractValueEvents.effectiveDate, subcontractValueEvents.createdAt);

  return rows.map(mapEvent);
}

async function listAgreements(
  db: DbExecutor,
  organizationId: string,
  filters: { vendorId?: string; projectId?: string },
): Promise<SubcontractListItem[]> {
  const conditions = [
    eq(subcontractAgreements.organizationId, organizationId),
    isNull(subcontractAgreements.archivedAt),
  ];
  if (filters.vendorId) conditions.push(eq(subcontractAgreements.vendorId, filters.vendorId));
  if (filters.projectId) conditions.push(eq(subcontractAgreements.projectId, filters.projectId));

  const rows = await db
    .select({
      agreement: subcontractAgreements,
      vendorName: vendors.name,
      projectName: projects.name,
    })
    .from(subcontractAgreements)
    .innerJoin(vendors, eq(vendors.id, subcontractAgreements.vendorId))
    .innerJoin(projects, eq(projects.id, subcontractAgreements.projectId))
    .where(and(...conditions))
    .orderBy(desc(subcontractAgreements.createdAt))
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }));

  const items: SubcontractListItem[] = [];
  for (const row of rows) {
    const agreement = mapAgreement(row.agreement);
    const events = await listSubcontractValueEvents(db, organizationId, agreement.id);
    const current = computeCurrentSubcontractValue(events, agreement.currency);
    const cashRows = await listApBillCashForSubcontractAgreement(
      db,
      organizationId,
      agreement.id,
    );
    const cash = computeSubcontractCashPosition(cashRows, agreement.currency);
    items.push({
      ...agreement,
      vendorName: row.vendorName,
      projectName: row.projectName,
      currentAmount: current.amount,
      billedAmount: cash.billed,
      paidAmount: cash.paid,
      outstandingAmount: cash.outstanding,
    });
  }
  return items;
}

export async function listSubcontractsForVendor(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<SubcontractListItem[]> {
  return listAgreements(db, organizationId, { vendorId });
}

export async function listSubcontractsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<SubcontractListItem[]> {
  return listAgreements(db, organizationId, { projectId });
}

export async function findContractInOrg(
  db: DbExecutor,
  organizationId: string,
  contractId: string,
): Promise<{ id: string; organizationId: string; projectId: string; label: string } | null> {
  const [row] = await db
    .select({
      id: contracts.id,
      organizationId: contracts.organizationId,
      projectId: contracts.projectId,
      name: contracts.name,
      contractNumber: contracts.contractNumber,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.id, contractId),
        eq(contracts.organizationId, organizationId),
        isNull(contracts.archivedAt),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    label: row.name || row.contractNumber || row.id.slice(0, 8),
  };
}

export async function listParentContractOptions(
  db: DbExecutor,
  organizationId: string,
  projectId?: string,
): Promise<SubcontractParentContractOption[]> {
  const conditions = [eq(contracts.organizationId, organizationId), isNull(contracts.archivedAt)];
  if (projectId) conditions.push(eq(contracts.projectId, projectId));

  const rows = await db
    .select({
      id: contracts.id,
      projectId: contracts.projectId,
      name: contracts.name,
      contractNumber: contracts.contractNumber,
      isPrimary: contracts.isPrimary,
    })
    .from(contracts)
    .where(and(...conditions))
    .orderBy(contracts.isPrimary, contracts.createdAt)
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    label: row.name || row.contractNumber || (row.isPrimary ? 'Primary' : row.id.slice(0, 8)),
  }));
}

/**
 * Cash position inputs for one subcontract agreement. Read-only AP.
 * Filters `ap_bills.subcontract_agreement_id` so two agreements on the same
 * vendor+project do not share billed / paid / outstanding. Does not post AP.
 */
export async function listApBillCashForSubcontractAgreement(
  db: DbExecutor,
  organizationId: string,
  subcontractAgreementId: string,
): Promise<SubcontractApBillCashRow[]> {
  const bills = await db
    .select({
      id: apBills.id,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        eq(apBills.subcontractAgreementId, subcontractAgreementId),
        isNull(apBills.archivedAt),
      ),
    );

  if (bills.length === 0) return [];

  const billIds = bills.map((bill) => bill.id);
  const applications = await db
    .select({
      apBillId: apPaymentApplications.apBillId,
      appliedAmount: apPaymentApplications.appliedAmount,
      paymentStatus: apPayments.status,
    })
    .from(apPaymentApplications)
    .innerJoin(apPayments, eq(apPayments.id, apPaymentApplications.apPaymentId))
    .where(
      and(
        eq(apPaymentApplications.organizationId, organizationId),
        inArray(apPaymentApplications.apBillId, billIds),
      ),
    );

  const paidByBill = new Map<string, ReturnType<typeof zeroMoney>>();
  for (const application of applications) {
    if (application.paymentStatus !== 'recorded') continue;
    const bill = bills.find((row) => row.id === application.apBillId);
    if (!bill) continue;
    const current = paidByBill.get(application.apBillId) ?? zeroMoney(bill.currency);
    paidByBill.set(
      application.apBillId,
      addMoney(current, money(application.appliedAmount, bill.currency)),
    );
  }

  return bills.map((bill) => ({
    status: bill.status,
    totalAmount: bill.totalAmount,
    paidAmount: (paidByBill.get(bill.id) ?? zeroMoney(bill.currency)).amount,
    currency: bill.currency,
  }));
}

export async function listSubcontractLinkedDocuments(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractLinkedDocument[]> {
  const rows = await db
    .select({
      linkId: documentLinks.id,
      documentId: documents.id,
      originalFilename: documents.originalFilename,
      label: documentLinks.label,
      isRequired: documents.isRequired,
      requiredType: documents.requiredType,
      expiresAt: documents.expiresAt,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documents.id, documentLinks.documentId))
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documentLinks.ownerType, 'subcontract_agreement'),
        eq(documentLinks.ownerId, subcontractId),
        eq(documents.status, 'available'),
      ),
    )
    .orderBy(documents.originalFilename);

  return rows.map((row) => ({
    linkId: row.linkId,
    documentId: row.documentId,
    originalFilename: row.originalFilename,
    label: row.label,
    isRequired: row.isRequired,
    requiredType: row.requiredType,
    expiresAt: row.expiresAt,
  }));
}

export async function findDocumentInOrg(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<{ id: string; organizationId: string; status: string } | null> {
  const [row] = await db
    .select({
      id: documents.id,
      organizationId: documents.organizationId,
      status: documents.status,
    })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function insertSubcontractDocumentLink(
  db: DbExecutor,
  input: {
    organizationId: string;
    documentId: string;
    subcontractId: string;
    label?: string | null;
  },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(documentLinks)
    .values({
      organizationId: input.organizationId,
      documentId: input.documentId,
      ownerType: 'subcontract_agreement',
      ownerId: input.subcontractId,
      label: input.label ?? null,
    })
    .returning({ id: documentLinks.id });
  return { id: row!.id };
}

export async function updateDocumentRequirementFlags(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
  patch: {
    isRequired?: boolean;
    requiredType?: string | null;
    expiresAt?: string | null;
  },
): Promise<void> {
  await db
    .update(documents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)));
}

export async function listLinkableDocuments(
  db: DbExecutor,
  organizationId: string,
): Promise<{ id: string; originalFilename: string }[]> {
  const rows = await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, organizationId),
        eq(documents.status, 'available'),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(documents.originalFilename)
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }));

  return rows;
}
