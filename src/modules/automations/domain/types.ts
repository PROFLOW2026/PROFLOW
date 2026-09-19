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
  // ── Universal Work Management triggers ─────────────────────────────────────
  'task_status_changed_to',
  'task_overdue',
  'task_assigned_to',
  'task_created_from_template',
  'task_approval_rejected',
  'task_dependency_resolved',
  'milestone_approaching_days',
  'project_created',
] as const;
export type AutomationPresetKey = (typeof AUTOMATION_PRESET_KEYS)[number];

/**
 * Structured trigger descriptors. Each entry maps a preset key to its
 * human-readable category and any required config parameters.
 * Currently informational only — `collect-matches.ts` drives the actual query.
 */
export const AUTOMATION_TRIGGER_TYPES = [
  { key: 'task_status_changed_to', category: 'tasks', configParams: ['status'] },
  { key: 'task_overdue', category: 'tasks', configParams: [] },
  { key: 'task_assigned_to', category: 'tasks', configParams: ['assigneeOrgMemberId'] },
  { key: 'task_created_from_template', category: 'tasks', configParams: ['templateId'] },
  { key: 'task_approval_rejected', category: 'tasks', configParams: [] },
  { key: 'task_dependency_resolved', category: 'tasks', configParams: [] },
  { key: 'milestone_approaching_days', category: 'tasks', configParams: ['daysAhead'] },
  { key: 'project_created', category: 'projects', configParams: [] },
] as const satisfies readonly { key: AutomationPresetKey; category: string; configParams: readonly string[] }[];

export const SAFE_AUTOMATION_ACTIONS = [
  'notify',
  'draft_communication',
  'draft_expense',
  'planning_followup',
  // ── Universal Work Management actions ──────────────────────────────────────
  // All task-mutation actions use created_by_system=true / actor_system=true.
  'notify_user',
  'create_task',
  'change_task_status',
  'assign_task',
  'add_task_label',
  'create_approval',
] as const;
export type SafeAutomationAction = (typeof SAFE_AUTOMATION_ACTIONS)[number];

/**
 * Structured action descriptors. Used by the rule editor UI to describe
 * what each action does and what config it needs.
 */
export const AUTOMATION_ACTION_DESCRIPTORS = [
  { kind: 'notify', requiresSystem: false, description: 'Send in-app notification to rule runner' },
  { kind: 'notify_user', requiresSystem: false, description: 'Send in-app notification to a specific user' },
  { kind: 'draft_communication', requiresSystem: false, description: 'Draft an outbound communication' },
  { kind: 'draft_expense', requiresSystem: false, description: 'Create a draft expense (never finalised)' },
  { kind: 'planning_followup', requiresSystem: false, description: 'Create a follow-up planning work item' },
  // Task-mutating actions — executor MUST set created_by_system=true / actor_system=true
  { kind: 'create_task', requiresSystem: true, description: 'Create a task on behalf of the system' },
  { kind: 'change_task_status', requiresSystem: true, description: 'Change task status (system actor)' },
  { kind: 'assign_task', requiresSystem: true, description: 'Assign task to a member (system actor)' },
  { kind: 'add_task_label', requiresSystem: true, description: 'Add a label to a task (system actor)' },
  { kind: 'create_approval', requiresSystem: true, description: 'Create an approval request for a task (system actor)' },
] as const satisfies readonly { kind: SafeAutomationAction; requiresSystem: boolean; description: string }[];

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
  /** Optional commercial context for draft_expense — skipped when incomplete. */
  readonly amount?: string | null;
  readonly currency?: string | null;
  /** UWM: task ID when the match is a task entity. */
  readonly taskId?: string | null;
  /** UWM: workspace ID for task-scoped actions. */
  readonly workspaceId?: string | null;
}

export interface AutomationActionRequest {
  readonly kind: string;
  readonly payload?: Record<string, unknown>;
}

export interface AutomationRunContext {
  readonly presetKey: AutomationPresetKey;
  readonly matches: readonly AutomationMatch[];
}
