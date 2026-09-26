'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createAdjustmentAction, type BillingFormState } from './actions';

function resolveBillingMessage(
  key: string,
  tBilling: ReturnType<typeof useTranslations<'billing'>>,
  tErrors: ReturnType<typeof useTranslations<'errors'>>,
): string {
  if (key.startsWith('billing.')) {
    return tBilling(key.slice('billing.'.length));
  }
  if (key.startsWith('errors.')) {
    return tErrors(key.slice('errors.'.length));
  }
  return key;
}

export function IssueCreditNoteForm({
  billingRecordId,
  currency,
  defaultIssueDate,
}: {
  readonly billingRecordId: string;
  readonly currency: string;
  readonly defaultIssueDate: string;
}) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [amount, setAmount] = useState('');
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    createAdjustmentAction.bind(null, billingRecordId),
    {},
  );

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start">{t('creditNote.title')}</CardTitle>
      </CardHeader>
      <CardContent className="text-start">
        <form action={formAction} className="flex flex-col gap-4">
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('creditNote.description')}</p>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('creditNote.listHint')}</p>
          {state.error ? (
            <p className="text-sm text-[var(--pf-status-danger-fg)]">
              {resolveBillingMessage(state.error, t, tErrors)}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('creditNote.amount')} required>
              {(control) => (
                <>
                  <MoneyInput
                    {...control}
                    value={amount}
                    onValueChange={setAmount}
                    currency={currency}
                  />
                  <input type="hidden" name="amount" value={amount} />
                </>
              )}
            </Field>
            <Field label={t('creditNote.issueDate')} required>
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  name="issueDate"
                  required
                  defaultValue={defaultIssueDate}
                />
              )}
            </Field>
          </div>
          <Field label={t('creditNote.notes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Textarea {...control} name="notes" rows={2} />}
          </Field>
          <div>
            <Button type="submit" disabled={pending || amount.trim().length === 0}>
              {t('creditNote.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
