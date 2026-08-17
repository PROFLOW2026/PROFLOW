/**
 * Warranty coverages and issues. A closed project stays closed when a
 * service work order is opened from an issue.
 */

export const WARRANTY_COVERAGE_TYPES = ['workmanship', 'materials', 'equipment', 'mixed'] as const;
export type WarrantyCoverageType = (typeof WARRANTY_COVERAGE_TYPES)[number];

export const WARRANTY_COVERAGE_STATUSES = ['scheduled', 'active', 'expired', 'void'] as const;
export type WarrantyCoverageStatus = (typeof WARRANTY_COVERAGE_STATUSES)[number];

export const WARRANTY_ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'cancelled'] as const;
export type WarrantyIssueStatus = (typeof WARRANTY_ISSUE_STATUSES)[number];

export const WARRANTY_COVERAGE_DOCUMENT_OWNER = 'warranty_coverage' as const;
export const WARRANTY_ISSUE_DOCUMENT_OWNER = 'warranty_issue' as const;

export interface WarrantyCoverageRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly vendorId: string | null;
  readonly coverageType: WarrantyCoverageType;
  readonly title: string;
  readonly notes: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: WarrantyCoverageStatus;
  readonly reminderDaysBefore: number;
  readonly archivedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WarrantyIssueRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly coverageId: string;
  readonly projectId: string;
  readonly workOrderId: string | null;
  readonly title: string;
  readonly notes: string | null;
  readonly status: WarrantyIssueStatus;
  readonly reportedAt: Date;
  readonly resolvedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WarrantyCoverageListItem extends WarrantyCoverageRecord {
  readonly projectName: string;
  readonly projectStatus: string;
  readonly openIssueCount: number;
}
