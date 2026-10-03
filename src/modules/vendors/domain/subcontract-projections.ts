/**
 * Subcontract read projections. Framework-free.
 *
 * Operational projection: who / where / what / when / status / documents. It carries NO money:
 * no amounts, no retention, no value events, no cash, no advances, no currency. Vendor-read users
 * without a financial grant only ever receive this shape - money is never loaded for them, so it
 * cannot be hidden client-side by mistake.
 *
 * Financial projection: the existing `SubcontractListItem` / `SubcontractDetail`, loaded only after
 * the financial gate in `application/subcontract-financial-access.ts` passed.
 */

import type {
  SubcontractDetail,
  SubcontractDocumentFlags,
  SubcontractLinkedDocument,
  SubcontractListItem,
  SubcontractStatus,
} from './subcontract-types';

export interface SubcontractOperationalView {
  readonly id: string;
  readonly organizationId: string;
  readonly subcontractNumber: string | null;
  readonly vendorId: string;
  readonly projectId: string;
  readonly parentContractId: string | null;
  readonly title: string;
  readonly status: SubcontractStatus;
  readonly paymentTermId: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly vendorName: string;
  readonly projectName: string;
}

export type SubcontractAgreementOperationalRecord = Omit<
  SubcontractOperationalView,
  'vendorName' | 'projectName'
>;

/**
 * Agreement header readable on the user connection: operational columns plus the
 * (non-secret) currency code. `original_amount` / `retention_percent` are column-revoked
 * from `authenticated` and come only from `subcontract_agreement_money_secure`.
 */
export interface SubcontractAgreementHeaderRecord extends SubcontractAgreementOperationalRecord {
  readonly currency: string;
}

/** Header money as exposed by `subcontract_agreement_money_secure`. */
export interface SubcontractAgreementMoney {
  readonly id: string;
  readonly currency: string;
  readonly originalAmount: string;
  readonly retentionPercent: string | null;
}

export interface SubcontractOperationalDetail extends SubcontractOperationalView {
  readonly parentContractLabel: string | null;
  readonly documents: readonly SubcontractLinkedDocument[];
  readonly documentFlags: SubcontractDocumentFlags;
}

/** One row as a given viewer is allowed to see it. */
export type SubcontractListRow = SubcontractListItem | SubcontractOperationalView;
export type SubcontractDetailView = SubcontractDetail | SubcontractOperationalDetail;

/**
 * Keys that must never appear on an operational projection. Used by the projection mapper's
 * tests and by the authorization integration tests.
 */
export const SUBCONTRACT_MONEY_KEYS = [
  'originalAmount',
  'retentionPercent',
  'currency',
  'currentAmount',
  'originalAmountDerived',
  'approvedChangesAmount',
  'recognizedActualAmount',
  'remainingCommitmentAmount',
  'billedAmount',
  'paidAmount',
  'outstandingAmount',
  'advancePaidAmount',
  'advanceAppliedAmount',
  'advanceOutstandingAmount',
  'events',
  'cash',
  'advances',
  'advancePosition',
] as const;

export function isFinancialSubcontractRow(row: SubcontractListRow): row is SubcontractListItem {
  return 'currentAmount' in row;
}

export function isFinancialSubcontractDetail(
  detail: SubcontractDetailView,
): detail is SubcontractDetail {
  return 'currentAmount' in detail;
}

/** Whitelist mapper: copies operational fields only, so a wider input can never leak money. */
export function toSubcontractOperationalView(
  input: SubcontractOperationalView,
): SubcontractOperationalView {
  return {
    id: input.id,
    organizationId: input.organizationId,
    subcontractNumber: input.subcontractNumber,
    vendorId: input.vendorId,
    projectId: input.projectId,
    parentContractId: input.parentContractId,
    title: input.title,
    status: input.status,
    paymentTermId: input.paymentTermId,
    startDate: input.startDate,
    endDate: input.endDate,
    notes: input.notes,
    archivedAt: input.archivedAt,
    createdByUserId: input.createdByUserId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    vendorName: input.vendorName,
    projectName: input.projectName,
  };
}
