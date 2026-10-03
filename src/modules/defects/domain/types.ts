import type {
  DefectCycleRecordKind,
  DefectMode,
  DefectSeverity,
  DefectStatus,
  DefectStatusFilter,
} from './lifecycle';

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface DefectListItem {
  readonly id: string;
  readonly projectId: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly severity: DefectSeverity;
  readonly status: DefectStatus;
  readonly mode: DefectMode;
  readonly dueDate: string | null;
  readonly cycleNo: number;
  readonly location: NamedRef | null;
  /** Internal views only (portal callers never get vendor names of others; it is their own company). */
  readonly vendor: NamedRef | null;
  readonly subcontractAgreementId: string | null;
  readonly assigneeName: string | null;
  readonly lastSubmittedAt: Date | null;
  readonly closedAt: Date | null;
  readonly createdAt: Date;
  readonly overdue: boolean;
}

export interface DefectCycleRecordView {
  readonly id: string;
  readonly cycleNo: number;
  readonly kind: DefectCycleRecordKind;
  readonly fromStatus: DefectStatus | null;
  readonly toStatus: DefectStatus | null;
  readonly note: string | null;
  readonly internalOnly: boolean;
  readonly details: Record<string, unknown>;
  readonly actorType: 'internal' | 'external' | 'system';
  /** Internal callers get names; external callers get null for internal actors. */
  readonly actorName: string | null;
  readonly createdAt: Date;
}

export interface DefectDetail extends DefectListItem {
  readonly organizationId: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly subcontractAgreementId: string | null;
  readonly vendorId: string | null;
  readonly locationId: string | null;
  readonly workLine: { readonly id: string; readonly code: string | null; readonly description: string } | null;
  readonly assigneeUserId: string | null;
  readonly inspectorUserId: string | null;
  readonly inspectorName: string | null;
  readonly sourceInspection: { readonly id: string; readonly referenceNo: number; readonly title: string } | null;
  readonly sourceInspectionItemLabel: string | null;
  readonly warrantySource: { readonly type: string; readonly id: string } | null;
  readonly contractorVisible: boolean;
  readonly records: readonly DefectCycleRecordView[];
}

export interface DefectListFilters {
  readonly status?: DefectStatusFilter;
  readonly severity?: DefectSeverity | null;
  readonly vendorId?: string | null;
  readonly locationId?: string | null;
  readonly mode?: DefectMode | null;
  readonly sourceInspectionId?: string | null;
  readonly overdueOnly?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface DefectListPage {
  readonly items: readonly DefectListItem[];
  readonly hasMore: boolean;
}

export interface DefectStatusCounts {
  readonly open: number;
  readonly assigned: number;
  readonly reopened: number;
  readonly awaitingVerification: number;
  readonly closed: number;
  readonly overdue: number;
}

/** Command Center feed item (Track T): one defect awaiting internal verification. */
export interface DefectAwaitingVerificationItem {
  readonly defectId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly severity: DefectSeverity;
  readonly status: DefectStatus;
  readonly cycleNo: number;
  readonly vendorName: string | null;
  readonly submittedAt: Date | null;
  readonly href: string;
}

/** Contractor portal summary (Track R). Counts only this principal's grant scope. */
export interface ContractorQualitySummary {
  readonly defectsToFix: number;
  readonly defectsOverdue: number;
  readonly defectsReopened: number;
  readonly defectsAwaitingVerification: number;
  readonly inspectionsUpcoming: number;
  readonly inspectionsFailedOpen: number;
}
