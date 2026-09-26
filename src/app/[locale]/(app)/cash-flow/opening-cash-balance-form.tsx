'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatMoneyAmountForInput, MoneyInput } from '@/components/patterns/money-input';
import {
  saveOpeningCashBalanceAction,
  type OpeningCashActionState,
} from '@/app/[locale]/(app)/cash-flow/actions';

export function OpeningCashBalanceForm({
  currency,
  initialAmount,
  initialAsOf,
  canEdit,
}: {
  readonly currency: string;
  readonly initialAmount: string | null;
  readonly initialAsOf: string | null;
  readonly canEdit: boolean;
}) {
  const t = useTranslations('financial.cashFlowForecast');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState(
    initialAmount ? formatMoneyAmountForInput(initialAmount, currency) : '',
  );
  const [asOf, setAsOf] = useState(initialAsOf ?? '');
  const [state, action, pending] = useActionState(
    saveOpeningCashBalanceAction,
    {} as OpeningCashActionState,
  );

  return (
    <form action={action} className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold">{t('openingTitle')}</h2>
        <p className="mt-0.5 break-words text-xs text-[var(--pf-text-secondary)]">{t('openingHint')}</p>
      </div>
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="asOf" value={asOf} />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('openingAmount')}>
          {(controlProps) => (
            <MoneyInput
              {...controlProps}
              value={amount}
              onValueChange={setAmount}
              currency={currency}
              currencySymbol={currency}
              disabled={!canEdit}
            />
          )}
        </Field>
        <Field label={t('openingAsOf')}>
          {(controlProps) => (
            <Input
              {...controlProps}
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              disabled={!canEdit}
            />
          )}
        </Field>
      </div>
      {!canEdit ? (
        <p className="text-xs text-[var(--pf-text-muted)]">{t('openingReadOnly')}</p>
      ) : (
        <Button type="submit" size="sm" loading={pending} className="self-start">
          {pending ? tCommon('states.saving') : tCommon('actions.save')}
        </Button>
      )}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      {state.ok ? <p className="text-xs text-[var(--pf-text-secondary)]">{t('openingSaved')}</p> : null}
    </form>
  );
}
