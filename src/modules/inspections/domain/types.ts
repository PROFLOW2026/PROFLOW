import type { CheckResult, InspectionOutcome, InspectionStatus } from './rules';

export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

export interface InspectionListItem {
  readonly id: string;
  readonly projectId: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly category: string;
  readonly templateKey: string | null;
  readonly status: InspectionStatus;
  readonly outcome: InspectionOutcome | null;
  readonly attemptNo: number;
  readonly scheduledFor: string | null;
  readonly completedAt: Date | null;
  readonly location: NamedRef | null;
  /** Internal views only. */
  readonly vendor: NamedRef | null;
  readonly subcontractAgreementId: string | null;
  readonly inspectorName: string | null;
  readonly openDefects: number;
}

export interface InspectionItemView {
  readonly id: string;
  readonly sortOrder: number;
  readonly itemKey: string | null;
  readonly label: string;
  readonly guidance: string | null;
  readonly isRequired: boolean;
  readonly result: CheckResult;
  readonly note: string | null;
  readonly checkedAt: Date | null;
}

export interface InspectionOutcomeView {
  readonly id: string;
  readonly attemptNo: number;
  readonly outcome: InspectionOutcome;
  readonly summary: string | null;
  readonly conditions: string | null;
  readonly passCount: number;
  readonly failCount: number;
  readonly naCount: number;
  readonly decidedAt: Date;
  /** null for external viewers. */
  readonly decidedByName: string | null;
}

export interface InspectionLinkedDefect {
  readonly id: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly status: string;
  readonly severity: string;
}

export interface InspectionDetail extends InspectionListItem {
  readonly organizationId: string;
  readonly summary: string | null;
  readonly conditions: string | null;
  readonly contractorVisible: boolean;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly locationId: string | null;
  readonly inspectorUserId: string | null;
  readonly workLine: { readonly id: string; readonly code: string | null; readonly description: string } | null;
  readonly workPackage: NamedRef | null;
  readonly milestone: NamedRef | null;
  readonly startedAt: Date | null;
  readonly items: readonly InspectionItemView[];
  readonly outcomes: readonly InspectionOutcomeView[];
  readonly defects: readonly InspectionLinkedDefect[];
}

export interface InspectionListFilters {
  readonly status?: InspectionStatus | 'open' | null;
  readonly outcome?: InspectionOutcome | null;
  readonly vendorId?: string | null;
  readonly locationId?: string | null;
  readonly limit?: number;
  readonly offset?: number;
}

export interface InspectionListPage {
  readonly items: readonly InspectionListItem[];
  readonly hasMore: boolean;
}

export interface InspectionTemplateOption {
  /** 'catalog:<key>' or 'custom:<uuid>'. */
  readonly ref: string;
  readonly kind: 'catalog' | 'custom';
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly itemCount: number;
  readonly projectScoped: boolean;
}

export interface CustomTemplateView {
  readonly id: string;
  readonly projectId: string | null;
  readonly name: string;
  readonly category: string;
  readonly description: string | null;
  readonly items: readonly { readonly id: string; readonly label: string; readonly isRequired: boolean }[];
}

/** Contractor portal row: own inspections only, failed items inline. */
export interface ContractorInspectionItem {
  readonly id: string;
  readonly referenceNo: number;
  readonly title: string;
  readonly category: string;
  readonly templateKey: string | null;
  readonly status: InspectionStatus;
  readonly outcome: InspectionOutcome | null;
  readonly attemptNo: number;
  readonly scheduledFor: string | null;
  readonly completedAt: Date | null;
  readonly locationName: string | null;
  readonly summary: string | null;
  readonly conditions: string | null;
  readonly failedItems: readonly { readonly itemKey: string | null; readonly label: string; readonly note: string | null }[];
}
