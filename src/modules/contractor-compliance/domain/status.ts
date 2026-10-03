import type {
  ComplianceReviewStatus,
  ComplianceStatus,
  RequirementStatusResult,
} from './types';

const DAY_MS = 86_400_000;

function utcDay(isoDate: string): number {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return Date.UTC(year!, (month ?? 1) - 1, day ?? 1);
}

/** Whole calendar days from `from` to `to` (both ISO yyyy-mm-dd). Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to) - utcDay(from)) / DAY_MS);
}

export function addDays(isoDate: string, days: number): string {
  return new Date(utcDay(isoDate) + days * DAY_MS).toISOString().slice(0, 10);
}

export interface RequirementStatusInput {
  readonly requiresExpiry: boolean;
  readonly warningDays: number;
}

export interface DocumentStatusInput {
  readonly id: string;
  readonly reviewStatus: ComplianceReviewStatus;
  readonly expiresOn: string | null;
  readonly submittedAt: Date;
}

/**
 * Status of one requirement from its submissions.
 *
 * - Only APPROVED submissions count. Pending / rejected never make a requirement current.
 * - `expiresOn` is the last valid day: expired when `expiresOn < today`.
 * - Several approved documents: the one with the latest expiry wins (no expiry = open-ended).
 * - `requiresExpiry` and an approved document without expiry = current (open-ended certificate).
 */
export function computeRequirementStatus(
  requirement: RequirementStatusInput,
  documents: readonly DocumentStatusInput[],
  today: string,
): RequirementStatusResult {
  const approved = documents.filter((document) => document.reviewStatus === 'approved');
  const newest = [...documents].sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
  const pendingReview = documents.some((document) => document.reviewStatus === 'pending_review');
  const lastRejected = newest?.reviewStatus === 'rejected';

  if (approved.length === 0) {
    return {
      status: 'missing',
      effectiveDocumentId: null,
      expiresOn: null,
      daysToExpiry: null,
      pendingReview,
      lastRejected,
    };
  }

  const effective = [...approved].sort((a, b) => {
    if (a.expiresOn === b.expiresOn) return b.submittedAt.getTime() - a.submittedAt.getTime();
    if (a.expiresOn === null) return -1;
    if (b.expiresOn === null) return 1;
    return a.expiresOn < b.expiresOn ? 1 : -1;
  })[0]!;

  if (!requirement.requiresExpiry || effective.expiresOn === null) {
    return {
      status: 'current',
      effectiveDocumentId: effective.id,
      expiresOn: effective.expiresOn,
      daysToExpiry: effective.expiresOn ? daysBetween(today, effective.expiresOn) : null,
      pendingReview,
      lastRejected,
    };
  }

  const daysToExpiry = daysBetween(today, effective.expiresOn);
  let status: ComplianceStatus;
  if (daysToExpiry < 0) status = 'expired';
  else if (daysToExpiry <= requirement.warningDays) status = 'expiring';
  else status = 'current';

  return {
    status,
    effectiveDocumentId: effective.id,
    expiresOn: effective.expiresOn,
    daysToExpiry,
    pendingReview,
    lastRejected,
  };
}

export function emptyStatusCounts(): Record<ComplianceStatus, number> {
  return { missing: 0, current: 0, expiring: 0, expired: 0 };
}

export function countStatuses(statuses: readonly ComplianceStatus[]): Record<ComplianceStatus, number> {
  const counts = emptyStatusCounts();
  for (const status of statuses) counts[status] += 1;
  return counts;
}

/** A status that blocks payment when the requirement is required + blocking. */
export function isBlockingStatus(status: ComplianceStatus): boolean {
  return status === 'missing' || status === 'expired';
}

/** Most urgent first: expired, missing, expiring, current. */
export const COMPLIANCE_STATUS_PRIORITY: Readonly<Record<ComplianceStatus, number>> = {
  expired: 0,
  missing: 1,
  expiring: 2,
  current: 3,
};
