'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ExpenseForm } from '@/modules/expenses/ui/expense-form';
import type { CostCategoryRow, ProjectOption, WorkPackageOption } from '@/modules/expenses/domain/types';
import { createExpenseAction, type ExpenseActionState } from '../actions';

export interface ExpenseCaptureFormProps {
  readonly defaultCurrency: string;
  readonly projects: readonly ProjectOption[];
  readonly categories: readonly CostCategoryRow[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly initialProjectId?: string;
}

export function ExpenseCaptureForm({
  defaultCurrency,
  projects,
  categories,
  workPackages,
  initialProjectId,
}: ExpenseCaptureFormProps) {
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ExpenseActionState, FormData>(
    createExpenseAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <ExpenseForm
        mode="create"
        defaultCurrency={defaultCurrency}
        projects={projects}
        categories={categories}
        workPackages={workPackages}
        initialValues={{
          targeting: initialProjectId ?? '__none__',
          projectId: initialProjectId,
        }}
        error={state.error ?? null}
      />

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? tCommon('states.saving') : tCommon('actions.save')}
      </Button>
    </form>
  );
}
