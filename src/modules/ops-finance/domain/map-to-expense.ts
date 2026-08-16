import type { CreateExpenseInput } from '@/modules/expenses';
import { DomainRuleError } from '@/shared/errors';
import type { OpsLinkPurpose, OpsRecordCostSnapshot, OpsRecordKind } from './types';

export interface MapOpsRecordToExpenseDraftInput {
  readonly snapshot: OpsRecordCostSnapshot;
  /** Required when snapshot.costAmount is null (e.g. compliance insurance). */
  readonly amount?: string | null;
  readonly currency?: string | null;
  readonly description?: string | null;
  readonly costFamily?: CreateExpenseInput['costFamily'];
  readonly projectId?: string | null;
  readonly vendorId?: string | null;
  readonly expenseDate?: string | null;
  readonly notes?: string | null;
  /** Optional periodic overhead - uses existing allocation engine on create/finalize. */
  readonly allocationPeriodStart?: string | null;
  readonly allocationPeriodEnd?: string | null;
  readonly allocationDriverMethod?: CreateExpenseInput['allocationDriverMethod'];
  readonly allocationScheduleMode?: CreateExpenseInput['allocationScheduleMode'];
  readonly allocationProjectIds?: readonly string[];
  readonly linkPurpose?: OpsLinkPurpose;
}

export function defaultCostFamilyForOpsKind(
  kind: OpsRecordKind,
  projectId: string | null,
): NonNullable<CreateExpenseInput['costFamily']> {
  if (kind === 'compliance_artifact' || kind === 'recurring_business_cost') {
    return 'business_overhead';
  }
  if (projectId) return 'direct_project';
  return 'asset_capital';
}

export function resolveOpsLinkPurpose(input: MapOpsRecordToExpenseDraftInput): OpsLinkPurpose {
  if (input.linkPurpose) return input.linkPurpose;
  if (
    input.allocationDriverMethod &&
    input.allocationPeriodStart &&
    input.allocationPeriodEnd
  ) {
    return 'overhead_allocation';
  }
  return 'expense_draft';
}

/**
 * Maps an ops cost snapshot (+ explicit overrides) to a CreateExpenseInput.
 * Never sets status - createExpense always inserts draft.
 */
export function mapOpsRecordToExpenseDraft(
  input: MapOpsRecordToExpenseDraftInput,
): CreateExpenseInput {
  const { snapshot } = input;
  const amount = (input.amount ?? snapshot.costAmount)?.trim();
  const currency = (input.currency ?? snapshot.currency)?.trim().toUpperCase();

  if (!amount) {
    throw new DomainRuleError(
      'Amount is required to create a linked expense',
      'opsFinance.errors.amountRequired',
    );
  }
  if (!currency || currency.length !== 3) {
    throw new DomainRuleError(
      'Currency is required to create a linked expense',
      'opsFinance.errors.currencyRequired',
    );
  }

  const projectId = input.projectId !== undefined ? input.projectId : snapshot.projectId;
  const vendorId = input.vendorId !== undefined ? input.vendorId : snapshot.vendorId;
  const costFamily =
    input.costFamily ?? defaultCostFamilyForOpsKind(snapshot.opsRecordKind, projectId);
  const description =
    (input.description?.trim() || snapshot.title || `Ops cost ${snapshot.opsRecordId}`).slice(
      0,
      2000,
    );
  const linkNote = `ops-finance:${snapshot.opsRecordKind}:${snapshot.opsRecordId}`;
  const notesParts = [input.notes?.trim() || snapshot.notes?.trim() || null, linkNote].filter(
    Boolean,
  );

  const draft: CreateExpenseInput = {
    amount,
    currency,
    description,
    expenseDate: input.expenseDate ?? snapshot.occurredOn ?? undefined,
    vendorId: vendorId ?? undefined,
    projectId: projectId ?? undefined,
    costFamily,
    notes: notesParts.join('\n').slice(0, 4000),
  };

  if (input.allocationPeriodStart) {
    draft.allocationPeriodStart = input.allocationPeriodStart;
  }
  if (input.allocationPeriodEnd) {
    draft.allocationPeriodEnd = input.allocationPeriodEnd;
  }
  if (input.allocationDriverMethod) {
    draft.allocationDriverMethod = input.allocationDriverMethod;
  }
  if (input.allocationScheduleMode) {
    draft.allocationScheduleMode = input.allocationScheduleMode;
  }
  if (input.allocationProjectIds?.length) {
    draft.allocationProjectIds = [...input.allocationProjectIds];
  }

  return draft;
}
