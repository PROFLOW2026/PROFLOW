'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import type { CostCategoryRow, InventoryItemOption, ProjectOption, VendorOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import { expensePayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import type { ApBillOverlapCandidate } from '@/modules/financials';
import type { SupplierBillReferenceRow } from '@/modules/expenses/domain/supplier-cost-guidance';
import type { PaymentInstrumentRow } from '@/modules/payment-instruments/domain/types';
import { Link } from '@/shared/i18n/navigation';
import { createExpenseAction, type ExpenseActionState } from '../actions';

export interface ExpenseCaptureFormProps {
  readonly defaultCurrency: string;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly vendors?: readonly VendorOption[];
  readonly paymentTerms?: readonly { readonly id: string; readonly name: string }[];
  readonly inventoryItems?: readonly InventoryItemOption[];
  readonly initialProjectId?: string;
  /** Org tax rule rate for live VAT preview - never hardcoded. */
  readonly taxRatePercent?: string | null;
  readonly apBillOverlapCandidates?: readonly ApBillOverlapCandidate[];
  readonly supplierBillReferences?: readonly SupplierBillReferenceRow[];
  readonly paymentInstruments?: readonly PaymentInstrumentRow[];
  readonly defaultToday?: string;
}

export function ExpenseCaptureForm({
  defaultCurrency,
  projects,
  categories,
  workPackages,
  vendors = [],
  paymentTerms = [],
  inventoryItems = [],
  initialProjectId,
  taxRatePercent = null,
  apBillOverlapCandidates = [],
  supplierBillReferences = [],
  paymentInstruments = [],
  defaultToday = '',
}: ExpenseCaptureFormProps) {
  const tCommon = useTranslations('common');
  const t = useTranslations('expenses');
  const tOffline = useTranslations('offline');

  const offlineSuccessState = useMemo<ExpenseActionState>(
    () => ({ offlineQueued: true }),
    [],
  );

  const wrappedAction = useOfflineAwareFormAction<ExpenseActionState>({
    kind: 'expense',
    onlineAction: createExpenseAction,
    buildPayload: expensePayloadFromFormData,
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

  return (
    <form action={formAction} className="flex flex-col gap-6">
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
        mode="create"
        defaultCurrency={defaultCurrency}
        projects={projects}
        categories={categories}
        workPackages={workPackages}
        vendors={vendors}
        paymentTerms={paymentTerms}
        inventoryItems={inventoryItems}
        taxRatePercent={taxRatePercent}
        apBillOverlapCandidates={apBillOverlapCandidates}
        supplierBillReferences={supplierBillReferences}
        paymentInstruments={paymentInstruments}
        defaultToday={defaultToday}
        initialValues={{
          targeting: initialProjectId ?? '__overhead__',
          projectId: initialProjectId,
          /** Default for new expenses: VAT-inclusive (`inclusive`). */
          vatMode: 'inclusive' as const,
        }}
        error={state.error ?? null}
        fieldErrors={state.fieldErrors}
      />

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
          {pending
            ? tCommon('states.saving')
            : state.offlineQueued
              ? tOffline('forms.saveAnotherDraft')
              : t('actions.saveAsDraft')}
        </Button>
      </div>
    </form>
  );
}
