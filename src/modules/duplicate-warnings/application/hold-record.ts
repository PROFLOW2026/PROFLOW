import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { assertApBillHasNoUnlinkedExpenseOverlap, assertExpenseFinalizeHasNoUnlinkedApOverlap } from '@/modules/financials/application/assert-expense-ap-overlap';
import { duplicateWarningRepository } from '../data/acknowledgements.repository';
import { hasDuplicateVendorReference } from '../data/reference-match';
import { holdOrResumeDuplicateWarnings } from '../domain/gate';
import {
  duplicateWarningCaseKey,
  type DuplicateWarningSnapshot,
  type DuplicateWarningType,
  type PendingDuplicateWarning,
} from '../domain/snapshot';

export interface DuplicateWarningAckOptions {
  readonly confirmDistinctCosts?: boolean;
  readonly acknowledgeDuplicateVendorReference?: boolean;
}

function acknowledgeTypesFor(options: DuplicateWarningAckOptions): DuplicateWarningType[] {
  const types: DuplicateWarningType[] = [];
  if (options.confirmDistinctCosts) types.push('expense_ap_overlap');
  if (options.acknowledgeDuplicateVendorReference) types.push('duplicate_vendor_reference');
  return types;
}

async function hold(context: OrgContext, input: {
  readonly kind: 'expense' | 'ap_bill';
  readonly recordId: string;
  readonly snapshot: DuplicateWarningSnapshot;
  readonly warningTypes: readonly DuplicateWarningType[];
  readonly options: DuplicateWarningAckOptions;
}): Promise<PendingDuplicateWarning | null> {
  const gate = await holdOrResumeDuplicateWarnings(duplicateWarningRepository(context.db), {
    organizationId: context.organizationId,
    caseKey: duplicateWarningCaseKey(input.kind, input.recordId),
    recordId: input.recordId,
    snapshot: input.snapshot,
    warningTypes: input.warningTypes,
    acknowledgeTypes: acknowledgeTypesFor(input.options),
    approverUserId: context.userId,
  });
  return gate.outcome === 'pending_duplicate_warning' ? gate : null;
}

export async function holdExpenseDuplicateWarnings(
  context: OrgContext,
  expense: {
    readonly id: string;
    readonly vendorId: string | null;
    readonly projectId: string | null;
    readonly netAmount: string;
    readonly currency: string;
    readonly expenseDate: string;
    readonly description: string | null;
  },
  options: DuplicateWarningAckOptions = {},
): Promise<PendingDuplicateWarning | null> {
  const warningTypes: DuplicateWarningType[] = [];
  const overlap = await assertExpenseFinalizeHasNoUnlinkedApOverlap(
    context.db,
    context.organizationId,
    {
      id: expense.id,
      vendorId: expense.vendorId,
      projectId: expense.projectId,
      netAmount: expense.netAmount,
      currency: expense.currency,
    },
    false,
  );
  if (overlap.length > 0) warningTypes.push('expense_ap_overlap');

  const referenceHit = await hasDuplicateVendorReference(context.db, {
    organizationId: context.organizationId,
    vendorId: expense.vendorId,
    reference: expense.description,
  });
  if (referenceHit) warningTypes.push('duplicate_vendor_reference');

  return hold(context, {
    kind: 'expense',
    recordId: expense.id,
    snapshot: {
      amount: expense.netAmount,
      vendorId: expense.vendorId,
      reference: expense.description,
      projectId: expense.projectId,
      date: expense.expenseDate,
    },
    warningTypes,
    options,
  });
}

export async function holdApBillDuplicateWarnings(
  context: OrgContext,
  bill: {
    readonly id: string;
    readonly vendorId: string;
    readonly projectId: string | null;
    readonly netAmount: string | null;
    readonly totalAmount: string;
    readonly currency: string;
    readonly reference: string | null;
    readonly billDate: string | null;
  },
  options: DuplicateWarningAckOptions = {},
): Promise<PendingDuplicateWarning | null> {
  const warningTypes: DuplicateWarningType[] = [];
  const overlap = await assertApBillHasNoUnlinkedExpenseOverlap(
    context.db,
    context.organizationId,
    bill,
    false,
  );
  if (overlap.length > 0) warningTypes.push('expense_ap_overlap');

  const referenceHit = await hasDuplicateVendorReference(context.db, {
    organizationId: context.organizationId,
    vendorId: bill.vendorId,
    reference: bill.reference,
    excludeBillId: bill.id,
  });
  if (referenceHit) warningTypes.push('duplicate_vendor_reference');

  const amount = bill.netAmount?.trim() ? bill.netAmount : bill.totalAmount;
  return hold(context, {
    kind: 'ap_bill',
    recordId: bill.id,
    snapshot: {
      amount,
      vendorId: bill.vendorId,
      reference: bill.reference,
      projectId: bill.projectId,
      date: bill.billDate,
    },
    warningTypes,
    options,
  });
}