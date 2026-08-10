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

/**
 * Temporal assignment statuses (Master Wave).
 * ASSIGNMENT ≠ TIME ENTRY ≠ Actual.
 */
export const EMPLOYEE_PROJECT_ASSIGNMENT_STATUSES = [
  'active',
  'completed',
  'cancelled',
] as const;

export type EmployeeProjectAssignmentStatus =
  (typeof EMPLOYEE_PROJECT_ASSIGNMENT_STATUSES)[number];

/** Persisted formal project ↔ employee membership (assignment ≠ labor Actual). */
export interface ProjectTeamMemberRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly employeeId: string;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly role: string | null;
  readonly plannedAllocationPercent: string | null;
  readonly notes: string | null;
  readonly status: EmployeeProjectAssignmentStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Project team roster from active `employee_project_assignments`.
 * `membershipId` is the assignment id (UI compatibility).
 * `totalHours` / `entryCount` are secondary time evidence only — not membership cost.
 */
export interface ProjectTeamMemberSummary {
  readonly membershipId: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly jobTitle: string | null;
  readonly role: string | null;
  readonly notes: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: EmployeeProjectAssignmentStatus;
  readonly totalHours: string;
  readonly entryCount: number;
}

/**
 * Employee → project links from active formal assignments.
 * Hours are secondary (time entries); assignment alone never creates Actual.
 */
export interface EmployeeProjectLink {
  readonly membershipId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly role: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly status: EmployeeProjectAssignmentStatus;
  readonly totalHours: string;
  readonly entryCount: number;
  readonly lastWorkDate: string | null;
}

/** Persisted employee ↔ project span (`employee_project_assignments`). */
export interface EmployeeProjectAssignmentRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly employeeId: string;
  /** Inclusive ISO date `YYYY-MM-DD`. */
  readonly startDate: string;
  /** Inclusive ISO date; null = open-ended. */
  readonly endDate: string | null;
  readonly role: string | null;
  /** Planning hint only (0–100); never a cost-allocation weight. */
  readonly plannedAllocationPercent: string | null;
  readonly notes: string | null;
  readonly status: EmployeeProjectAssignmentStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Project → צוות row (current or historical).
 * Hours/entryCount are secondary time evidence only — not assignment cost.
 */
export interface EmployeeProjectAssignmentSummary {
  readonly assignmentId: string;
  readonly employeeId: string;
  readonly employeeName: string;
  readonly jobTitle: string | null;
  readonly role: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly plannedAllocationPercent: string | null;
  readonly notes: string | null;
  readonly status: EmployeeProjectAssignmentStatus;
  readonly totalHours: string;
  readonly entryCount: number;
}

/**
 * Employee → שיוכים row.
 * Hours are secondary (time entries); assignment alone never creates Actual.
 */
export interface EmployeeAssignmentLink {
  readonly assignmentId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly role: string | null;
  readonly startDate: string;
  readonly endDate: string | null;
  readonly plannedAllocationPercent: string | null;
  readonly status: EmployeeProjectAssignmentStatus;
  readonly totalHours: string;
  readonly entryCount: number;
  readonly lastWorkDate: string | null;
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
