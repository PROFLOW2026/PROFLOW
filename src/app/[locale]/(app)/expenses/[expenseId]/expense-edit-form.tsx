'use client';

import { useActionState, useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BusinessChangeFormDialogs } from '@/components/patterns/business-change-form-dialogs';
import { useBusinessChangeFormSubmit } from '@/shared/business-change/use-business-change-form-submit';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExpenseForm, type ExpenseFormValues } from '@/modules/expenses/ui/expense-form';
import { decodeRecurrenceRule } from '@/modules/expenses/domain/recurrence';
import { inferExpenseTaxModeFromAmounts } from '@/modules/expenses/domain/tax';
import type {
  AllocationMethod,
  CostCategoryRow,
  ExpenseDetail,
  InventoryItemOption,
  ProjectOption,
  VendorOption,
  WorkPackageOption,
} from '@/modules/expenses/domain/types';
import type { PaymentInstrumentRow } from '@/modules/payment-instruments/domain/types';
import type { SupplierBillReferenceRow } from '@/modules/expenses/domain/supplier-cost-guidance';
import type { AllocationDraft } from '@/modules/expenses/ui/allocation-editor';
import { expensePayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import { Link } from '@/shared/i18n/navigation';
import {
  previewSimilarExpensesAction,
  updateExpenseAction,
  type ExpenseActionState,
} from '../actions';

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
  readonly savedConfirmation?: boolean;
  readonly recordedPayment?: boolean;
  readonly returnTo?: string | null;
  readonly detailPath?: string;
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
  savedConfirmation = false,
  recordedPayment = false,
  returnTo = null,
  detailPath,
}: ExpenseEditFormProps) {
  const t = useTranslations('expenses');
  const locale = useLocale();
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
  const baseInitialValues = useMemo(
    () => {
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

      return {
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
        allocationDriverMethod: (expense.allocationDriverMethod ?? '') as AllocationMethod | '',
        allocationPeriodStart: expense.allocationPeriodStart ?? '',
        allocationPeriodEnd: expense.allocationPeriodEnd ?? '',
        allocationScheduleMode: expense.allocationScheduleMode ?? '',
        allocationIntent: expense.projectId
          ? 'project_allocate'
          : expense.allocationIntent ??
            (allocations.some((line) => line.targetType === 'project' && line.projectId)
              ? 'project_allocate'
              : 'auto_pool'),
        installmentCount: String(expense.installmentCount ?? 1),
        installmentStartDate: expense.installmentStartDate ?? expense.expenseDate,
        cashInstallmentSchedule: expense.cashInstallmentSchedule,
        installmentsPaidCount: expense.installmentsPaidCount ?? 0,
        automaticInstallmentPayment: expense.automaticInstallmentPayment,
        inventoryStockPurchase: expense.inventoryStockPurchase,
        inventoryItemId: expense.inventoryItemId ?? '',
        inventoryPurchaseQty: expense.inventoryPurchaseQty ?? '',
      } satisfies Partial<ExpenseFormValues>;
    },
    [defaultToday, expense, recurrence.cadence, recurrence.customLabel, taxMode],
  );

  const formInitialValues = useMemo(
    () => (state.formValues ? { ...baseInitialValues, ...state.formValues } : baseInitialValues),
    [baseInitialValues, state.formValues],
  );

  const formRestoreKey = state.formValues
    ? `preserved-${JSON.stringify(state.formValues)}`
    : expense.id;

  const formId = `expense-edit-${expense.id}`;
  const isFinalizedEdit = expense.status === 'finalized';
  const [draftAmount, setDraftAmount] = useState(taxMode.amount);
  const [draftDate, setDraftDate] = useState<string>(expense.expenseDate);

  const businessChange = useBusinessChangeFormSubmit({
    enabled: isFinalizedEdit,
    alwaysConfirm: true,
    formId,
    buildChanges: (): BusinessChangeFieldDiff[] => {
      const rows: BusinessChangeFieldDiff[] = [];
      if (draftDate !== expense.expenseDate) {
        rows.push({
          fieldLabel: t('fields.date'),
          before: formatBusinessDate(businessDate(expense.expenseDate), locale),
          after: formatBusinessDate(businessDate(draftDate), locale),
        });
      }
      if (draftAmount.trim() && draftAmount !== taxMode.amount) {
        rows.push({
          fieldLabel: t('fields.amount'),
          before: expense.grossAmount.amount,
          after: draftAmount,
        });
      }
      return rows;
    },
    findSimilar: isFinalizedEdit
      ? async () => {
          const form = document.getElementById(formId) as HTMLFormElement | null;
          const vendorField = form?.querySelector<HTMLInputElement>('input[name="vendorId"]');
          const vendorIdRaw = vendorField?.value?.trim() || expense.vendorId;
          const matches = await previewSimilarExpensesAction({
            expenseId: expense.id,
            expenseDate: draftDate,
            grossAmount: draftAmount || expense.grossAmount.amount,
            vendorId: vendorIdRaw || null,
          });
          return matches.map((match) => ({
            id: match.id,
            href: `/expenses/${match.id}`,
            title: match.description?.trim() || t('detail.title'),
            reason: t('retroactiveEdit.duplicateReason', {
              date: match.expenseDate,
              amount: match.grossAmount,
            }),
          }));
        }
      : undefined,
  });

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    if (!isFinalizedEdit) return;
    businessChange.handleFormSubmit(event);
  }

  return (
    <>
    <form
      id={formId}
      action={formAction}
      onSubmit={handleFormSubmit}
      className="flex flex-col gap-6"
    >
      <input type="hidden" name="expenseId" value={expense.id} />
      {detailPath ? <input type="hidden" name="detailPath" value={detailPath} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {isFinalizedEdit ? <input type="hidden" name="changeAcknowledged" value="false" /> : null}

      {savedConfirmation ? (
        <Alert tone="success" role="status">
          {t('detail.editSaved')}
        </Alert>
      ) : null}

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
        key={formRestoreKey}
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
        initialValues={formInitialValues}
        error={state.error ?? null}
        fieldErrors={state.fieldErrors}
        recordedPayment={recordedPayment}
        onAmountChange={isFinalizedEdit ? setDraftAmount : undefined}
        onExpenseDateChange={isFinalizedEdit ? (date) => setDraftDate(date) : undefined}
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
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          {pending ? tCommon('states.saving') : t('actions.saveChanges')}
        </Button>
      )}
    </form>
    {isFinalizedEdit ? (
      <BusinessChangeFormDialogs
        confirmOpen={businessChange.confirmOpen}
        setConfirmOpen={businessChange.setConfirmOpen}
        duplicateOpen={businessChange.duplicateOpen}
        setDuplicateOpen={businessChange.setDuplicateOpen}
        pending={pending || businessChange.similarLoading}
        changes={businessChange.changes}
        similarMatches={businessChange.similarMatches}
        confirmTitle={t('retroactiveEdit.confirmTitle')}
        confirmDescription={t('retroactiveEdit.confirmDescription')}
        duplicateTitle={t('retroactiveEdit.duplicateTitle')}
        duplicateDescription={t('retroactiveEdit.duplicateDescription')}
        onConfirm={businessChange.submitConfirmed}
        onBackToEdit={() => businessChange.setConfirmOpen(false)}
        onContinuePastDuplicate={businessChange.continuePastDuplicate}
      />
    ) : null}
    </>
  );
}
