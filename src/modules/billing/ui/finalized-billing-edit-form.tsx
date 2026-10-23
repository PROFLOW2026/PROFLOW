'use client';

import { useActionState, useMemo, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { DuplicateRecordWarningDialog } from '@/components/patterns/duplicate-record-warning-dialog';
import { MainAppFormGrid, mainAppFieldSpan } from '@/components/patterns/main-app';
import { MoneyInput } from '@/components/patterns/money-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { yearMonthFromBusinessDate } from '@/modules/month-close/domain/year-month';
import {
  isolateYearMonthForDisplay,
  readBusinessChangeAcknowledged,
  setBusinessChangeAcknowledged,
} from '@/shared/business-change/form-ack';
import type { BusinessChangeFieldDiff, BusinessChangeImpactLine } from '@/shared/business-change/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { formatMoneyString } from '@/shared/money/format';
import {
  editFinalizedBillingRecordAction,
  previewSimilarBillingRecordsAction,
  type BillingFormState,
} from './actions';

interface FinalizedBillingEditFormProps {
  readonly billingRecordId: string;
  readonly projectId: string | null;
  readonly clientId: string | null;
  readonly currency: string;
  readonly vatMode: string | null;
  readonly initialAmount: string;
  readonly subtotalAmount: string;
  readonly totalAmount: string;
  readonly issueDate: string;
  readonly dueDate: string | null;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly hasIssuedStatutoryDocument: boolean;
  readonly locale: string;
}

function billingErrorMessage(
  key: string | undefined,
  tBilling: ReturnType<typeof useTranslations<'billing'>>,
  tErrors: ReturnType<typeof useTranslations<'errors'>>,
): string | null {
  if (!key) return null;
  if (key.startsWith('billing.')) return tBilling(key.slice('billing.'.length));
  if (key.startsWith('errors.')) return tErrors(key.slice('errors.'.length));
  return tErrors('validationFailed');
}

export function FinalizedBillingEditForm({
  billingRecordId,
  projectId,
  clientId,
  currency,
  vatMode,
  initialAmount,
  subtotalAmount,
  totalAmount: initialTotalAmount,
  issueDate: initialIssueDate,
  dueDate: initialDueDate,
  reference: initialReference,
  notes: initialNotes,
  hasIssuedStatutoryDocument,
  locale,
}: FinalizedBillingEditFormProps) {
  const t = useTranslations('billing');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [amount, setAmount] = useState(initialAmount);
  const [issueDate, setIssueDate] = useState(initialIssueDate);
  const [dueDate, setDueDate] = useState(initialDueDate ?? '');
  const [reference, setReference] = useState(initialReference ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarMatches, setSimilarMatches] = useState<
    Awaited<ReturnType<typeof previewSimilarBillingRecordsAction>>
  >([]);

  const [state, formAction, pending] = useActionState<BillingFormState, FormData>(
    editFinalizedBillingRecordAction.bind(null, billingRecordId),
    {},
  );

  const formError = billingErrorMessage(state.error, t, tErrors);

  const previewSubtotalAmount = useMemo(() => {
    if (amount === initialAmount) return subtotalAmount;
    if (vatMode === 'inclusive' && Number(initialTotalAmount) > 0) {
      return String((Number(amount) * Number(subtotalAmount)) / Number(initialTotalAmount));
    }
    return amount;
  }, [amount, initialAmount, initialTotalAmount, subtotalAmount, vatMode]);

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
    if ((reference.trim() || null) !== (initialReference?.trim() || null)) {
      rows.push({
        fieldLabel: t('list.reference'),
        before: initialReference?.trim() || '—',
        after: reference.trim() || '—',
      });
    }
    if ((notes.trim() || null) !== (initialNotes?.trim() || null)) {
      rows.push({
        fieldLabel: t('form.notes'),
        before: initialNotes?.trim() || '—',
        after: notes.trim() || '—',
      });
    }
    return rows;
  }, [
    amount,
    currency,
    dueDate,
    initialAmount,
    initialDueDate,
    initialIssueDate,
    initialNotes,
    initialReference,
    issueDate,
    locale,
    notes,
    reference,
    t,
  ]);

  const impactLines = useMemo((): BusinessChangeImpactLine[] => {
    const lines: BusinessChangeImpactLine[] = [];
    if (issueDate !== initialIssueDate) {
      lines.push({
        label: t('retroactiveEdit.invoicedMonthImpact'),
        detail: t('retroactiveEdit.invoicedMonthShift', {
          from: isolateYearMonthForDisplay(yearMonthFromBusinessDate(initialIssueDate)),
          to: isolateYearMonthForDisplay(yearMonthFromBusinessDate(issueDate)),
        }),
      });
    }
    if (amount !== initialAmount) {
      lines.push({
        label: t('retroactiveEdit.amountImpact'),
        detail: t('retroactiveEdit.amountImpactDetail'),
      });
    }
    if (hasIssuedStatutoryDocument) {
      lines.push({
        label: t('retroactiveEdit.statutoryImpact'),
        detail:
          amount !== initialAmount || issueDate !== initialIssueDate
            ? t('retroactiveEdit.statutoryInternalAmountDate')
            : t('retroactiveEdit.statutoryUnchanged'),
      });
    }
    return lines;
  }, [amount, hasIssuedStatutoryDocument, initialAmount, initialIssueDate, issueDate, t]);

  const hasChanges = changeDiffs.length > 0;

  async function loadSimilarAndProceed() {
    setSimilarLoading(true);
    try {
      const matches = await previewSimilarBillingRecordsAction({
        billingRecordId,
        issueDate,
        subtotalAmount: previewSubtotalAmount,
        projectId,
        clientId,
      });
      setSimilarMatches(matches);
      if (matches.length > 0) {
        setDuplicateOpen(true);
      } else {
        setConfirmOpen(true);
      }
    } finally {
      setSimilarLoading(false);
    }
  }

  function handleSaveClick(event: FormEvent<HTMLFormElement>) {
    if (readBusinessChangeAcknowledged(event.currentTarget)) {
      return;
    }
    event.preventDefault();
    if (!hasChanges) return;
    void loadSimilarAndProceed();
  }

  function submitConfirmed() {
    const form = document.getElementById(`finalized-billing-edit-${billingRecordId}`) as
      | HTMLFormElement
      | null;
    if (!form) return;
    setBusinessChangeAcknowledged(form);
    setConfirmOpen(false);
    setDuplicateOpen(false);
    form.requestSubmit();
  }

  return (
    <>
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-start">{t('retroactiveEdit.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert tone="info" className="mb-4">
            {t('retroactiveEdit.description')}
          </Alert>
          {formError ? <Alert tone="danger">{formError}</Alert> : null}
          {hasIssuedStatutoryDocument ? (
            <Alert tone="warning" className="mb-4">
              {t('retroactiveEdit.statutoryInternalAmountDate')}
            </Alert>
          ) : null}
          <form
            id={`finalized-billing-edit-${billingRecordId}`}
            action={formAction}
            onSubmit={handleSaveClick}
            className="flex w-full min-w-0 flex-col gap-4"
          >
            <input type="hidden" name="changeAcknowledged" value="false" />
            <MainAppFormGrid dense>
              <Field label={t('form.amount')} required className={mainAppFieldSpan.lg}>
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
              <Field label={t('list.issueDate')} required className={mainAppFieldSpan.md}>
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
              {!hasIssuedStatutoryDocument ? (
                <>
                  <Field label={t('list.reference')} className={mainAppFieldSpan.md}>
                    {(control) => (
                      <Input
                        {...control}
                        name="reference"
                        value={reference}
                        onChange={(event) => setReference(event.target.value)}
                      />
                    )}
                  </Field>
                  <Field label={t('form.notes')} className={mainAppFieldSpan.lg}>
                    {(control) => (
                      <Input
                        {...control}
                        name="notes"
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                      />
                    )}
                  </Field>
                </>
              ) : (
                <>
                  <input type="hidden" name="reference" value={initialReference ?? ''} />
                  <input type="hidden" name="notes" value={initialNotes ?? ''} />
                </>
              )}
            </MainAppFormGrid>
            <Button type="submit" disabled={pending || similarLoading || !hasChanges}>
              {pending || similarLoading ? tCommon('actions.saving') : t('retroactiveEdit.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <DuplicateRecordWarningDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        title={t('retroactiveEdit.duplicateTitle')}
        description={t('retroactiveEdit.duplicateDescription')}
        matches={similarMatches.map((match) => ({
          id: match.id,
          href: `/billing/${match.id}`,
          title: match.reference?.trim() || t('detail.title'),
          reason: t('retroactiveEdit.duplicateReason', {
            date: formatBusinessDate(businessDate(match.issueDate), locale),
            amount: match.subtotalAmount,
          }),
        }))}
        onBackToEdit={() => setDuplicateOpen(false)}
        onContinue={() => setConfirmOpen(true)}
      />

      <BusinessChangeConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('retroactiveEdit.confirmTitle')}
        description={t('retroactiveEdit.confirmDescription')}
        changes={changeDiffs}
        impacts={impactLines}
        pending={pending}
        onConfirm={submitConfirmed}
        onBackToEdit={() => setConfirmOpen(false)}
      />
    </>
  );
}
