/** Pure inspection rules (no I/O). Mirrors the CHECKs in migration 0164. */

export const INSPECTION_STATUSES = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const INSPECTION_OUTCOMES = ['pass', 'conditional_pass', 'fail'] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];

export const CHECK_RESULTS = ['pending', 'pass', 'fail', 'na'] as const;
export type CheckResult = (typeof CHECK_RESULTS)[number];

export function isInspectionOutcome(value: unknown): value is InspectionOutcome {
  return typeof value === 'string' && (INSPECTION_OUTCOMES as readonly string[]).includes(value);
}

export function isCheckResult(value: unknown): value is CheckResult {
  return typeof value === 'string' && (CHECK_RESULTS as readonly string[]).includes(value);
}

export interface ChecklistEntry {
  readonly isRequired: boolean;
  readonly result: CheckResult;
}

export interface ChecklistTally {
  readonly total: number;
  readonly pending: number;
  readonly pendingRequired: number;
  readonly pass: number;
  readonly fail: number;
  readonly failRequired: number;
  readonly na: number;
}

export function tallyChecklist(items: readonly ChecklistEntry[]): ChecklistTally {
  let pending = 0;
  let pendingRequired = 0;
  let pass = 0;
  let fail = 0;
  let failRequired = 0;
  let na = 0;
  for (const entry of items) {
    switch (entry.result) {
      case 'pending':
        pending += 1;
        if (entry.isRequired) pendingRequired += 1;
        break;
      case 'pass':
        pass += 1;
        break;
      case 'fail':
        fail += 1;
        if (entry.isRequired) failRequired += 1;
        break;
      case 'na':
        na += 1;
        break;
    }
  }
  return { total: items.length, pending, pendingRequired, pass, fail, failRequired, na };
}

/** What the checklist says: a failed required item fails; a failed optional item is conditional. */
export function suggestedOutcome(tally: ChecklistTally): InspectionOutcome {
  if (tally.failRequired > 0) return 'fail';
  if (tally.fail > 0) return 'conditional_pass';
  return 'pass';
}

export type OutcomeViolation =
  | 'required_items_pending'
  | 'pass_with_required_failure'
  | 'conditions_required'
  | 'fail_reason_required';

/**
 * Validates a recorded outcome against the checklist. The inspector may be stricter than the
 * checklist (fail / conditional pass on a clean checklist) but never more lenient.
 */
export function validateOutcome(
  outcome: InspectionOutcome,
  tally: ChecklistTally,
  input: { readonly summary?: string | null; readonly conditions?: string | null },
): OutcomeViolation | null {
  if (tally.pendingRequired > 0) return 'required_items_pending';
  if (outcome === 'pass' && tally.failRequired > 0) return 'pass_with_required_failure';
  if (outcome === 'conditional_pass' && tally.failRequired > 0) return 'pass_with_required_failure';
  if (outcome === 'conditional_pass' && !input.conditions?.trim()) return 'conditions_required';
  if (outcome === 'fail' && tally.fail === 0 && !input.summary?.trim()) return 'fail_reason_required';
  return null;
}

export type InspectionAction = 'start' | 'record_outcome' | 'reinspect' | 'cancel' | 'edit';

const ALLOWED: Record<InspectionAction, readonly InspectionStatus[]> = {
  start: ['scheduled'],
  record_outcome: ['scheduled', 'in_progress'],
  reinspect: ['completed'],
  cancel: ['scheduled', 'in_progress'],
  edit: ['scheduled', 'in_progress'],
};

export function canPerformInspectionAction(
  action: InspectionAction,
  status: InspectionStatus,
  outcome: InspectionOutcome | null,
): boolean {
  if (!ALLOWED[action].includes(status)) return false;
  // A passed inspection is final; failed / conditional ones can be re-inspected.
  if (action === 'reinspect') return outcome === 'fail' || outcome === 'conditional_pass';
  return true;
}

/** Checklist results can change only while the inspection is open. */
export function canEditChecklist(status: InspectionStatus): boolean {
  return status === 'scheduled' || status === 'in_progress';
}

export function nextReferenceNo(currentMax: number | null | undefined): number {
  return (currentMax ?? 0) + 1;
}
