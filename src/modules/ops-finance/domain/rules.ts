import { DomainRuleError } from '@/shared/errors';
import type { ForbiddenOpsLinkKind, OpsRecordKind } from './types';
import { FORBIDDEN_OPS_LINK_KINDS, OPS_RECORD_KINDS } from './types';

/**
 * Hard rule: an operational record’s cost metadata never contributes to Actual
 * by itself. Actual only moves after an explicitly linked Expense is finalized
 * through the existing expense engine.
 */
export function isOpsRecordCostActual(): false {
  return false;
}

/** Inventory quantity movements are never GL / Expense / ops→finance links. */
export function isInventoryMovementFinancialExpense(): false {
  return false;
}

/**
 * If material-to-project costing is added later, those costs must dedupe against
 * Vendor Bill / Expense recognition (same obligation → one Actual path).
 */
export function shouldDeduplicateMaterialCostWithVendorRecognition(): true {
  return true;
}

export function isLinkableOpsRecordKind(kind: string): kind is OpsRecordKind {
  return (OPS_RECORD_KINDS as readonly string[]).includes(kind);
}

export function isForbiddenOpsLinkKind(kind: string): kind is ForbiddenOpsLinkKind {
  return (FORBIDDEN_OPS_LINK_KINDS as readonly string[]).includes(kind);
}

export function assertOpsRecordKindLinkable(kind: string): asserts kind is OpsRecordKind {
  if (isForbiddenOpsLinkKind(kind)) {
    throw new DomainRuleError(
      'Inventory movements cannot create linked expenses',
      'opsFinance.errors.inventoryNotExpense',
    );
  }
  if (!isLinkableOpsRecordKind(kind)) {
    throw new DomainRuleError(
      `Ops record kind ${kind} cannot link to expenses`,
      'opsFinance.errors.unsupportedKind',
    );
  }
}

/**
 * Draft linked expenses must not be treated as Actual contributions.
 * Loaders already filter to finalized expenses; this documents the bridge rule.
 */
export function expenseStatusContributesToActual(status: string): boolean {
  return status === 'finalized';
}

/** Maintenance / ops cost alone → zero Actual contribution lines. */
export function opsCostAloneExpenseContributions(): readonly [] {
  return [];
}
