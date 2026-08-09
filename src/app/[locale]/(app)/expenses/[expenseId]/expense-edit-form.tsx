'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import { decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';
import type { CostCategoryRow, ExpenseDetail, ProjectOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import type { AllocationDraft } from '@/modules/expenses/ui/allocation-editor';
import { updateExpenseAction, type ExpenseActionState } from '../actions';

export interface ExpenseEditFormProps {
  readonly expense: ExpenseDetail;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
}

export function ExpenseEditForm({ expense, projects, categories, workPackages }: ExpenseEditFormProps) {
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(updateExpenseAction, {});

  const recurrence = decodeRecurrenceRule(expense.recurrenceRule);
  const allocations: AllocationDraft[] = expense.allocations.map((line) => ({
    targetType: line.targetType,
    projectId: line.projectId,
    workPackageId: line.workPackageId,
    costCategoryId: line.costCategoryId,
    method: line.method,
    amount: line.amount.amount,
    percent: line.percent ?? '',
    notes: line.notes ?? '',
    sortOrder: line.sortOrder,
  }));

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="expenseId" value={expense.id} />

      <ExpenseForm
        mode="edit"
        defaultCurrency={expense.grossAmount.currency}
        projects={projects}
        categories={categories}
        workPackages={workPackages}
        initialValues={{
          amount: expense.grossAmount.amount.replace(/^-/, ''),
          currency: expense.grossAmount.currency,
          description: expense.description ?? '',
          expenseDate: expense.expenseDate,
          supplierName: expense.supplierName ?? '',
          vendorId: expense.vendorId ?? '',
          targeting: expense.projectId ?? '__overhead__',
          projectId: expense.projectId ?? '',
          workPackageId: expense.workPackageId ?? '',
          costFamily: expense.costFamily,
          costCategoryId: expense.costCategoryId ?? '',
          netAmount: expense.netAmount.amount.replace(/^-/, ''),
          taxAmount: expense.taxAmount?.amount.replace(/^-/, '') ?? '',
          paymentMethod: expense.paymentMethod ?? '',
          notes: expense.notes ?? '',
          recurrenceCadence: recurrence.cadence,
          recurrenceCustomLabel: recurrence.customLabel ?? '',
          allocations,
        }}
        error={state.error ?? null}
      />

      <Button type="submit" disabled={pending}>
        {pending ? tCommon('states.saving') : tCommon('actions.save')}
      </Button>
    </form>
  );
}
