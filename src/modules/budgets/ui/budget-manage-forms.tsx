'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { MoneyInput } from '@/components/patterns/money-input';
import {
  createProjectBudgetAction,
  reviseProjectBudgetAction,
} from '@/app/[locale]/(app)/projects/budget-actions';

export function BudgetManageForms({
  projectId,
  budgetId,
  currency,
  mode,
}: {
  readonly projectId: string;
  readonly budgetId: string | null;
  readonly currency: string;
  readonly mode: 'create' | 'revise';
}) {
  const t = useTranslations('budgets');
  const tCommon = useTranslations('common');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          if (mode === 'create') {
            const result = await createProjectBudgetAction({
              projectId,
              totalBudgetAmount: amount || null,
              currency,
            });
            setMessage(result.error ?? t('actions.created'));
            return;
          }
          if (!budgetId) {
            setMessage(t('actions.missingBudget'));
            return;
          }
          const result = await reviseProjectBudgetAction({
            budgetId,
            projectId,
            reason: reason.trim() || t('actions.defaultRevisionReason'),
            totalBudgetAmount: amount || null,
          });
          setMessage(result.error ?? t('actions.revised'));
        });
      }}
    >
      <h3 className="text-sm font-semibold">
        {mode === 'create' ? t('actions.createTitle') : t('actions.reviseTitle')}
      </h3>
      <Field label={t('fields.totalBudget')}>
        {(controlProps) => (
          <MoneyInput
            {...controlProps}
            value={amount}
            onValueChange={setAmount}
            currencySymbol={currency}
          />
        )}
      </Field>
      {mode === 'revise' ? (
        <Field label={t('fields.revisionReason')}>
          {(controlProps) => (
            <input
              {...controlProps}
              className="w-full min-w-0 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3 py-2 text-sm"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          )}
        </Field>
      ) : null}
      <p className="text-xs text-[var(--pf-text-muted)]">{t('actions.lightweightHint')}</p>
      <Button type="submit" size="sm" loading={pending} className="self-start">
        {pending
          ? tCommon('states.saving')
          : mode === 'create'
            ? t('actions.create')
            : t('actions.revise')}
      </Button>
      {message ? <p className="text-xs text-[var(--pf-text-secondary)]">{message}</p> : null}
    </form>
  );
}
