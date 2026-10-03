import { DomainRuleError } from '@/shared/errors';
import { maxMoney, money, subtractMoney, sumMoney, zeroMoney, type MoneyValue } from '@/shared/money';

/**
 * Deductions / back-charges are first-class, append-only records (never hidden AP credits). A correction
 * is a reversal row mirroring the issued deduction; a deduction can be reversed once.
 */

export interface DeductionFact {
  readonly id: string;
  readonly entryKind: 'issue' | 'reversal';
  readonly reversalOfId: string | null;
  readonly amount: string;
}

/** Issued minus reversed (NET). */
export function netDeductions(facts: readonly DeductionFact[], currency: string): MoneyValue {
  const issued = sumMoney(
    facts.filter((fact) => fact.entryKind === 'issue').map((fact) => money(fact.amount, currency)),
    currency,
  );
  const reversed = sumMoney(
    facts.filter((fact) => fact.entryKind === 'reversal').map((fact) => money(fact.amount, currency)),
    currency,
  );
  return subtractMoney(issued, reversed);
}

/** Deductions not yet applied by a payable basis (never negative). */
export function outstandingDeductions(
  facts: readonly DeductionFact[],
  appliedByBases: MoneyValue,
  currency: string,
): MoneyValue {
  return maxMoney(subtractMoney(netDeductions(facts, currency), appliedByBases), zeroMoney(currency));
}

export function reversedIds(facts: readonly DeductionFact[]): Set<string> {
  return new Set(facts.filter((fact) => fact.reversalOfId).map((fact) => fact.reversalOfId!));
}

export function assertReversible(target: DeductionFact | undefined, facts: readonly DeductionFact[]): DeductionFact {
  if (!target || target.entryKind !== 'issue') {
    throw new DomainRuleError('Only an issued deduction can be reversed', 'subcontractClaims.errors.notReversible');
  }
  if (reversedIds(facts).has(target.id)) {
    throw new DomainRuleError('Deduction already reversed', 'subcontractClaims.errors.alreadyReversed');
  }
  return target;
}
