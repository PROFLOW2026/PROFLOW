/**
 * Owner Command Center ("היום") — actionable inbox items only.
 * Framework-free domain types.
 */

export const COMMAND_CENTER_SOURCE_TYPES = [
  'overdue_ar',
  'vendor_bill_due',
  'attendance_open',
  'unallocated_employee_cost',
  'unallocated_vendor_bill',
  'project_over_budget',
  'open_approval',
  'overdue_planning',
  'expiring_compliance',
  'overdue_maintenance',
  'stale_project',
  'credit_void_issue',
  'month_close_incomplete',
] as const;

export type CommandCenterSourceType = (typeof COMMAND_CENTER_SOURCE_TYPES)[number];

export const COMMAND_CENTER_SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type CommandCenterSeverity = (typeof COMMAND_CENTER_SEVERITIES)[number];

export const COMMAND_CENTER_ITEM_STATES = ['active', 'handled', 'dismissed', 'snoozed'] as const;
export type CommandCenterItemState = (typeof COMMAND_CENTER_ITEM_STATES)[number];

/** Money / AR / AP / allocation truth — never dismiss or mark handled. */
export const FINANCIAL_SOURCE_TYPES = [
  'overdue_ar',
  'vendor_bill_due',
  'unallocated_employee_cost',
  'unallocated_vendor_bill',
  'project_over_budget',
  'credit_void_issue',
] as const satisfies readonly CommandCenterSourceType[];

export type FinancialSourceType = (typeof FINANCIAL_SOURCE_TYPES)[number];

export function isFinancialSourceType(sourceType: string): sourceType is FinancialSourceType {
  return (FINANCIAL_SOURCE_TYPES as readonly string[]).includes(sourceType);
}

export interface CommandCenterItem {
  readonly itemKey: string;
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
  /** WHAT — short title of the action needed. */
  readonly what: string;
  /** WHY — why this matters now. */
  readonly why: string;
  /** WHERE — human location (project, vendor, employee, …). */
  readonly where: string;
  /** Primary navigation href (locale-stripped app path). */
  readonly href: string;
  readonly severity: CommandCenterSeverity;
  /** Higher = more urgent within the same severity. */
  readonly rankScore: number;
  readonly isFinancial: boolean;
  readonly allowHandle: boolean;
  readonly allowSnooze: boolean;
  readonly meta?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface CommandCenterItemStateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly itemKey: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly state: CommandCenterItemState;
  readonly snoozedUntil: Date | null;
  readonly note: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CommandCenterInbox {
  readonly items: readonly CommandCenterItem[];
  readonly totalActive: number;
  readonly hiddenByState: number;
}
