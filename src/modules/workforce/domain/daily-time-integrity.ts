import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';

export type ExcessApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface DailyHoursBreakdown {
  readonly standardHoursPerDay: string;
  readonly reportedSoFar: string;
  readonly newHours: string;
  readonly regularHours: string;
  readonly excessHours: string;
  readonly exceedsDailyFramework: boolean;
}

export interface ExactDuplicateMatch {
  readonly id: string;
  readonly projectId: string | null;
  readonly workDate: string;
  readonly hours: string;
}

function parsePositiveHours(value: string, label: string): Decimal {
  const trimmed = value.trim();
  if (!trimmed || !/^[+]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.invalidHours');
  }
  const parsed = new Decimal(trimmed);
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.invalidHours');
  }
  return parsed;
}

/** Allows 0 (e.g. coalesce(sum(hours),0) when no entries yet that day). */
function parseNonNegativeHours(value: string, label: string): Decimal {
  const trimmed = value.trim();
  if (!trimmed || !/^[+]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.invalidHours');
  }
  const parsed = new Decimal(trimmed);
  if (!parsed.isFinite() || parsed.lt(0)) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.invalidHours');
  }
  return parsed;
}

/** Deterministic daily excess allocation (stable sort — not frozen at insert time). */
export interface DailyEntryForExcessAllocation {
  readonly id: string;
  readonly hours: string;
  /** `${createdAt ISO}#${id}` for stable ordering. */
  readonly sortKey: string;
}

export interface DailyExcessAllocationResult {
  readonly entryId: string;
  readonly excessHours: string | null;
}

/**
 * Allocates daily excess across entries in stable chronological order.
 * Earlier entries consume the daily framework first; later entries absorb excess.
 */
export function allocateDailyExcessAcrossEntries(input: {
  readonly standardHoursPerDay: string;
  readonly entries: readonly DailyEntryForExcessAllocation[];
}): readonly DailyExcessAllocationResult[] {
  const capacity = parsePositiveHours(input.standardHoursPerDay, 'daily framework');
  let remaining = capacity;

  const sorted = [...input.entries].sort((left, right) => left.sortKey.localeCompare(right.sortKey));

  return sorted.map((entry) => {
    const hours = parsePositiveHours(entry.hours, 'hours');
    const regular = Decimal.min(hours, Decimal.max(remaining, 0));
    const excess = hours.minus(regular);
    remaining = remaining.minus(regular);

    return {
      entryId: entry.id,
      excessHours: excess.gt(0) ? excess.toString() : null,
    };
  });
}

/** Preserves approved/rejected when excess amount unchanged; otherwise pending. */
export function reconcileExcessApprovalStatus(input: {
  readonly previousExcessHours: string | null | undefined;
  readonly previousStatus: ExcessApprovalStatus | null | undefined;
  readonly nextExcessHours: string | null | undefined;
}): ExcessApprovalStatus | null {
  const nextRaw = input.nextExcessHours?.trim();
  if (!nextRaw || Number(nextRaw) <= 0) return null;

  const prevRaw = input.previousExcessHours?.trim();
  const prevStatus = input.previousStatus;
  if (prevRaw && prevStatus && prevRaw === nextRaw) {
    return prevStatus;
  }
  return 'pending';
}

/** Whether adding hours would exceed the daily framework. */
export function dailyTotalWouldExceedFramework(input: {
  readonly standardHoursPerDay: string;
  readonly reportedSoFar: string;
  readonly newHours: string;
}): DailyHoursBreakdown {
  return breakdownDailyHours(input);
}

/** Split a new entry into regular vs excess against the daily framework. */
export function breakdownDailyHours(input: {
  readonly standardHoursPerDay: string;
  readonly reportedSoFar: string;
  readonly newHours: string;
}): DailyHoursBreakdown {
  const capacity = parsePositiveHours(input.standardHoursPerDay, 'daily framework');
  const soFar =
    input.reportedSoFar.trim() === ''
      ? new Decimal(0)
      : parseNonNegativeHours(input.reportedSoFar, 'reported hours');
  const incoming = parsePositiveHours(input.newHours, 'hours');

  const remaining = Decimal.max(capacity.minus(soFar), 0);
  const regular = Decimal.min(incoming, remaining);
  const excess = incoming.minus(regular);

  return {
    standardHoursPerDay: capacity.toString(),
    reportedSoFar: soFar.toString(),
    newHours: incoming.toString(),
    regularHours: regular.toString(),
    excessHours: excess.gt(0) ? excess.toString() : '0',
    exceedsDailyFramework: excess.gt(0),
  };
}

