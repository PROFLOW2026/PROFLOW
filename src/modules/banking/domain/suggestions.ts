import { compareMoney, money, toNumericString } from '@/shared/money';
import {
  normalizeBankDescription,
  normalizeBankReference,
} from './fingerprint';
import type {
  BankMatchCandidate,
  BankMatchSuggestion,
  BankMatchTargetKind,
  BankTransaction,
  BankTxnDirection,
} from './types';

const INCOMING_KINDS: readonly BankMatchTargetKind[] = [
  'customer_payment',
  'billing_record',
];
const OUTGOING_KINDS: readonly BankMatchTargetKind[] = [
  'vendor_payment',
  'vendor_bill',
];

function directionKinds(direction: BankTxnDirection): readonly BankMatchTargetKind[] {
  return direction === 'credit' ? INCOMING_KINDS : OUTGOING_KINDS;
}

function daysBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function scoreCandidate(
  txn: Pick<
    BankTransaction,
    'amount' | 'currency' | 'date' | 'description' | 'reference' | 'direction'
  >,
  candidate: BankMatchCandidate,
): { score: number; rationale: string; suggestedAmount: string } | null {
  const allowed = directionKinds(txn.direction);
  if (!allowed.includes(candidate.kind)) return null;
  if (candidate.currency.toUpperCase() !== txn.currency.toUpperCase()) return null;

  const open = money(
    candidate.openAmount ?? candidate.amount,
    candidate.currency.toUpperCase(),
  );
  const txnAmount = money(txn.amount, txn.currency.toUpperCase());
  if (compareMoney(open, money('0', open.currency)) <= 0) return null;

  let score = 0;
  const reasons: string[] = [];

  const amountDelta = compareMoney(txnAmount, open);
  if (amountDelta === 0) {
    score += 50;
    reasons.push('amount_exact');
  } else if (compareMoney(txnAmount, open) < 0) {
    // Partial apply possible
    score += 25;
    reasons.push('amount_partial');
  } else {
    // Bank line larger than open - weak
    score += 5;
    reasons.push('amount_over');
  }

  const dayGap = daysBetween(txn.date, candidate.date);
  if (dayGap !== null) {
    if (dayGap === 0) {
      score += 20;
      reasons.push('date_exact');
    } else if (dayGap <= 3) {
      score += 12;
      reasons.push('date_near');
    } else if (dayGap <= 14) {
      score += 5;
      reasons.push('date_window');
    }
  }

  const txnRef = normalizeBankReference(txn.reference);
  const candRef = normalizeBankReference(candidate.reference);
  if (txnRef && candRef && txnRef === candRef) {
    score += 25;
    reasons.push('reference_exact');
  }

  const desc = normalizeBankDescription(txn.description);
  const label = normalizeBankDescription(candidate.counterpartyLabel ?? '');
  if (label && desc.includes(label)) {
    score += 10;
    reasons.push('counterparty_in_description');
  }

  const suggested =
    compareMoney(txnAmount, open) <= 0
      ? toNumericString(txnAmount)
      : toNumericString(open);

  // Floor: require some signal beyond random
  if (score < 20) return null;

  return {
    score: Math.min(100, score),
    rationale: reasons.join(','),
    suggestedAmount: suggested,
  };
}

/**
 * Rank match suggestions. Incoming → customer payment / billing;
 * outgoing → vendor payment / bill. Pure - never writes financials.
 */
export function suggestBankMatches(input: {
  readonly organizationId: string;
  readonly transaction: Pick<
    BankTransaction,
    | 'id'
    | 'organizationId'
    | 'amount'
    | 'currency'
    | 'date'
    | 'description'
    | 'reference'
    | 'direction'
    | 'matchStatus'
  >;
  readonly candidates: readonly BankMatchCandidate[];
  readonly nowIso?: string;
  readonly idFactory?: () => string;
}): readonly BankMatchSuggestion[] {
  const txn = input.transaction;
  if (txn.matchStatus === 'ignored' || txn.matchStatus === 'matched') {
    return [];
  }

  const now = input.nowIso ?? new Date().toISOString();
  const mkId = input.idFactory ?? (() => `sug-${Math.random().toString(36).slice(2, 10)}`);

  const scored: BankMatchSuggestion[] = [];
  for (const candidate of input.candidates) {
    const result = scoreCandidate(txn, candidate);
    if (!result) continue;
    scored.push({
      id: mkId(),
      organizationId: input.organizationId,
      bankTransactionId: txn.id,
      targetKind: candidate.kind,
      targetId: candidate.id,
      suggestedAmount: result.suggestedAmount,
      currency: txn.currency.toUpperCase(),
      score: result.score,
      rationale: result.rationale,
      createdAt: now,
    });
  }

  return scored.sort((a, b) => b.score - a.score || a.targetId.localeCompare(b.targetId));
}
