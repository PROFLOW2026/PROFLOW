'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import { decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';
import { inferExpenseTaxModeFromAmounts } from '@/modules/expenses/domain/tax';
import type { CostCategoryRow, ExpenseDetail, InventoryItemOption, ProjectOption, VendorOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import type { PaymentInstrumentRow } from '@/modules/payment-instruments/domain/types';
import type { SupplierBillReferenceRow } from '@/modules/expenses/domain/supplier-cost-guidance';
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
  readonly inventoryItems?: readonly InventoryItemOption[];
  readonly paymentInstruments?: readonly PaymentInstrumentRow[];
  readonly supplierBillReferences?: readonly SupplierBillReferenceRow[];
  readonly defaultToday?: string;
  readonly taxRatePercent?: string | null;
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
  inventoryItems = [],
  paymentInstruments = [],
  supplierBillReferences = [],
  defaultToday = '',
  taxRatePercent = null,
}: ExpenseEditFormProps) {
  const t = useTranslations('expenses');
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
    buildOfflineSuccessState: (formData) => ({
      offlineQueued: true,
      pendingApproveSync: formData.get('finalizeOnCreate') === 'true',
    }),
    missingOrgError: tOffline('errors.missingOrganization'),
  });

  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    wrappedAction,
    {},
  );

  const recurrence = decodeRecurrenceRule(expense.recurrenceRule);
  const taxMode = inferExpenseTaxModeFromAmounts({
    netAmount: expense.netAmount.amount,
    taxAmount: expense.taxAmount?.amount ?? null,
    grossAmount: expense.grossAmount.amount,
    vatMode: expense.vatMode,
    taxSnapshot: expense.taxSnapshot,
  });
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
          {state.pendingApproveSync
            ? tOffline('forms.approvePendingSync')
            : tOffline('forms.draftSaved')}{' '}
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
        inventoryItems={inventoryItems}
        paymentInstruments={paymentInstruments}
        supplierBillReferences={supplierBillReferences}
        defaultToday={defaultToday}
        taxRatePercent={taxRatePercent}
        initialValues={{
          amount: taxMode.amount,
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
          amountIncludesTax: taxMode.amountIncludesTax,
          vatMode: taxMode.vatMode,
          // Leave advanced overrides empty so re-save uses the tax engine + mode.
          netAmount: '',
          taxAmount: '',
          paymentMethod: expense.paymentMethod ?? '',
          paymentInstrumentId: expense.paymentInstrumentId ?? '',
          markPaid: Boolean(expense.paidAt && expense.paymentStatus === 'paid'),
          paidAt: expense.paidAt ?? defaultToday,
          paymentTermId: expense.paymentTermId ?? '',
          dueDate: expense.dueDate ?? '',
          notes: expense.notes ?? '',
          recurrenceCadence: recurrence.cadence,
          recurrenceCustomLabel: recurrence.customLabel ?? '',
          allocations,
          allocationDriverMethod: expense.allocationDriverMethod ?? '',
          allocationPeriodStart: expense.allocationPeriodStart ?? '',
          allocationPeriodEnd: expense.allocationPeriodEnd ?? '',
          allocationScheduleMode: expense.allocationScheduleMode ?? '',
          allocationIntent: expense.allocationIntent ?? 'auto_pool',
          installmentCount: String(expense.installmentCount ?? 1),
          installmentStartDate: expense.installmentStartDate ?? expense.expenseDate,
          cashInstallmentSchedule: expense.cashInstallmentSchedule,
          installmentsPaidCount: expense.installmentsPaidCount ?? 0,
          automaticInstallmentPayment: expense.automaticInstallmentPayment,
          inventoryStockPurchase: expense.inventoryStockPurchase,
          inventoryItemId: expense.inventoryItemId ?? '',
          inventoryPurchaseQty: expense.inventoryPurchaseQty ?? '',
        }}
        error={state.error ?? null}
        fieldErrors={state.fieldErrors}
      />

      {expense.status === 'draft' ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            name="finalizeOnCreate"
            value="true"
            size="lg"
            loading={pending}
            className="w-full sm:flex-1"
          >
            {pending ? tCommon('states.saving') : t('actions.saveAndApprove')}
          </Button>
          <Button
            type="submit"
            variant="secondary"
            size="lg"
            loading={pending}
            className="w-full sm:flex-1"
          >
            {pending ? tCommon('states.saving') : t('actions.saveAsDraft')}
          </Button>
        </div>
      ) : (
        <Button type="submit" loading={pending}>
          {pending ? tCommon('states.saving') : t('actions.saveChanges')}
        </Button>
      )}
    </form>
  );
}
