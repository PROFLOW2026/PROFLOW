'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { draftAmountExceedsContractCurrent } from '@/modules/billing/domain/draft-rules';
import { updateBillingRecordAction, type BillingFormState } from './actions';

interface DraftBillingEditFormProps {
  readonly billingRecordId: string;
  readonly projectId: string;
  readonly currency: string;
  readonly initialAmount: string;
  readonly issueDate: string;
  readonly dueDate: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  /** Current contract value for the linked contract. Warning only. */
  readonly contractCurrentAmount: string | null;
}

function draftErrorMessage(
  key: string | undefined,
  tBilling: ReturnType<typeof useTranslations<'billing'>>,
  tErrors: ReturnType<typeof useTranslations<'errors'>>,
): string | null {
  if (!key) return null;
  if (key.startsWith('billing.')) return tBilling(key.slice('billing.'.length));
  if (key.startsWith('errors.')) return tErrors(key.slice('errors.'.length));
  return tErrors('validationFailed');
}

export function DraftBillingEditForm({
  billingRecordId,
  projectId,
  currency,
  initialAmount,
  issueDate,
  dueDate,
  reference,
  notes,
  contractCurrentAmount,
}: DraftBillingEditFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [amount, setAmount] = useState(initialAmount);
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    updateBillingRecordAction.bind(null, billingRecordId),
    {},
  );
  const overContract = draftAmountExceedsContractCurrent(amount, contractCurrentAmount);
  const formError = draftErrorMessage(state.error, t, tErrors);

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start">{t('draft.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex max-w-xl flex-col gap-4">
          <Alert tone="info">{t('draft.notTaxInvoice')}</Alert>
          {overContract ? <Alert tone="warning">{t('draft.overContract')}</Alert> : null}
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="reference" value={reference ?? ''} />
          <input type="hidden" name="notes" value={notes ?? ''} />
          <Field label={t('form.amount')} required error={state.fieldErrors?.amount}>
            {(control) => (
              <>
                <MoneyInput
                  {...control}
                  required
                  value={amount}
                  onValueChange={setAmount}
                  currency={currency}
                />
                <input type="hidden" name="amount" value={amount} />
              </>
            )}
          </Field>
          <Field label={t('list.issueDate')} required error={state.fieldErrors?.issueDate}>
            {(control) => (
              <Input {...control} type="date" name="issueDate" required defaultValue={issueDate} />
            )}
          </Field>
          <Field
            label={t('detail.dueDate')}
            optionalLabel={tCommon('labels.optional')}
            error={state.fieldErrors?.dueDate}
          >
            {(control) => (
              <Input {...control} type="date" name="dueDate" defaultValue={dueDate ?? ''} />
            )}
          </Field>
          <Button type="submit" disabled={pending || !amount}>
            {t('draft.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
