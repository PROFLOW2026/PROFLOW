'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link } from '@/shared/i18n/navigation';
import {
  createLinkedExpenseAction,
  type OpsFinanceFormState,
} from '@/app/[locale]/(app)/ops-finance/actions';
import type { OpsRecordKind } from '../domain/types';

export interface CreateLinkedExpenseFormProps {
  readonly opsRecordKind: OpsRecordKind;
  readonly opsRecordId: string;
  readonly namespace: 'assets' | 'compliance';
  readonly defaultAmount?: string | null;
  readonly defaultCurrency?: string | null;
  readonly defaultDescription?: string | null;
  readonly assetId?: string | null;
  readonly revalidatePath?: string;
  /** Show periodic overhead fields (insurance / recurring). */
  readonly showAllocationFields?: boolean;
  readonly compact?: boolean;
  readonly existingExpenseId?: string | null;
}

export function CreateLinkedExpenseForm({
  opsRecordKind,
  opsRecordId,
  namespace,
  defaultAmount,
  defaultCurrency,
  defaultDescription,
  assetId,
  revalidatePath,
  showAllocationFields = false,
  compact = false,
  existingExpenseId,
}: CreateLinkedExpenseFormProps) {
  const t = useTranslations(`${namespace}.financeLink`);
  const [state, formAction, pending] = useActionState<OpsFinanceFormState, FormData>(
    createLinkedExpenseAction,
    {},
  );

  if (existingExpenseId || state.expenseId) {
    const expenseId = state.expenseId ?? existingExpenseId!;
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--pf-text-secondary)]">{t('linkedDraft')}</span>
        <Link
          href={`/expenses/${expenseId}`}
          className="underline hover:text-[var(--pf-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
        >
          {t('openExpense')}
        </Link>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className={
        compact
          ? 'flex flex-col gap-2'
          : 'flex max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-3'
      }
    >
      <input type="hidden" name="opsRecordKind" value={opsRecordKind} />
      <input type="hidden" name="opsRecordId" value={opsRecordId} />
      {assetId ? <input type="hidden" name="assetId" value={assetId} /> : null}
      {revalidatePath ? <input type="hidden" name="revalidatePath" value={revalidatePath} /> : null}

      <p className="text-xs text-[var(--pf-text-secondary)]">{t('hint')}</p>

      {!compact || !defaultAmount ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`ops-amount-${opsRecordId}`}>{t('amountLabel')}</Label>
            <Input
              id={`ops-amount-${opsRecordId}`}
              name="amount"
              defaultValue={defaultAmount ?? ''}
              required={!defaultAmount}
              inputMode="decimal"
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`ops-currency-${opsRecordId}`}>{t('currencyLabel')}</Label>
            <Input
              id={`ops-currency-${opsRecordId}`}
              name="currency"
              defaultValue={defaultCurrency ?? ''}
              required={!defaultCurrency}
              maxLength={3}
              className="min-h-11 pf-ltr-island"
              dir="ltr"
            />
          </div>
        </div>
      ) : (
        <>
          <input type="hidden" name="amount" value={defaultAmount} />
          <input type="hidden" name="currency" value={defaultCurrency ?? ''} />
        </>
      )}

      {defaultDescription ? (
        <input type="hidden" name="description" value={defaultDescription} />
      ) : null}

      {showAllocationFields ? (
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-1 text-sm font-medium">{t('allocationTitle')}</legend>
          <input type="hidden" name="costFamily" value="business_overhead" />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`ops-alloc-start-${opsRecordId}`}>{t('periodStartLabel')}</Label>
            <Input
              id={`ops-alloc-start-${opsRecordId}`}
              name="allocationPeriodStart"
              type="date"
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`ops-alloc-end-${opsRecordId}`}>{t('periodEndLabel')}</Label>
            <Input
              id={`ops-alloc-end-${opsRecordId}`}
              name="allocationPeriodEnd"
              type="date"
              className="min-h-11"
            />
          </div>
          <p className="sm:col-span-2 text-xs text-[var(--pf-text-secondary)]">
            {t('allocationHint')}
          </p>
        </fieldset>
      ) : null}

      <Button type="submit" size="sm" variant="secondary" disabled={pending} className="min-h-11 w-fit">
        {pending ? t('pending') : t('create')}
      </Button>
      {state.error ? (
        <span role="alert" className="text-sm text-[var(--pf-status-danger-fg)]">
          {state.error}
        </span>
      ) : null}
      {state.success ? (
        <span className="text-sm text-[var(--pf-text-secondary)]">{t('success')}</span>
      ) : null}
    </form>
  );
}
