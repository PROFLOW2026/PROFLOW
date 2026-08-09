/**
 * Workforce domain types. Framework-free — no React, no Next.js, no persistence.
 */

export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const RATE_UNITS = ['hourly', 'daily', 'monthly'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const LABOR_COMPONENT_BASES = ['amount', 'percent'] as const;
export type LaborComponentBasis = (typeof LABOR_COMPONENT_BASES)[number];

export const TIME_ENTRY_KINDS = ['project', 'non_project'] as const;
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number];

export interface EmployeeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: EmployeeStatus;
  readonly userId: string | null;
  readonly employeeNumber: string | null;
  readonly jobTitle: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RateVersionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly baseRate: string;
  readonly rateUnit: RateUnit;
  readonly currency: string;
  readonly burdenPercent: string | null;
  readonly correctsRateVersionId: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LaborCostComponentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly rateVersionId: string;
  readonly key: string;
  readonly label: string;
  readonly basis: LaborComponentBasis;
  readonly amount: string | null;
  readonly percent: string | null;
  readonly currency: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NonProjectTimeCodeRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly key: string;
  readonly name: string;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TimeEntryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly hours: string;
  readonly kind: TimeEntryKind;
  readonly projectId: string | null;
  readonly workPackageId: string | null;
  readonly phaseId: string | null;
  readonly timeCodeId: string | null;
  readonly rateVersionId: string | null;
  readonly costAmount: string | null;
  readonly costCurrency: string | null;
  readonly description: string | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface EmployeeListItem extends EmployeeRecord {
  readonly currentRate: string | null;
  readonly currentRateUnit: RateUnit | null;
  readonly currentRateCurrency: string | null;
}

export interface TimeEntryListItem extends TimeEntryRecord {
  readonly employeeName: string;
  readonly projectName: string | null;
  readonly workPackageName: string | null;
  readonly timeCodeName: string | null;
}

/** Preset non-project codes seeded on first workforce use. */
export const DEFAULT_NON_PROJECT_TIME_CODES = [
  { key: 'office', name: 'Office' },
  { key: 'warehouse', name: 'Warehouse' },
  { key: 'training', name: 'Training' },
  { key: 'travel', name: 'Travel' },
  { key: 'management', name: 'Management' },
  { key: 'general', name: 'General work' },
] as const;
