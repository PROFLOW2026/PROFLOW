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

import { and, desc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { numeric, pgView, text, uuid } from 'drizzle-orm/pg-core';
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
import {
  toSubcontractOperationalView,
  type SubcontractAgreementHeaderRecord,
  type SubcontractAgreementMoney,
  type SubcontractAgreementOperationalRecord,
  type SubcontractOperationalView,
} from '../domain/subcontract-projections';
import { computeSubcontractCashPosition } from '../domain/subcontract-cash';
import { computeCurrentSubcontractValue } from '../domain/subcontract-value';
import {
  computeSubcontractAgreementRemaining,
} from '../domain/subcontract-commitment';
import {
  computeAdvanceOutstandingBalance,
  foldAdvanceCashIntoPaid,
} from '../domain/subcontract-advances';
import { listSubcontractAdvances } from './subcontract-advances.repository';
import { loadRecognizedActualForSubcontractAgreement } from '@/modules/financials';

/**
 * Security-barrier view (migration 0168). Header money is column-revoked on
 * `subcontract_agreements` for `authenticated`; rows appear here only when
 * `app.subcontract_money_visible` (or the external value scope) allows.
 */
const subcontractAgreementMoneySecure = pgView('subcontract_agreement_money_secure', {
  id: uuid('id').notNull(),
  organizationId: uuid('organization_id').notNull(),
  projectId: uuid('project_id').notNull(),
  vendorId: uuid('vendor_id').notNull(),
  currency: text('currency').notNull(),
  originalAmount: numeric('original_amount', { precision: 18, scale: 6 }).notNull(),
  retentionPercent: numeric('retention_percent', { precision: 9, scale: 6 }),
}).existing();

/** Agreement columns without money (no original_amount / retention_percent / currency). */
const OPERATIONAL_AGREEMENT_COLUMNS = {
  id: subcontractAgreements.id,
  organizationId: subcontractAgreements.organizationId,
  subcontractNumber: subcontractAgreements.subcontractNumber,
  vendorId: subcontractAgreements.vendorId,
  projectId: subcontractAgreements.projectId,
  parentContractId: subcontractAgreements.parentContractId,
  title: subcontractAgreements.title,
  status: subcontractAgreements.status,
  paymentTermId: subcontractAgreements.paymentTermId,
  startDate: subcontractAgreements.startDate,
  endDate: subcontractAgreements.endDate,
  notes: subcontractAgreements.notes,
  archivedAt: subcontractAgreements.archivedAt,
  createdByUserId: subcontractAgreements.createdByUserId,
  createdAt: subcontractAgreements.createdAt,
  updatedAt: subcontractAgreements.updatedAt,
};

/** Every column `authenticated` may still SELECT on `subcontract_agreements`. */
const HEADER_AGREEMENT_COLUMNS = {
  ...OPERATIONAL_AGREEMENT_COLUMNS,
  currency: subcontractAgreements.currency,
};

type OperationalAgreementRow = {
  [K in keyof typeof OPERATIONAL_AGREEMENT_COLUMNS]: (typeof subcontractAgreements.$inferSelect)[K];
};

type HeaderAgreementRow = OperationalAgreementRow & { currency: string };

function mapOperationalAgreement(row: OperationalAgreementRow): SubcontractAgreementOperationalRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subcontractNumber: row.subcontractNumber,
    vendorId: row.vendorId,
    projectId: row.projectId,
    parentContractId: row.parentContractId,
    title: row.title,
    status: row.status as SubcontractStatus,
    paymentTermId: row.paymentTermId ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapHeaderAgreement(row: HeaderAgreementRow): SubcontractAgreementHeaderRecord {
  return { ...mapOperationalAgreement(row), currency: row.currency };
}

export function withSubcontractAgreementMoney(
  header: SubcontractAgreementHeaderRecord,
  agreementMoney: Pick<SubcontractAgreementMoney, 'originalAmount' | 'retentionPercent'>,
): SubcontractAgreementRecord {
  return {
    ...header,
    originalAmount: agreementMoney.originalAmount,
    retentionPercent: agreementMoney.retentionPercent,
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
    paymentTermId?: string | null;
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
      paymentTermId: input.paymentTermId ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      notes: input.notes ?? null,
      createdByUserId: input.createdByUserId,
    })
    .returning(HEADER_AGREEMENT_COLUMNS);

  return withSubcontractAgreementMoney(mapHeaderAgreement(row!), {
    originalAmount: input.originalAmount,
    retentionPercent: input.retentionPercent ?? null,
  });
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

/** Agreement header (no `original_amount` / `retention_percent`). */
export async function findSubcontractAgreementById(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementHeaderRecord | null> {
  const [row] = await db
    .select(HEADER_AGREEMENT_COLUMNS)
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.id, subcontractId),
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapHeaderAgreement(row) : null;
}

/**
 * Header money from `subcontract_agreement_money_secure`. Null when the agreement does not
 * exist or the caller fails the DB money gate. Callers must already have passed the app gate.
 */
export async function findSubcontractAgreementMoneyById(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementMoney | null> {
  const byId = await listSubcontractAgreementMoney(db, organizationId, [subcontractId]);
  return byId.get(subcontractId) ?? null;
}

export async function listSubcontractAgreementMoney(
  db: DbExecutor,
  organizationId: string,
  subcontractIds: readonly string[],
): Promise<Map<string, SubcontractAgreementMoney>> {
  if (subcontractIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: subcontractAgreementMoneySecure.id,
      currency: subcontractAgreementMoneySecure.currency,
      originalAmount: subcontractAgreementMoneySecure.originalAmount,
      retentionPercent: subcontractAgreementMoneySecure.retentionPercent,
    })
    .from(subcontractAgreementMoneySecure)
    .where(
      and(
        eq(subcontractAgreementMoneySecure.organizationId, organizationId),
        inArray(subcontractAgreementMoneySecure.id, [...subcontractIds]),
      ),
    );
  return new Map(rows.map((row) => [row.id, row]));
}

/** Full agreement (header + money). Null when missing or money is not visible to the caller. */
export async function findSubcontractAgreementWithMoneyById(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementRecord | null> {
  const header = await findSubcontractAgreementById(db, organizationId, subcontractId);
  if (!header) return null;
  const agreementMoney = await findSubcontractAgreementMoneyById(db, organizationId, header.id);
  return agreementMoney ? withSubcontractAgreementMoney(header, agreementMoney) : null;
}

export async function findSubcontractAgreementByIdForUpdate(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementHeaderRecord | null> {
  const [row] = await db
    .select(HEADER_AGREEMENT_COLUMNS)
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

  return row ? mapHeaderAgreement(row) : null;
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
): Promise<SubcontractAgreementHeaderRecord | null> {
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
    .returning(HEADER_AGREEMENT_COLUMNS);

  return row ? mapHeaderAgreement(row) : null;
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

/** Operational read of one agreement: never selects money columns. */
export async function findSubcontractAgreementOperationalById(
  db: DbExecutor,
  organizationId: string,
  subcontractId: string,
): Promise<SubcontractAgreementOperationalRecord | null> {
  const [row] = await db
    .select(OPERATIONAL_AGREEMENT_COLUMNS)
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.id, subcontractId),
        eq(subcontractAgreements.organizationId, organizationId),
        isNull(subcontractAgreements.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapOperationalAgreement(row) : null;
}

export interface SubcontractListFilters {
  vendorId?: string;
  projectId?: string;
  status?: string;
  limit?: number;
  /** Filter agreements active within this period (startDate <= toDate AND (endDate IS NULL OR endDate >= fromDate)) */
  fromDate?: string | null;
  toDate?: string | null;
}

/** Operational list (vendor / project names, no money). */
export async function listSubcontractsOperational(
  db: DbExecutor,
  organizationId: string,
  filters: SubcontractListFilters,
): Promise<SubcontractOperationalView[]> {
  const conditions = [
    eq(subcontractAgreements.organizationId, organizationId),
    isNull(subcontractAgreements.archivedAt),
  ];
  if (filters.vendorId) conditions.push(eq(subcontractAgreements.vendorId, filters.vendorId));
  if (filters.projectId) conditions.push(eq(subcontractAgreements.projectId, filters.projectId));
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(subcontractAgreements.status, filters.status));
  }
  if (filters.toDate) {
    // Agreement must have started on or before the end of the filter range
    conditions.push(
      or(
        isNull(subcontractAgreements.startDate),
        lte(subcontractAgreements.startDate, filters.toDate),
      )!,
    );
  }
  if (filters.fromDate) {
    // Agreement must still be ongoing or have ended on/after the start of the filter range
    conditions.push(
      or(
        isNull(subcontractAgreements.endDate),
        gte(subcontractAgreements.endDate, filters.fromDate),
      )!,
    );
  }

  const rows = await db
    .select({
      agreement: OPERATIONAL_AGREEMENT_COLUMNS,
      vendorName: vendors.name,
      projectName: projects.name,
    })
    .from(subcontractAgreements)
    .innerJoin(vendors, eq(vendors.id, subcontractAgreements.vendorId))
    .innerJoin(projects, eq(projects.id, subcontractAgreements.projectId))
    .where(and(...conditions))
    .orderBy(desc(subcontractAgreements.createdAt))
    .limit(resolveListLimit(filters.limit, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map((row) => ({
    ...mapOperationalAgreement(row.agreement),
    vendorName: row.vendorName,
    projectName: row.projectName,
  }));
}

/**
 * Financial enrichment for already-authorized operational rows. Callers must have passed the
 * subcontract financial gate for every row's project before calling this.
 */
export async function loadSubcontractFinancialRows(
  db: DbExecutor,
  organizationId: string,
  rows: readonly SubcontractOperationalView[],
): Promise<SubcontractListItem[]> {
  if (rows.length === 0) return [];
  const moneyById = await listSubcontractAgreementMoney(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  const items: SubcontractListItem[] = [];
  for (const row of rows) {
    const moneyRow = moneyById.get(row.id);
    if (!moneyRow) continue;
    const { vendorName, projectName, ...operational } = toSubcontractOperationalView(row);
    const agreement: SubcontractAgreementRecord = {
      ...operational,
      originalAmount: moneyRow.originalAmount,
      currency: moneyRow.currency,
      retentionPercent: moneyRow.retentionPercent,
    };
    const events = await listSubcontractValueEvents(db, organizationId, agreement.id);
    const current = computeCurrentSubcontractValue(events, agreement.currency);
    const recognized = await loadRecognizedActualForSubcontractAgreement(
      db,
      organizationId,
      agreement.id,
      agreement.currency,
    );
    const remaining = computeSubcontractAgreementRemaining({
      currency: agreement.currency,
      currentAmount: current.amount,
      recognizedActualAmount: recognized.amount,
    });
    const cashRows = await listApBillCashForSubcontractAgreement(
      db,
      organizationId,
      agreement.id,
    );
    const cash = computeSubcontractCashPosition(cashRows, agreement.currency);
    const advances = await listSubcontractAdvances(db, organizationId, agreement.id);
    const advancePosition = computeAdvanceOutstandingBalance(advances, agreement.currency);
    const paidWithAdvances = foldAdvanceCashIntoPaid(
      money(cash.paid, agreement.currency),
      money(advancePosition.paid, agreement.currency),
    );
    items.push({
      ...agreement,
      vendorName,
      projectName,
      currentAmount: current.amount,
      recognizedActualAmount: recognized.amount,
      remainingCommitmentAmount: remaining.amount,
      billedAmount: cash.billed,
      paidAmount: paidWithAdvances.amount,
      outstandingAmount: cash.outstanding,
      advancePaidAmount: advancePosition.paid,
      advanceAppliedAmount: advancePosition.applied,
      advanceOutstandingAmount: advancePosition.outstanding,
    });
  }
  return items;
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