export function isExactDuplicateCandidate(input: {
  readonly candidate: {
    readonly employeeId: string;
    readonly workDate: string;
    readonly kind: string;
    readonly projectId: string | null;
    readonly hours: string;
    readonly workPackageId?: string | null;
    readonly phaseId?: string | null;
    readonly timeCodeId?: string | null;
    readonly description?: string | null;
  };
  readonly existing: ExactDuplicateMatch & {
    readonly workPackageId?: string | null;
    readonly phaseId?: string | null;
    readonly timeCodeId?: string | null;
    readonly description?: string | null;
  };
}): boolean {
  const a = input.candidate;
  const b = input.existing;
  return (
    a.workDate === b.workDate &&
    a.kind === (b.projectId ? 'project' : 'non_project') &&
    (a.projectId ?? null) === (b.projectId ?? null) &&
    hoursEqual(a.hours, b.hours) &&
    (a.workPackageId ?? null) === (b.workPackageId ?? null) &&
    (a.phaseId ?? null) === (b.phaseId ?? null) &&
    (a.timeCodeId ?? null) === (b.timeCodeId ?? null) &&
    // Notes must not create a second economic row for the same project day/hours.
    (a.kind === 'project' ||
      normalizeDescription(a.description) === normalizeDescription(b.description))
  );
}

function hoursEqual(left: string, right: string): boolean {
  try {
    return new Decimal(left.trim()).eq(new Decimal(right.trim()));
  } catch {
    return left.trim() === right.trim();
  }
}

/** Exported for attendance→project sync matching (same decimal hours). */
export function hoursEqualLoose(left: string, right: string): boolean {
  return hoursEqual(left, right);
}

/** Ensures excess fields satisfy DB coupling before insert. */
export function normalizeExcessFieldsForInsert(input: {
  readonly hours: string;
  readonly excessHours: string | null;
  readonly excessApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
}): {
  readonly excessHours: string | null;
  readonly excessApprovalStatus: 'pending' | 'approved' | 'rejected' | null;
} {
  const total = new Decimal(input.hours.trim());
  const excessRaw = input.excessHours?.trim();
  const excess =
    excessRaw && Number(excessRaw) > 0 ? new Decimal(excessRaw) : new Decimal(0);

  if (excess.gt(total)) {
    throw new DomainRuleError(
      'Excess hours cannot exceed entry hours',
      'workforce.errors.excessExceedsEntryHours',
    );
  }

  if (excess.lte(0)) {
    return { excessHours: null, excessApprovalStatus: null };
  }

  const status = input.excessApprovalStatus;
  if (!status) {
    throw new DomainRuleError(
      'Excess hours require an approval status',
      'workforce.errors.excessStatusRequired',
    );
  }

  return {
    excessHours: excess.toString(),
    excessApprovalStatus: status,
  };
}

/** Mirrors DB CHECK time_entries_excess_hours_status_coupling. */
export function isExcessStatusCouplingValid(input: {
  readonly excessHours: string | null | undefined;
  readonly excessApprovalStatus: string | null | undefined;
}): boolean {
  const excessRaw = input.excessHours?.trim();
  const hasExcess = excessRaw != null && excessRaw !== '' && Number(excessRaw) > 0;
  if (!hasExcess) {
    return input.excessApprovalStatus == null;
  }
  return (
    input.excessApprovalStatus === 'pending' ||
    input.excessApprovalStatus === 'approved' ||
    input.excessApprovalStatus === 'rejected'
  );
}

/** Mirrors DB CHECK employees_standard_hours_per_day_range. */
export function isEmployeeDailyStandardValid(value: string | null | undefined): boolean {
  if (value == null || value.trim() === '') return true;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 && num <= 24;
}

/** Mirrors DB CHECK time_entries_excess_hours_within_entry. */
export function isExcessWithinEntryHours(hours: string, excessHours: string | null | undefined): boolean {
  if (excessHours == null || excessHours.trim() === '') return true;
  const total = Number(hours);
  const excess = Number(excessHours);
  return Number.isFinite(total) && Number.isFinite(excess) && excess >= 0 && excess <= total;
}

function normalizeDescription(value: string | null | undefined): string {
  return (value ?? '').trim();
}

/** Labor Actual: approved entry with no pending/rejected excess blocking cost. */
export function contributesApprovedLaborCost(input: {
  readonly status: string;
  readonly approvalStatus: string;
  readonly excessHours: string | null | undefined;
  readonly excessApprovalStatus: ExcessApprovalStatus | null | undefined;
}): boolean {
  if (input.status !== 'recorded' || input.approvalStatus !== 'approved') {
    return false;
  }
  const excess = input.excessHours?.trim();
  if (!excess || excess === '0' || Number(excess) <= 0) {
    return true;
  }
  return input.excessApprovalStatus === 'approved';
}

/** Effective hours counted toward project labor when excess is rejected. */
export function effectiveLaborHours(input: {
  readonly hours: string;
  readonly excessHours: string | null | undefined;
  readonly excessApprovalStatus: ExcessApprovalStatus | null | undefined;
}): string {
  const total = parsePositiveHours(input.hours, 'hours');
  const excessRaw = input.excessHours?.trim();
  const excess =
    excessRaw && Number(excessRaw) > 0 ? parsePositiveHours(excessRaw, 'excess hours') : new Decimal(0);

  if (input.excessApprovalStatus === 'rejected' && excess.gt(0)) {
    return Decimal.max(total.minus(excess), 0).toString();
  }
  return total.toString();
}
