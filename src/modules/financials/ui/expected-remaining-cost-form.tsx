'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/patterns/money-input';
import { setProjectExpectedRemainingCostAction } from '@/app/[locale]/(app)/projects/actions';

export function ExpectedRemainingCostForm({
  projectId,
  currency,
  initialAmount,
}: {
  readonly projectId: string;
  readonly currency: string;
  readonly initialAmount: string;
}) {
  const t = useTranslations('financial');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState(initialAmount === '0' || initialAmount === '0.000000' ? '' : initialAmount);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await setProjectExpectedRemainingCostAction(projectId, amount || null);
          setMessage(result.error ?? t('kpis.expectedRemainingSaved'));
        });
      }}
    >
      <Field label={t('kpis.expectedRemaining')}>
        {(controlProps) => (
          <MoneyInput
            {...controlProps}
            value={amount}
            onValueChange={setAmount}
            currencySymbol={currency}
          />
        )}
      </Field>
      <p className="text-xs text-[var(--pf-text-muted)]">{t('kpis.expectedRemainingHint')}</p>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        {pending ? tCommon('states.saving') : tCommon('actions.save')}
      </Button>
      {message ? <p className="text-xs text-[var(--pf-text-secondary)]">{message}</p> : null}
    </form>
  );
}
