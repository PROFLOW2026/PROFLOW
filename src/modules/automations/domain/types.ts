export const AUTOMATION_PRESET_KEYS = [
  'client_balance_overdue',
  'quote_no_followup',
  'vendor_bill_due',
  'timesheet_not_submitted',
  'timesheet_waiting_approval',
  'ocr_waiting_review',
  'forecast_over_budget',
  'forecast_margin_low',
  'warranty_expiring',
  'compliance_expiring',
  'asset_service_due',
  'retention_release_date',
  'closeout_has_blockers',
] as const;
export type AutomationPresetKey = (typeof AUTOMATION_PRESET_KEYS)[number];

export const SAFE_AUTOMATION_ACTIONS = [
  'notify',
  'draft_communication',
  'draft_expense',
  'planning_followup',
] as const;
export type SafeAutomationAction = (typeof SAFE_AUTOMATION_ACTIONS)[number];

export const UNSAFE_AUTOMATION_ACTIONS = [
  'post_financials',
  'finalize_financials',
  'pay_vendor',
  'receive_payment',
  'approve',
  'release_retention',
  'modify_contract',
  'approve_change',
] as const;
export type UnsafeAutomationAction = (typeof UNSAFE_AUTOMATION_ACTIONS)[number];

export const AUTOMATION_RUN_STATUSES = ['ok', 'skipped', 'failed'] as const;
export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export interface AutomationRuleRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly presetKey: AutomationPresetKey;
  readonly enabled: boolean;
  readonly configJson: Record<string, unknown>;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AutomationRunRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly ruleId: string;
  readonly status: AutomationRunStatus;
  readonly actionsJson: unknown;
  readonly errorMessage: string | null;
  readonly ranAt: Date;
}

export interface AutomationMatch {
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly body: string;
  readonly href: string | null;
  readonly projectId?: string | null;
}

export interface AutomationActionRequest {
  readonly kind: string;
  readonly payload?: Record<string, unknown>;
}

export interface AutomationRunContext {
  readonly presetKey: AutomationPresetKey;
  readonly matches: readonly AutomationMatch[];
}
