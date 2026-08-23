import { compareMoney, money, subtractMoney, zeroMoney } from '@/shared/money';

export interface ExpenseOverlapCandidate {
  readonly id: string;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly netAmount: string;
  readonly currency: string;
  readonly description: string | null;
  /** Sum of accepted match amounts against recognized bills (same currency). */
  readonly matchedAmount: string;
}

export interface ApBillOverlapCandidate {
  readonly id: string;
  readonly vendorId: string;
  readonly projectId: string | null;
  readonly netAmount: string;
  readonly currency: string;
  readonly reference: string | null;
  readonly status: string;
}

export interface ExpenseOverlapProbe {
  readonly vendorId?: string | null;
  readonly projectId?: string | null;
  readonly netAmount?: string | null;
  readonly currency: string;
}

export interface ApBillOverlapProbe {
  readonly vendorId: string;
  readonly projectId?: string | null;
  readonly totalAmount?: string | null;
  readonly currency: string;
}

const AMOUNT_TOLERANCE_RATIO = 0.05;
/** Warn when the smaller amount is at least half of the larger (partial-invoice pattern). */
const MIN_OVERLAP_RATIO = 0.5;

function amountsSimilar(left: string, right: string, currency: string): boolean {
  const a = money(left, currency);
  const b = money(right, currency);
  if (compareMoney(a, b) === 0) return true;
  const larger =
    compareMoney(a, b) >= 0 ? Number(a.amount) : Number(b.amount);
  if (larger <= 0) return false;
  const delta = Math.abs(Number(a.amount) - Number(b.amount));
  return delta / larger <= AMOUNT_TOLERANCE_RATIO;
}

function amountsMayOverlap(left: string, right: string, currency: string): boolean {
  if (amountsSimilar(left, right, currency)) return true;
  const a = Number(money(left, currency).amount);
  const b = Number(money(right, currency).amount);
  if (a <= 0 || b <= 0) return false;
  return Math.min(a, b) / Math.max(a, b) >= MIN_OVERLAP_RATIO;
}

function projectMatches(
  probeProjectId: string | null | undefined,
  candidateProjectId: string | null,
): boolean {
  if (!probeProjectId) return true;
  if (!candidateProjectId) return true;
  return probeProjectId === candidateProjectId;
}

export function expenseRemainingAfterMatches(candidate: ExpenseOverlapCandidate): string {
  const currency = candidate.currency;
  const net = money(candidate.netAmount, currency);
  const matched = money(candidate.matchedAmount || '0', currency);
  const remaining = subtractMoney(net, matched);
  if (compareMoney(remaining, zeroMoney(currency)) <= 0) return zeroMoney(currency).amount;
  return remaining.amount;
}

/** Finalized expenses that may double-count if a new bill is posted without linking. */
export function findSimilarFinalizedExpensesForBill(
  probe: ApBillOverlapProbe,
  candidates: readonly ExpenseOverlapCandidate[],
): readonly ExpenseOverlapCandidate[] {
  if (!probe.totalAmount?.trim()) return [];

  return candidates.filter((candidate) => {
    if (candidate.vendorId !== probe.vendorId) return false;
    if (candidate.currency.toUpperCase() !== probe.currency.toUpperCase()) return false;
    if (!projectMatches(probe.projectId, candidate.projectId)) return false;

    const remaining = expenseRemainingAfterMatches(candidate);
    if (compareMoney(money(remaining, candidate.currency), zeroMoney(candidate.currency)) <= 0) {
      return false;
    }

    return amountsMayOverlap(probe.totalAmount!, remaining, probe.currency);
  });
}

/** Recognized/open AP bills that may double-count if a similar expense is finalized. */
export function findSimilarOpenApBillsForExpense(
  probe: ExpenseOverlapProbe,
  candidates: readonly ApBillOverlapCandidate[],
): readonly ApBillOverlapCandidate[] {
  if (!probe.vendorId || !probe.netAmount?.trim()) return [];

  return candidates.filter((candidate) => {
    if (candidate.vendorId !== probe.vendorId) return false;
    if (candidate.currency.toUpperCase() !== probe.currency.toUpperCase()) return false;
    if (!projectMatches(probe.projectId, candidate.projectId)) return false;
    return amountsMayOverlap(probe.netAmount!, candidate.netAmount, probe.currency);
  });
}
