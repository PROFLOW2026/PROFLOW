/**
 * Workforce domain types. Framework-free - no React, no Next.js, no persistence.
 */

import type {
  AttendanceDayStatus,
  AttendanceEventSource,
  AttendanceEventType,
  ClockPresenceState,
} from './attendance';

export const EMPLOYEE_STATUSES = ['active', 'inactive'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const RATE_UNITS = ['hourly', 'daily', 'monthly'] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export const LABOR_COMPONENT_BASES = ['amount', 'percent'] as const;
export type LaborComponentBasis = (typeof LABOR_COMPONENT_BASES)[number];

export const TIME_ENTRY_KINDS = ['project', 'non_project'] as const;
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number];

/** recorded = eligible for Actual; void = corrected/cancelled (excluded). */
export const TIME_ENTRY_STATUSES = ['recorded', 'void'] as const;
export type TimeEntryStatus = (typeof TIME_ENTRY_STATUSES)[number];

/**
 * Timesheet / time-entry approval lifecycle.
 * Labor Actual requires recorded + approved. draft/submitted/returned never cost.
 */
export const TIME_APPROVAL_STATUSES = ['draft', 'submitted', 'approved', 'returned'] as const;
export type TimeApprovalStatus = (typeof TIME_APPROVAL_STATUSES)[number];

export const TIMESHEET_STATUSES = TIME_APPROVAL_STATUSES;
export type TimesheetStatus = TimeApprovalStatus;

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
  /** Business employment start — drives initial compensation effective date. */
  readonly hireDate: string | null;
  /** Optional employment end date. */
  readonly endDate: string | null;
  /** Costing / employment basis when known (hourly | daily | monthly). */
  readonly employmentBasis: RateUnit | null;
  /** Optional daily work-hour framework override; null inherits org default. */
  readonly standardHoursPerDay: string | null;
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
  /** MONTHLY only — null/undefined inherits org labor_cost_defaults.workingDaysPerMonth. */
  readonly workingDaysPerMonth?: string | null;
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
  readonly status: TimeEntryStatus;
  readonly voidedAt: Date | null;
  readonly correctsEntryId: string | null;
  readonly bulkBatchId: string | null;
  readonly timesheetId: string | null;
  readonly approvalStatus: TimeApprovalStatus;
  readonly submittedAt: Date | null;
  readonly submittedByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly decidedByUserId: string | null;
  readonly managerNote: string | null;
  readonly excessHours: string | null;
  readonly excessApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
  readonly clientRequestId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TimesheetRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: TimesheetStatus;
  readonly submittedByUserId: string | null;
  readonly submittedAt: Date | null;
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
  readonly managerNote: string | null;
  /** Set when approved — silent rewrites of period entries blocked after lock. */
  readonly lockedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TimesheetListItem extends TimesheetRecord {
  readonly employeeName: string;
  readonly entryCount: number;
  readonly totalHours: string;
}

export interface EmployeeListItem extends EmployeeRecord {
  readonly currentRate: string | null;
  readonly currentRateUnit: RateUnit | null;
  readonly currentRateCurrency: string | null;
  /** Fully loaded employer cost for one compensation unit (hour/day/month). */
  readonly currentEmployerCost: string | null;
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
 * `totalHours` / `entryCount` are secondary time evidence only - not membership cost.
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
 * Hours/entryCount are secondary time evidence only - not assignment cost.
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

/** Attendance day row (presence only - never labor Actual). */
export interface AttendanceDayRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly workDate: string;
  readonly status: AttendanceDayStatus;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AttendanceEventRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly attendanceDayId: string;
  readonly eventType: AttendanceEventType;
  readonly occurredAt: Date;
  readonly source: AttendanceEventSource;
  readonly notes: string | null;
  readonly createdByUserId: string | null;
  readonly voidedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AttendanceDayListItem extends AttendanceDayRecord {
  readonly employeeName: string;
  readonly clockInAt: Date | null;
  readonly clockOutAt: Date | null;
  readonly eventCount: number;
}

export interface AttendanceDayDetail extends AttendanceDayRecord {
  readonly employeeName: string;
  readonly events: readonly AttendanceEventRecord[];
  readonly presence: ClockPresenceState;
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
