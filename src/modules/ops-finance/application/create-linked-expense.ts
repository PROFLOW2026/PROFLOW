import { createExpense } from '@/modules/expenses';
import type { CreateExpenseInput } from '@/modules/expenses';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findActiveLinkForOpsRecordRow,
  insertOpsExpenseLinkRow,
} from '../data/ops-expense-links';
import {
  mapOpsRecordToExpenseDraft,
  resolveOpsLinkPurpose,
} from '../domain/map-to-expense';
import { assertOpsRecordKindLinkable } from '../domain/rules';
import type { OpsExpenseLink } from '../domain/types';
import {
  createLinkedExpenseSchema,
  type CreateLinkedExpenseInput,
} from '../validation/schemas';
import { loadOpsRecordCostSnapshot } from './load-ops-snapshot';

export type CreateExpenseFn = (
  context: OrgContext,
  input: CreateExpenseInput,
) => Promise<{ id: string; status: string }>;

export interface CreateLinkedExpenseResult {
  readonly link: OpsExpenseLink;
  readonly expenseId: string;
  /** Always draft from createExpense — never silently finalized. */
  readonly expenseStatus: string;
  readonly expenseInput: CreateExpenseInput;
}

/**
 * Explicit user action: create an Expense draft linked to an ops record.
 * Does not finalize. Does not invent Actual from ops cost metadata alone.
 */
export async function createLinkedExpenseFromOpsRecord(
  context: OrgContext,
  raw: CreateLinkedExpenseInput,
  deps: { createExpense?: CreateExpenseFn } = {},
): Promise<CreateLinkedExpenseResult> {
  assertPermission(context, PERMISSIONS.EXPENSES_CREATE);

  const parsed = createLinkedExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;
  assertOpsRecordKindLinkable(input.opsRecordKind);

  const existing = await findActiveLinkForOpsRecordRow(
    context,
    input.opsRecordKind,
    input.opsRecordId,
  );
  if (existing) {
    throw new DomainRuleError(
      'This operational record already has a linked expense',
      'opsFinance.errors.alreadyLinked',
    );
  }

  const snapshot = await loadOpsRecordCostSnapshot(
    context,
    input.opsRecordKind,
    input.opsRecordId,
  );

  const expenseInput = mapOpsRecordToExpenseDraft({
    snapshot,
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    costFamily: input.costFamily,
    projectId: input.projectId,
    vendorId: input.vendorId,
    expenseDate: input.expenseDate,
    notes: input.notes,
    allocationPeriodStart: input.allocationPeriodStart,
    allocationPeriodEnd: input.allocationPeriodEnd,
    allocationDriverMethod: input.allocationDriverMethod,
    allocationScheduleMode: input.allocationScheduleMode,
    allocationProjectIds: input.allocationProjectIds,
    linkPurpose: input.linkPurpose,
  });

  const create = deps.createExpense ?? createExpense;
  const created = await create(context, expenseInput);

  if (created.status && created.status !== 'draft') {
    throw new DomainRuleError(
      'Ops→finance bridge must create draft expenses only',
      'opsFinance.errors.mustBeDraft',
    );
  }

  const link = await insertOpsExpenseLinkRow(context, {
    organizationId: context.organizationId,
    opsRecordKind: input.opsRecordKind,
    opsRecordId: input.opsRecordId,
    expenseId: created.id,
    linkPurpose: resolveOpsLinkPurpose({
      snapshot,
      allocationDriverMethod: input.allocationDriverMethod,
      allocationPeriodStart: input.allocationPeriodStart,
      allocationPeriodEnd: input.allocationPeriodEnd,
      linkPurpose: input.linkPurpose,
    }),
    createdByUserId: context.userId,
  });

  return {
    link,
    expenseId: created.id,
    expenseStatus: created.status ?? 'draft',
    expenseInput,
  };
}
