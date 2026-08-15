import {
  COMMAND_CENTER_SEVERITIES,
  isFinancialSourceType,
  type CommandCenterItem,
  type CommandCenterSeverity,
  type CommandCenterSourceType,
} from './types';

const SEVERITY_WEIGHT: Record<CommandCenterSeverity, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

/** Default severity per source — used when collectors omit an override. */
export const SOURCE_DEFAULT_SEVERITY: Record<CommandCenterSourceType, CommandCenterSeverity> = {
  overdue_ar: 'critical',
  vendor_bill_due: 'critical',
  vendor_bill_approaching: 'high',
  project_over_budget: 'critical',
  forecast_warning: 'high',
  credit_void_issue: 'high',
  unallocated_employee_cost: 'high',
  unallocated_vendor_bill: 'high',
  open_approval: 'high',
  month_close_incomplete: 'high',
  boq_measurement_awaiting_approval: 'high',
  boq_progress_ready_to_bill: 'high',
  ocr_needs_review: 'medium',
  ocr_failed: 'high',
  punch_open: 'medium',
  safety_open: 'high',
  inspection_open: 'high',
  recurring_draft_issue: 'medium',
  timesheet_missing: 'medium',
  boq_vs_contract_mismatch: 'medium',
  attendance_open: 'medium',
  overdue_planning: 'medium',
  expiring_compliance: 'medium',
  overdue_maintenance: 'medium',
  stale_project: 'low',
};

export const INBOX_SECTION_ORDER = ['critical', 'high', 'medium', 'low'] as const;

/** Group already-ranked inbox items into severity sections. Empty sections omitted. */
export function groupInboxBySeverity(
  items: readonly CommandCenterItem[],
): { readonly severity: CommandCenterSeverity; readonly items: CommandCenterItem[] }[] {
  const buckets: Record<CommandCenterSeverity, CommandCenterItem[]> = {
    critical: [],
    high: [],
    medium: [],
    low: [],
  };
  for (const item of items) {
    buckets[item.severity].push(item);
  }
  return INBOX_SECTION_ORDER.filter((severity) => buckets[severity].length > 0).map(
    (severity) => ({ severity, items: buckets[severity] }),
  );
}

/**
 * Build a stable item key: sourceType:sourceId (unique per org via DB uq).
 */
export function buildItemKey(sourceType: CommandCenterSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`;
}

/**
 * Rank score = severity weight + urgency bump (0–99) so overdue money floats up.
 */
export function computeRankScore(
  severity: CommandCenterSeverity,
  urgencyBump = 0,
): number {
  const bump = Math.max(0, Math.min(99, Math.floor(urgencyBump)));
  return SEVERITY_WEIGHT[severity] + bump;
}

export function severityRank(severity: CommandCenterSeverity): number {
  return COMMAND_CENTER_SEVERITIES.indexOf(severity);
}

/**
 * Sort: severity (critical first), then rankScore desc, then itemKey for stability.
 */
export function compareCommandCenterItems(a: CommandCenterItem, b: CommandCenterItem): number {
  const sev = severityRank(a.severity) - severityRank(b.severity);
  if (sev !== 0) return sev;
  if (b.rankScore !== a.rankScore) return b.rankScore - a.rankScore;
  return a.itemKey.localeCompare(b.itemKey);
}

export function sortCommandCenterItems(
  items: readonly CommandCenterItem[],
): CommandCenterItem[] {
  return [...items].sort(compareCommandCenterItems);
}

export function withItemDefaults(input: {
  readonly sourceType: CommandCenterSourceType;
  readonly sourceId: string;
  readonly what: string;
  readonly why: string;
  readonly where: string;
  readonly href: string;
  readonly severity?: CommandCenterSeverity;
  readonly urgencyBump?: number;
  readonly meta?: CommandCenterItem['meta'];
}): CommandCenterItem {
  const severity = input.severity ?? SOURCE_DEFAULT_SEVERITY[input.sourceType];
  const isFinancial = isFinancialSourceType(input.sourceType);
  return {
    itemKey: buildItemKey(input.sourceType, input.sourceId),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    what: input.what,
    why: input.why,
    where: input.where,
    href: input.href,
    severity,
    rankScore: computeRankScore(severity, input.urgencyBump ?? 0),
    isFinancial,
    allowHandle: !isFinancial,
    allowSnooze: true,
    meta: input.meta,
  };
}

/**
 * Whether a requested state transition is allowed for this source.
 * Financial truth: snooze only (or navigate). Never handled / dismissed.
 */
export function assertSafeItemStateTransition(
  sourceType: string,
  nextState: string,
): { ok: true } | { ok: false; reason: string } {
  if (isFinancialSourceType(sourceType)) {
    if (nextState === 'handled' || nextState === 'dismissed') {
      return {
        ok: false,
        reason: 'Financial command-center items cannot be handled or dismissed; snooze or open the record.',
      };
    }
  }
  if (nextState === 'dismissed' && isFinancialSourceType(sourceType)) {
    return { ok: false, reason: 'Cannot dismiss financial items' };
  }
  return { ok: true };
}
