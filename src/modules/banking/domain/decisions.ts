import { DomainRuleError } from '@/shared/errors';
import { compareMoney, money, toNumericString } from '@/shared/money';
import {
  assertBankMatchDoesNotCreateProjectCost,
  assertBankMatchDoesNotMutateFinancials,
  isBankMatchCreatingProjectCost,
  isBankMatchRecognizedActual,
} from './cost-guard';
import type {
  BankMatchDecision,
  BankMatchTargetKind,
  BankTxnDirection,
  BankTxnMatchStatus,
  BankUserDecision,
} from './types';

export interface DecideBankMatchInput {
  readonly organizationId: string;
  readonly bankTransactionId: string;
  readonly decision: BankUserDecision;
  readonly targetKind?: BankMatchTargetKind | null;
  readonly targetId?: string | null;
  readonly appliedAmount?: string | null;
  readonly currency?: string | null;
  readonly notes?: string | null;
  readonly txnDirection: BankTxnDirection;
  readonly txnAmount: string;
  readonly txnCurrency: string;
  readonly billAlreadyRecognized?: boolean;
}

export interface DecideBankMatchResult {
  readonly decision: Omit<BankMatchDecision, 'id' | 'createdAt'>;
  readonly nextMatchStatus: BankTxnMatchStatus;
  /** Always false - callers must not treat this as a ledger write. */
  readonly financialMutationPerformed: false;
}

function assertTargetAllowedForDirection(
  direction: BankTxnDirection,
  targetKind: BankMatchTargetKind,
): void {
  const incomingOk = targetKind === 'customer_payment' || targetKind === 'billing_record';
  const outgoingOk = targetKind === 'vendor_payment' || targetKind === 'vendor_bill';
  if (direction === 'credit' && !incomingOk) {
    throw new DomainRuleError(
      'Incoming bank lines suggest customer payment / billing only',
      'banking.errors.incomingTarget',
    );
  }
  if (direction === 'debit' && !outgoingOk) {
    throw new DomainRuleError(
      'Outgoing bank lines suggest vendor payment / bill only',
      'banking.errors.outgoingTarget',
    );
  }
}

/**
 * Record a human decision. Never mutates billing/AP/expense ledgers.
 */
export function buildBankMatchDecision(input: DecideBankMatchInput): DecideBankMatchResult {
  assertBankMatchDoesNotMutateFinancials();

  if (input.decision === 'ignore') {
    assertBankMatchDoesNotCreateProjectCost({
      targetKind: null,
      billAlreadyRecognized: input.billAlreadyRecognized,
    });
    return {
      decision: {
        organizationId: input.organizationId,
        bankTransactionId: input.bankTransactionId,
        decision: 'ignore',
        targetKind: null,
        targetId: null,
        appliedAmount: null,
        currency: null,
        notes: input.notes ?? null,
        mutatesFinancials: false,
        createsProjectCost: false,
      },
      nextMatchStatus: 'ignored',
      financialMutationPerformed: false,
    };
  }

  const targetKind = input.targetKind ?? null;
  const targetId = input.targetId ?? null;
  if (!targetKind || !targetId) {
    throw new DomainRuleError(
      'Approve / Change requires a match target',
      'banking.errors.targetRequired',
    );
  }

  assertTargetAllowedForDirection(input.txnDirection, targetKind);
  assertBankMatchDoesNotCreateProjectCost({
    targetKind,
    billAlreadyRecognized: input.billAlreadyRecognized,
  });

  const currency = (input.currency ?? input.txnCurrency).toUpperCase();
  const appliedRaw = input.appliedAmount ?? input.txnAmount;
  const applied = money(appliedRaw, currency);
  const txn = money(input.txnAmount, input.txnCurrency.toUpperCase());

  if (currency !== input.txnCurrency.toUpperCase()) {
    throw new DomainRuleError(
      'Match currency must match the bank transaction currency',
      'banking.errors.currencyMismatch',
    );
  }

  if (compareMoney(applied, money('0', currency)) <= 0) {
    throw new DomainRuleError(
      'Applied amount must be positive',
      'banking.errors.amountRequired',
    );
  }

  if (compareMoney(applied, txn) > 0) {
    throw new DomainRuleError(
      'Applied amount cannot exceed the bank transaction amount',
      'banking.errors.overApply',
    );
  }

  const fullyMatched = compareMoney(applied, txn) === 0;
  const nextMatchStatus: BankTxnMatchStatus = fullyMatched
    ? 'matched'
    : 'partially_matched';

  // Invariants retained for callers / tests.
  void isBankMatchRecognizedActual();
  void isBankMatchCreatingProjectCost();

  return {
    decision: {
      organizationId: input.organizationId,
      bankTransactionId: input.bankTransactionId,
      decision: input.decision,
      targetKind,
      targetId,
      appliedAmount: toNumericString(applied),
      currency,
      notes: input.notes ?? null,
      mutatesFinancials: false,
      createsProjectCost: false,
    },
    nextMatchStatus,
    financialMutationPerformed: false,
  };
}
