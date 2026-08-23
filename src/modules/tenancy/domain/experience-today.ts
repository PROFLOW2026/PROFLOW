/**
 * Today inbox focus by persona — same collectors; category filter + boost.
 */

import type { ExperiencePersonaKey, ExperienceRoleSurface } from './experience-persona';

export type TodayFocusCategory =
  | 'money'
  | 'project_risk'
  | 'field'
  | 'service'
  | 'time_people'
  | 'approvals'
  | 'boq'
  | 'closeout'
  | 'other';

const SOURCE_CATEGORY: Readonly<Record<string, TodayFocusCategory>> = {
  overdue_ar: 'money',
  vendor_bill_due: 'money',
  vendor_bill_approaching: 'money',
  cash_flow_risk: 'money',
  unallocated_vendor_bill: 'money',
  unallocated_employee_cost: 'money',
  project_over_budget: 'project_risk',
  forecast_warning: 'project_risk',
  stale_project: 'project_risk',
  punch_open: 'field',
  inspection_open: 'field',
  safety_open: 'field',
  overdue_planning: 'field',
  overdue_maintenance: 'service',
  recurring_draft_issue: 'service',
  attendance_open: 'time_people',
  timesheet_missing: 'time_people',
  open_approval: 'approvals',
  month_close_incomplete: 'approvals',
  boq_measurement_awaiting_approval: 'boq',
  boq_progress_ready_to_bill: 'boq',
  boq_vs_contract_mismatch: 'boq',
  closeout_blockers: 'closeout',
  warranty_expiring: 'closeout',
  ocr_needs_review: 'other',
  ocr_failed: 'other',
  credit_void_issue: 'money',
  expiring_compliance: 'other',
  automation_followup: 'other',
  communication_failed: 'other',
  billing_plan_cycle_draft: 'money',
  billing_plan_milestone_due: 'money',
};

export function todayCategoryForSource(sourceType: string): TodayFocusCategory {
  return SOURCE_CATEGORY[sourceType] ?? 'other';
}

/** Categories emphasized (boosted) per persona. */
export const PERSONA_TODAY_FOCUS: Readonly<
  Record<ExperiencePersonaKey, readonly TodayFocusCategory[]>
> = {
  project_contractor: ['project_risk', 'money', 'boq', 'approvals', 'closeout', 'field'],
  electrical: ['field', 'time_people', 'money', 'project_risk', 'approvals'],
  renovation: ['project_risk', 'money', 'field', 'approvals'],
  small_works: ['money', 'time_people', 'project_risk'],
  service: ['service', 'time_people', 'field', 'money'],
  architecture: ['time_people', 'money', 'project_risk', 'approvals'],
  consulting: ['time_people', 'money', 'project_risk', 'approvals'],
  inspection: ['field', 'time_people', 'project_risk', 'money'],
  mixed: ['project_risk', 'service', 'money', 'time_people', 'field'],
  all: [
    'money',
    'project_risk',
    'field',
    'service',
    'time_people',
    'approvals',
    'boq',
    'closeout',
    'other',
  ],
};

/** Categories soft-hidden unless critical severity (except money always kept). */
export const PERSONA_TODAY_DEEMPHASIZE: Readonly<
  Record<ExperiencePersonaKey, readonly TodayFocusCategory[]>
> = {
  project_contractor: ['service'],
  electrical: ['boq', 'closeout'],
  renovation: ['service', 'boq'],
  small_works: ['boq', 'closeout', 'service', 'field'],
  service: ['boq', 'closeout', 'project_risk'],
  architecture: ['boq', 'field', 'service', 'closeout'],
  consulting: ['boq', 'field', 'service', 'closeout'],
  inspection: ['boq', 'service'],
  mixed: [],
  all: [],
};

const OWNER_TODAY_DEEMPHASIZE: readonly TodayFocusCategory[] = ['time_people'];

export function todayUrgencyBumpForPersona(
  sourceType: string,
  persona: ExperiencePersonaKey,
  severity: string,
  roleSurface: ExperienceRoleSurface = 'general',
): number {
  const category = todayCategoryForSource(sourceType);
  const focus = PERSONA_TODAY_FOCUS[persona];
  const deemphasis = PERSONA_TODAY_DEEMPHASIZE[persona];

  if (severity === 'critical') return 40;
  if (roleSurface === 'owner' && category === 'money') return 40;
  if (focus.includes(category)) return 35;
  if (category === 'money') return 25;
  if (
    roleSurface === 'owner' &&
    OWNER_TODAY_DEEMPHASIZE.includes(category) &&
    severity !== 'high'
  ) {
    return 0;
  }
  if (deemphasis.includes(category)) return severity === 'high' ? 5 : 0;
  return 10;
}

/**
 * Whether to keep an item in the persona-focused Today list.
 * Critical money/risk always kept.
 */
export function todayItemVisibleForPersona(
  sourceType: string,
  persona: ExperiencePersonaKey,
  severity: string,
  roleSurface: ExperienceRoleSurface = 'general',
): boolean {
  if (persona === 'all') return true;
  if (severity === 'critical' || severity === 'high') return true;
  const category = todayCategoryForSource(sourceType);
  if (category === 'money') return true;
  if (
    roleSurface === 'owner' &&
    OWNER_TODAY_DEEMPHASIZE.includes(category) &&
    severity === 'low'
  ) {
    return false;
  }
  const deemphasis = PERSONA_TODAY_DEEMPHASIZE[persona];
  if (deemphasis.includes(category) && severity === 'low') return false;
  if (deemphasis.includes(category) && severity === 'medium') return false;
  return true;
}
