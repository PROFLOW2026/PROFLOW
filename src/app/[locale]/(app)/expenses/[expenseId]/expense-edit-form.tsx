'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import { decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';
import type { CostCategoryRow, ExpenseDetail, ProjectOption, VendorOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import type { AllocationDraft } from '@/modules/expenses/ui/allocation-editor';
import { expensePayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import { Link } from '@/shared/i18n/navigation';
import { updateExpenseAction, type ExpenseActionState } from '../actions';

export interface ExpenseEditFormProps {
  readonly expense: ExpenseDetail;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly vendors?: readonly VendorOption[];
}

function toServerUpdatedAt(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function ExpenseEditForm({
  expense,
  projects,
  categories,
  workPackages,
  vendors = [],
}: ExpenseEditFormProps) {
  const tCommon = useTranslations('common');
  const tOffline = useTranslations('offline');
  const serverUpdatedAt = toServerUpdatedAt(expense.updatedAt);

  const offlineSuccessState = useMemo<ExpenseActionState>(
    () => ({ offlineQueued: true }),
    [],
  );

  const wrappedAction = useOfflineAwareFormAction<ExpenseActionState>({
    kind: 'expense',
    onlineAction: updateExpenseAction,
    buildPayload: expensePayloadFromFormData,
    resolveServerMeta: (_formData, payload) => ({
      serverId: typeof payload.expenseId === 'string' ? payload.expenseId : expense.id,
      serverUpdatedAt,
    }),
    offlineSuccessState,
    missingOrgError: tOffline('errors.missingOrganization'),
  });

  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    wrappedAction,
    {},
  );

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

      {state.offlineQueued ? (
        <Alert tone="info" role="status">
          {tOffline('forms.draftSaved')}{' '}
          <Link href="/settings/offline-drafts" className="font-medium underline">
            {tOffline('banner.viewDrafts')}
          </Link>
        </Alert>
      ) : null}

      <ExpenseForm
        mode="edit"
        defaultCurrency={expense.grossAmount.currency}
        projects={projects}
        categories={categories}
        workPackages={workPackages}
        vendors={vendors}
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

      <Button type="submit" loading={pending}>
        {pending ? tCommon('states.saving') : tCommon('actions.save')}
      </Button>
    </form>
  );
}
