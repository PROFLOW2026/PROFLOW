'use client';

import { useActionState, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { draftAmountExceedsContractCurrent } from '@/modules/billing/domain/draft-rules';
import {
  readBusinessChangeAcknowledged,
  setBusinessChangeAcknowledged,
} from '@/shared/business-change/form-ack';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { formatMoneyString } from '@/shared/money/format';
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
  readonly locale: string;
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
  issueDate: initialIssueDate,
  dueDate: initialDueDate,
  reference,
  notes,
  locale,
  contractCurrentAmount,
}: DraftBillingEditFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [amount, setAmount] = useState(initialAmount);
  const [issueDate, setIssueDate] = useState(initialIssueDate);
  const [dueDate, setDueDate] = useState(initialDueDate ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    updateBillingRecordAction.bind(null, billingRecordId),
    {},
  );
  const overContract = draftAmountExceedsContractCurrent(amount, contractCurrentAmount);
  const formError = draftErrorMessage(state.error, t, tErrors);

  const changeDiffs = useMemo((): BusinessChangeFieldDiff[] => {
    const rows: BusinessChangeFieldDiff[] = [];
    if (amount !== initialAmount) {
      rows.push({
        fieldLabel: t('form.amount'),
        before: formatMoneyString(initialAmount, currency, locale),
        after: formatMoneyString(amount, currency, locale),
      });
    }
    if (issueDate !== initialIssueDate) {
      rows.push({
        fieldLabel: t('list.issueDate'),
        before: formatBusinessDate(businessDate(initialIssueDate), locale),
        after: formatBusinessDate(businessDate(issueDate), locale),
      });
    }
    if ((dueDate || null) !== (initialDueDate ?? null)) {
      rows.push({
        fieldLabel: t('detail.dueDate'),
        before: initialDueDate ? formatBusinessDate(businessDate(initialDueDate), locale) : '—',
        after: dueDate ? formatBusinessDate(businessDate(dueDate), locale) : '—',
      });
    }
    return rows;
  }, [amount, currency, dueDate, initialAmount, initialDueDate, initialIssueDate, issueDate, locale, t]);

  const hasChanges = changeDiffs.length > 0;

  function handleSaveClick(event: FormEvent<HTMLFormElement>) {
    if (readBusinessChangeAcknowledged(event.currentTarget)) {
      return;
    }
    event.preventDefault();
    if (!hasChanges) return;
    setConfirmOpen(true);
  }

  function submitConfirmed() {
    const form = document.getElementById(`draft-billing-edit-${billingRecordId}`) as HTMLFormElement | null;
    if (!form) return;
    setBusinessChangeAcknowledged(form);
    setConfirmOpen(false);
    form.requestSubmit();
  }

  return (
    <>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-start">{t('draft.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            id={`draft-billing-edit-${billingRecordId}`}
            action={formAction}
            onSubmit={handleSaveClick}
            className="flex w-full min-w-0 flex-col gap-4"
          >
            <input type="hidden" name="changeAcknowledged" value="false" />
            <Alert tone="info">{t('draft.notTaxInvoice')}</Alert>
            {overContract ? <Alert tone="warning">{t('draft.overContract')}</Alert> : null}
            {formError ? <Alert tone="danger">{formError}</Alert> : null}
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="reference" value={reference ?? ''} />
            <input type="hidden" name="notes" value={notes ?? ''} />
            <MainAppFormGrid dense>
              <Field label={t('form.amount')} required error={state.fieldErrors?.amount} className={mainAppFieldSpan.lg}>
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
              <Field label={t('list.issueDate')} required error={state.fieldErrors?.issueDate} className={mainAppFieldSpan.md}>
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="issueDate"
                    required
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                  />
                )}
              </Field>
              <Field
                label={t('detail.dueDate')}
                optionalLabel={tCommon('labels.optional')}
                error={state.fieldErrors?.dueDate}
                className={mainAppFieldSpan.md}
              >
                {(control) => (
                  <Input
                    {...control}
                    type="date"
                    name="dueDate"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                )}
              </Field>
            </MainAppFormGrid>
            <Button type="submit" disabled={pending || !amount || !hasChanges}>
              {t('draft.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('draft.confirmTitle')}
        description={t('draft.confirmDescription')}
        changes={changeDiffs}
        impacts={[]}
        pending={pending}
        onConfirm={submitConfirmed}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </>
  );
}
