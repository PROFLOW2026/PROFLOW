/**
 * Today / Dashboard presentation bias from business profile.
 * Same collectors and financial engines — ranking/order only.
 */

import type { TodayEmphasis } from './business-profile-setup';

const FIELD_SOURCES = new Set<string>([
  'punch_open',
  'inspection_open',
  'safety_open',
  'attendance_open',
  'overdue_maintenance',
  'overdue_planning',
  'timesheet_missing',
  'closeout_blockers',
]);

const MONEY_SOURCES = new Set<string>([
  'overdue_ar',
  'vendor_bill_due',
  'vendor_bill_approaching',
  'project_over_budget',
  'forecast_warning',
  'cash_flow_risk',
  'boq_progress_ready_to_bill',
  'unallocated_vendor_bill',
  'unallocated_employee_cost',
]);

const SERVICE_SOURCES = new Set<string>([
  'overdue_maintenance',
  'recurring_draft_issue',
  'attendance_open',
  'timesheet_missing',
]);

/**
 * Soft urgency bump (0–40) so profile-relevant items float without hiding others.
 * Financial criticality still wins via base severity weights.
 */
export function todayEmphasisUrgencyBump(
  sourceType: string,
  emphasis: TodayEmphasis | null | undefined,
): number {
  if (!emphasis) return 0;
  if (emphasis === 'field') {
    if (FIELD_SOURCES.has(sourceType)) return 35;
    if (SERVICE_SOURCES.has(sourceType)) return 20;
    return 0;
  }
  if (emphasis === 'dashboard') {
    if (MONEY_SOURCES.has(sourceType)) return 30;
    return 0;
  }
  // today — balanced bias toward actionable ops + light money
  if (FIELD_SOURCES.has(sourceType) || MONEY_SOURCES.has(sourceType)) return 15;
  return 0;
}

export type DashboardCardKey =
  | 'activeProjects'
  | 'contractValue'
  | 'actualCost'
  | 'profit'
  | 'forecast'
  | 'billing'
  | 'attention'
  | 'serviceHint';

/**
 * Which home cards to emphasize for a profile family.
 * Cards still respect permissions; this only de-emphasizes irrelevant chrome.
 */
export function preferredDashboardCards(input: {
  readonly preferServiceSurface: boolean;
  readonly todayEmphasis?: TodayEmphasis | null;
  readonly workMix?: string | null;
}): readonly DashboardCardKey[] {
  if (input.preferServiceSurface || input.workMix === 'jobs') {
    return ['attention', 'activeProjects', 'billing', 'serviceHint', 'actualCost', 'profit'];
  }
  if (input.todayEmphasis === 'dashboard') {
    return ['contractValue', 'profit', 'forecast', 'billing', 'attention', 'actualCost', 'activeProjects'];
  }
  return ['attention', 'activeProjects', 'billing', 'contractValue', 'profit', 'actualCost', 'forecast'];
}
