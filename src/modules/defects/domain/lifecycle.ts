/**
 * Defect lifecycle (pure). Mirrors `app.defects_transition_guard` in migration 0164.
 *
 *   open -> assigned -> completion_submitted -> verification -> closed
 *                 ^             |                    |
 *                 |             +---- rejected ------+--> reopened (new repair cycle)
 *   closed -> reopened (new repair cycle, e.g. recurrence during warranty)
 *   open | assigned | reopened -> cancelled
 */

export const DEFECT_STATUSES = [
  'open',
  'assigned',
  'completion_submitted',
  'verification',
  'closed',
  'reopened',
  'cancelled',
] as const;
export type DefectStatus = (typeof DEFECT_STATUSES)[number];

export const DEFECT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];

export const DEFECT_MODES = ['construction', 'warranty'] as const;
export type DefectMode = (typeof DEFECT_MODES)[number];

export const DEFECT_CYCLE_RECORD_KINDS = [
  'opened',
  'assigned',
  'completion_submitted',
  'verification_started',
  'accepted',
  'rejected',
  'reopened',
  'cancelled',
  'updated',
  'note',
] as const;
export type DefectCycleRecordKind = (typeof DEFECT_CYCLE_RECORD_KINDS)[number];

export const DEFECT_TRANSITIONS: Readonly<Record<DefectStatus, readonly DefectStatus[]>> = {
  open: ['assigned', 'cancelled'],
  assigned: ['completion_submitted', 'cancelled'],
  completion_submitted: ['verification', 'closed', 'reopened'],
  verification: ['closed', 'reopened'],
  reopened: ['assigned', 'completion_submitted', 'cancelled'],
  closed: ['reopened'],
  cancelled: [],
};

export function canTransition(from: DefectStatus, to: DefectStatus): boolean {
  return from === to || DEFECT_TRANSITIONS[from].includes(to);
}

export type DefectAction =
  | 'assign'
  | 'submit_completion'
  | 'start_verification'
  | 'accept'
  | 'reject'
  | 'reopen'
  | 'cancel';

export interface DefectStep {
  readonly to: DefectStatus;
  readonly record: DefectCycleRecordKind;
  /** true = this step starts a new repair cycle (cycle_no + 1). */
  readonly newCycle: boolean;
}

const STEPS: Readonly<Record<DefectAction, { readonly from: readonly DefectStatus[]; readonly step: DefectStep }>> = {
  assign: { from: ['open', 'assigned', 'reopened'], step: { to: 'assigned', record: 'assigned', newCycle: false } },
  submit_completion: {
    from: ['assigned', 'reopened'],
    step: { to: 'completion_submitted', record: 'completion_submitted', newCycle: false },
  },
  start_verification: {
    from: ['completion_submitted'],
    step: { to: 'verification', record: 'verification_started', newCycle: false },
  },
  accept: { from: ['completion_submitted', 'verification'], step: { to: 'closed', record: 'accepted', newCycle: false } },
  reject: { from: ['completion_submitted', 'verification'], step: { to: 'reopened', record: 'rejected', newCycle: true } },
  reopen: { from: ['closed'], step: { to: 'reopened', record: 'reopened', newCycle: true } },
  cancel: { from: ['open', 'assigned', 'reopened'], step: { to: 'cancelled', record: 'cancelled', newCycle: false } },
};

/** Returns the step for `action` from `current`, or null when the action is not allowed. */
export function planDefectStep(action: DefectAction, current: DefectStatus): DefectStep | null {
  const entry = STEPS[action];
  return entry.from.includes(current) ? entry.step : null;
}

export function allowedDefectActions(current: DefectStatus): readonly DefectAction[] {
  return (Object.keys(STEPS) as DefectAction[]).filter((action) => STEPS[action].from.includes(current));
}

/** Statuses where the responsible party still owes work. */
export const DEFECT_ACTIVE_STATUSES: readonly DefectStatus[] = ['open', 'assigned', 'reopened'];
/** Statuses waiting for an internal verifier. */
export const DEFECT_AWAITING_VERIFICATION_STATUSES: readonly DefectStatus[] = ['completion_submitted', 'verification'];
export const DEFECT_TERMINAL_STATUSES: readonly DefectStatus[] = ['closed', 'cancelled'];

export function isDefectOpen(status: DefectStatus): boolean {
  return !DEFECT_TERMINAL_STATUSES.includes(status);
}

/** Overdue = still owed by the responsible party and the due date (YYYY-MM-DD) is before today. */
export function isDefectOverdue(
  defect: { readonly status: DefectStatus; readonly dueDate: string | null },
  today: string,
): boolean {
  if (!defect.dueDate) return false;
  if (!DEFECT_ACTIVE_STATUSES.includes(defect.status)) return false;
  return defect.dueDate < today;
}

export type DefectStatusFilter = 'active' | 'awaiting_verification' | 'closed' | 'all';

export function statusesForFilter(filter: DefectStatusFilter): readonly DefectStatus[] | null {
  switch (filter) {
    case 'active':
      return DEFECT_ACTIVE_STATUSES;
    case 'awaiting_verification':
      return DEFECT_AWAITING_VERIFICATION_STATUSES;
    case 'closed':
      return DEFECT_TERMINAL_STATUSES;
    case 'all':
      return null;
  }
}

/**
 * When the current repair cycle began: cycle 1 starts at creation; later cycles start at the
 * rejection (recorded on the previous cycle) or the reopen (recorded on the new cycle).
 */
export function currentCycleStartedAt(
  records: readonly { readonly kind: DefectCycleRecordKind; readonly cycleNo: number; readonly createdAt: Date }[],
  cycleNo: number,
  createdAt: Date,
): Date {
  if (cycleNo <= 1) return createdAt;
  let started: Date | null = null;
  for (const record of records) {
    const opensCycle =
      (record.kind === 'rejected' && record.cycleNo === cycleNo - 1) ||
      (record.kind === 'reopened' && record.cycleNo === cycleNo);
    if (opensCycle && (!started || record.createdAt > started)) started = record.createdAt;
  }
  return started ?? createdAt;
}

/** Evidence counts for a submission only when uploaded during the current repair cycle. */
export function countCycleEvidence(
  evidence: readonly { readonly uploadedAt: string }[],
  cycleStartedAt: Date,
): number {
  const threshold = cycleStartedAt.getTime();
  return evidence.filter((item) => {
    const time = Date.parse(item.uploadedAt);
    return Number.isFinite(time) && time >= threshold;
  }).length;
}

const SEVERITY_RANK: Record<DefectSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function severityRank(severity: DefectSeverity): number {
  return SEVERITY_RANK[severity];
}

/** Default due date offset (days) by severity when none is given. */
export function defaultDueInDays(severity: DefectSeverity): number {
  switch (severity) {
    case 'critical':
      return 2;
    case 'high':
      return 7;
    case 'medium':
      return 14;
    case 'low':
      return 30;
  }
}

export function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
