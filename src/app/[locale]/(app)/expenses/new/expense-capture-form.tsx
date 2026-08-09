'use client';

import { useActionState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import type { CostCategoryRow, ProjectOption, VendorOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import { expensePayloadFromFormData } from '@/modules/offline/domain/payloads';
import { useOfflineAwareFormAction } from '@/modules/offline/ui/use-offline-aware-form-action';
import { Link } from '@/shared/i18n/navigation';
import { createExpenseAction, type ExpenseActionState } from '../actions';

export interface ExpenseCaptureFormProps {
  readonly defaultCurrency: string;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly vendors?: readonly VendorOption[];
  readonly initialProjectId?: string;
}

export function ExpenseCaptureForm({
  defaultCurrency,
  projects,
  categories,
  workPackages,
  vendors = [],
  initialProjectId,
}: ExpenseCaptureFormProps) {
  const tCommon = useTranslations('common');
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
          {tOffline('forms.draftSaved')}{' '}
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
        initialValues={{
          targeting: initialProjectId ?? '__none__',
          projectId: initialProjectId,
        }}
        error={state.error ?? null}
      />

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending
          ? tCommon('states.saving')
          : state.offlineQueued
            ? tOffline('forms.saveAnotherDraft')
            : tCommon('actions.save')}
      </Button>
    </form>
  );
}
