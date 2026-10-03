/**
 * Subcontract core types (Track E). Framework-free.
 *
 * Operational shapes (`*Operational*`, `*View` without `financial`) never carry money. Financial
 * data travels in separate optional `financial` objects that the application layer only fills
 * for callers holding contract.financial.view (internal) or ext.contract.view_value (external).
 */

/** Mirrors of the CHECK lists in migration 0158 (asserted equal to the Drizzle schema in unit tests). */
export const SUBCONTRACT_LINE_TYPES = [
  'quantity_rate',
  'lump_sum',
  'weighted_milestone',
  'percentage',
  'allowance',
  'custom',
] as const;
export type SubcontractLineType = (typeof SUBCONTRACT_LINE_TYPES)[number];

export const SUBCONTRACT_CHANGE_TYPES = [
  'addition',
  'deduction',
  'scope',
  'quantity',
  'rate',
  'extension',
  'instruction',
  'contractor_proposal',
] as const;
export type SubcontractChangeType = (typeof SUBCONTRACT_CHANGE_TYPES)[number];

export const SUBCONTRACT_CHANGE_ORIGINS = ['internal', 'contractor', 'site_instruction', 'unpriced_work'] as const;
export type SubcontractChangeOrigin = (typeof SUBCONTRACT_CHANGE_ORIGINS)[number];

export const SUBCONTRACT_CHANGE_STATUSES = [
  'draft',
  'submitted',
  'under_negotiation',
  'approved',
  'rejected',
  'withdrawn',
] as const;
export type SubcontractChangeStatus = (typeof SUBCONTRACT_CHANGE_STATUSES)[number];

export const UNPRICED_WORK_STATUSES = ['recorded', 'converted', 'rejected', 'cancelled'] as const;
export type UnpricedWorkStatus = (typeof UNPRICED_WORK_STATUSES)[number];

export const ADVANCE_RECOVERY_METHODS = ['none', 'proportional', 'fixed_percent_per_claim'] as const;
export type AdvanceRecoveryMethod = (typeof ADVANCE_RECOVERY_METHODS)[number];

export const SUBCONTRACT_VAT_TREATMENTS = [
  'standard',
  'reverse_charge',
  'exempt',
  'zero_rated',
  'not_applicable',
] as const;
export type SubcontractVatTreatment = (typeof SUBCONTRACT_VAT_TREATMENTS)[number];

export const AGREEMENT_LIFECYCLE_STATUSES = [
  'draft',
  'active',
  'suspended',
  'completed',
  'closed',
  'cancelled',
] as const;
export type AgreementLifecycleStatus = (typeof AGREEMENT_LIFECYCLE_STATUSES)[number];

export type AgreementLifecycleAction = 'activate' | 'suspend' | 'resume' | 'complete' | 'close' | 'cancel';

export interface AgreementOperationalView {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly subcontractNumber: string | null;
  readonly title: string;
  readonly status: AgreementLifecycleStatus;
  readonly parentContractId: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly trade: string | null;
  readonly workPackageId: string | null;
  readonly scopeSummary: string | null;
  readonly baselineLockedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly suspendedAt: Date | null;
  readonly suspensionReason: string | null;
  readonly completedAt: Date | null;
  readonly closedAt: Date | null;
}

export interface AgreementFinancialView {
  readonly currency: string;
  readonly originalAmount: string;
  readonly approvedChangesAmount: string;
  readonly currentAmount: string;
  readonly linesTotalAmount: string;
  readonly retentionPercent: string | null;
  readonly retentionCapPercent: string | null;
  readonly retentionCapAmount: string | null;
  readonly advancePercent: string | null;
  readonly advanceAmount: string | null;
  readonly advanceRecoveryMethod: AdvanceRecoveryMethod;
  readonly advanceRecoveryPercent: string | null;
  readonly vatTreatment: SubcontractVatTreatment;
  readonly paymentTermsDays: number | null;
  readonly paymentTermsText: string | null;
}

export interface WorkLineOperationalView {
  readonly id: string;
  readonly agreementId: string;
  readonly code: string | null;
  readonly description: string;
  readonly unit: string;
  readonly quantity: string;
  readonly lineType: SubcontractLineType;
  readonly weightPercent: string | null;
  readonly plannedStart: string | null;
  readonly plannedEnd: string | null;
  readonly locationId: string | null;
  readonly workPackageId: string | null;
  readonly sortOrder: number;
  readonly status: 'active' | 'closed' | 'cancelled';
  readonly isBaseline: boolean;
  readonly originChangeId: string | null;
  readonly notes: string | null;
}

export interface WorkLineFinancialView {
  readonly currency: string;
  readonly unitPrice: string;
  readonly contractBaselineAmount: string;
  readonly approvedChangesAmount: string;
  readonly revisedAmount: string;
  readonly revisedQuantity: string;
}

export interface WorkLineView extends WorkLineOperationalView {
  /** Present only for financially authorized callers. */
  readonly financial?: WorkLineFinancialView;
}

export interface ChangeOperationalView {
  readonly id: string;
  readonly agreementId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly changeNumber: number;
  readonly changeType: SubcontractChangeType;
  readonly title: string;
  readonly description: string | null;
  readonly origin: SubcontractChangeOrigin;
  readonly sourceEntityType: string | null;
  readonly sourceEntityId: string | null;
  readonly status: SubcontractChangeStatus;
  readonly timeExtensionDays: number | null;
  readonly submittedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly decisionReason: string | null;
  readonly createdActorType: 'internal' | 'external' | 'system';
  readonly createdAt: Date;
}

export interface ChangeVersionLineView {
  readonly id: string;
  readonly workLineId: string | null;
  readonly newLineCode: string | null;
  readonly newLineDescription: string | null;
  readonly newLineUnit: string | null;
  readonly newLineType: SubcontractLineType | null;
  readonly quantityDelta: string;
  readonly unitRate: string | null;
  readonly amountDelta: string;
}

export interface ChangeVersionView {
  readonly id: string;
  readonly versionNo: number;
  readonly amount: string;
  readonly currency: string;
  readonly timeExtensionDays: number | null;
  readonly note: string | null;
  readonly actorType: 'internal' | 'external' | 'system';
  readonly createdAt: Date;
  readonly lines: readonly ChangeVersionLineView[];
}

export interface ChangeView extends ChangeOperationalView {
  /** Present only for financially authorized callers. */
  readonly versions?: readonly ChangeVersionView[];
  readonly approvedVersionId?: string | null;
}

export interface UnpricedWorkView {
  readonly id: string;
  readonly projectId: string;
  readonly agreementId: string;
  readonly vendorId: string;
  readonly vendorName: string | null;
  readonly agreementTitle: string | null;
  readonly title: string;
  readonly scopeDescription: string | null;
  readonly locationId: string | null;
  readonly workPackageId: string | null;
  readonly workDate: string;
  readonly issuerName: string | null;
  readonly status: UnpricedWorkStatus;
  readonly convertedChangeId: string | null;
  readonly decisionReason: string | null;
  readonly createdAt: Date;
}

/** What the caller may do on one project (resolved once per request). */
export interface SubcontractAccess {
  readonly canView: boolean;
  readonly canCoordinate: boolean;
  readonly canViewFinancial: boolean;
  readonly canManageContract: boolean;
  readonly canManageChangeFinancial: boolean;
}
