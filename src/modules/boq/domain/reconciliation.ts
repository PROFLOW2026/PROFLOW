import Decimal from 'decimal.js';
import { money, subtractMoney, type MoneyValue } from '@/shared/money';
import type { ContractBoqReconStatus } from './types';

/**
 * Contract ↔ BOQ reconciliation. Never invents balancing fake items.
 */

export interface ContractBoqReconciliation {
  readonly originalContract: MoneyValue;
  readonly originalBoq: MoneyValue;
  readonly currentContract: MoneyValue;
  readonly currentBoq: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly allocatedApprovedChanges: MoneyValue;
  readonly unallocatedApprovedChanges: MoneyValue;
  readonly originalDifference: MoneyValue;
  readonly currentDifference: MoneyValue;
  readonly status: ContractBoqReconStatus;
}

function absDiff(left: MoneyValue, right: MoneyValue): MoneyValue {
  const delta = subtractMoney(left, right);
  const amount = new Decimal(delta.amount).abs().toFixed();
  return money(amount, delta.currency);
}

export function reconcileContractBoq(input: {
  readonly originalContract: MoneyValue;
  readonly originalBoq: MoneyValue;
  readonly currentContract: MoneyValue;
  readonly currentBoq: MoneyValue;
  readonly approvedChanges: MoneyValue;
  readonly allocatedApprovedChanges: MoneyValue;
  readonly tolerance?: string;
}): ContractBoqReconciliation {
  const tolerance = new Decimal(input.tolerance ?? '0.01');
  const currentDifference = subtractMoney(input.currentContract, input.currentBoq);
  const unallocatedApprovedChanges = subtractMoney(
    input.approvedChanges,
    input.allocatedApprovedChanges,
  );

  const currentAbs = new Decimal(currentDifference.amount).abs();
  const unallocAbs = new Decimal(unallocatedApprovedChanges.amount).abs();

  let status: ContractBoqReconStatus = 'matched';
  if (unallocAbs.greaterThan(tolerance)) {
    status = 'unallocated_approved_change';
  } else if (currentAbs.greaterThan(tolerance)) {
    status =
      new Decimal(currentDifference.amount).greaterThan(0)
        ? 'unallocated_contract_value'
        : 'variance';
  }

  return {
    originalContract: input.originalContract,
    originalBoq: input.originalBoq,
    currentContract: input.currentContract,
    currentBoq: input.currentBoq,
    approvedChanges: input.approvedChanges,
    allocatedApprovedChanges: input.allocatedApprovedChanges,
    unallocatedApprovedChanges,
    originalDifference: absDiff(input.originalContract, input.originalBoq),
    currentDifference,
    status,
  };
}
