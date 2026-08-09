/**
 * Field operations domain types (Wave 3). Framework-free.
 */

export const PUNCH_STATUSES = ['open', 'in_progress', 'done', 'cancelled'] as const;
export type PunchStatus = (typeof PUNCH_STATUSES)[number];

export const PUNCH_PRIORITIES = ['low', 'normal', 'high', 'critical'] as const;
export type PunchPriority = (typeof PUNCH_PRIORITIES)[number];

export const INSPECTION_STATUSES = [
  'scheduled',
  'in_progress',
  'passed',
  'failed',
  'cancelled',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_KINDS = ['general', 'safety', 'quality', 'handover', 'other'] as const;
export type InspectionKind = (typeof INSPECTION_KINDS)[number];

/** Work-package option for field-ops create forms (project-scoped). */
export interface FieldOpsWorkPackageOption {
  readonly id: string;
  readonly name: string;
  readonly projectId: string;
}

export interface DailyLogRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly logDate: string;
  readonly weather: string | null;
  readonly summary: string;
  /** Site / crew notes (blockers stored separately; packed in DB). */
  readonly workforceNotes: string | null;
  /** Day blockers — packed into workforce_notes without a dedicated column. */
  readonly blockers: string | null;
  readonly createdBy: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PunchListItemRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: PunchStatus;
  readonly priority: PunchPriority;
  readonly location: string | null;
  readonly dueDate: string | null;
  readonly closedAt: Date | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface InspectionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly title: string;
  readonly kind: string;
  readonly status: InspectionStatus;
  readonly scheduledOn: string | null;
  readonly completedOn: string | null;
  readonly result: string | null;
  readonly notes: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
