'use client';

import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';

import { useActionState, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeFormDialogs } from '@/components/patterns/business-change-form-dialogs';
import { MoneyInput } from '@/components/patterns/money-input';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ApPayableStatus, ApPaymentStatus } from '@/modules/ap';
import { money } from '@/shared/money/money';
import { useBusinessChangeFormSubmit } from '@/shared/business-change/use-business-change-form-submit';
import type { BusinessChangeFieldDiff } from '@/shared/business-change/types';
import { businessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import {
  recordVendorPaymentAction,
  updateRecordedVendorPaymentDateAction,
  voidVendorPaymentAction,
  type ApFormState,
} from '../actions';

function RecordedVendorPaymentDateCorrection({
  paymentId,
  billId,
  initialDate,
  locale,
}: {
  readonly paymentId: string;
  readonly billId: string;
  readonly initialDate: string;
  readonly locale: string;
}) {
  const t = useTranslations('ap.retroactiveEdit');
  const tCommon = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(initialDate);
  const [state, formAction, pending] = useActionState<ApFormState, FormData>(
    updateRecordedVendorPaymentDateAction,
    {},
  );
  const formId = `vendor-payment-date-${paymentId}`;
  const businessChange = useBusinessChangeFormSubmit({
    enabled: open,
    alwaysConfirm: true,
    formId,
    buildChanges: (): BusinessChangeFieldDiff[] => {
      if (paymentDate === initialDate) return [];
      return [
        {
          fieldLabel: t('correctPaymentDate'),
          before: formatBusinessDate(businessDate(initialDate), locale),
          after: formatBusinessDate(businessDate(paymentDate), locale),
        },
      ];
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    businessChange.handleFormSubmit(event);
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t('correctPaymentDate')}
      </Button>
    );
  }

  return (
    <>
      <form id={formId} action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input type="hidden" name="paymentId" value={paymentId} />
        <input type="hidden" name="apBillId" value={billId} />
        <input type="hidden" name="changeAcknowledged" value="false" />
        <Input
          name="paymentDate"
          type="date"
          value={paymentDate}
          onChange={(event) => setPaymentDate(event.target.value)}
          dir="ltr"
          className="max-w-[11rem]"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" loading={pending || businessChange.similarLoading}>
            {t('savePaymentDate')}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
            {tCommon('actions.cancel')}
          </Button>
        </div>
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.success ? (
          <Alert tone="success" role="status">
            {t('savePaymentDate')}
          </Alert>
        ) : null}
        <p className="text-xs text-[var(--pf-text-muted)]">{t('correctPaymentDateHint')}</p>
      </form>
      <BusinessChangeFormDialogs
        confirmOpen={businessChange.confirmOpen}
        setConfirmOpen={businessChange.setConfirmOpen}
        duplicateOpen={businessChange.duplicateOpen}
        setDuplicateOpen={businessChange.setDuplicateOpen}
        pending={pending || businessChange.similarLoading}
        changes={businessChange.changes}
        similarMatches={businessChange.similarMatches}
        confirmTitle={t('confirmTitle')}
        confirmDescription={t('confirmDescription')}
        duplicateTitle={t('duplicateTitle')}
        duplicateDescription={t('duplicateDescription')}
        onConfirm={businessChange.submitConfirmed}
        onBackToEdit={() => businessChange.setConfirmOpen(false)}
        onContinuePastDuplicate={businessChange.continuePastDuplicate}
      />
    </>
  );
}

function payableShape(status: ApPayableStatus | null): StatusShape {
  switch (status) {
    case 'paid':
      return 'completed';
    case 'partial':
      return 'pending';
    case 'unpaid':
      return 'active';
    default:
      return 'archived';
  }
}

export interface VendorPaymentHistoryRow {
  readonly id: string;
  readonly amount: string;
  readonly currency: string;
  readonly paymentDate: string;
  readonly method: string | null;
  readonly reference: string | null;
  readonly status: ApPaymentStatus;
  readonly notes: string | null;
}

export function VendorPaymentPanel({
  billId,
  currency,
  outstanding,
  paid,
  payableStatus,
  paymentsAvailable,
  canManage,
  canCorrectPaymentDate = false,
  defaultPaymentDate,
  payments,
  locale,
}: {
  billId: string;
  currency: string;
  outstanding: string;
  paid: string;
  payableStatus: ApPayableStatus | null;
  paymentsAvailable: boolean;
  canManage: boolean;
  canCorrectPaymentDate?: boolean;
  defaultPaymentDate: string;
  payments: readonly VendorPaymentHistoryRow[];
  locale: string;
}) {
  const t = useTranslations('ap.payments');
  const [amount, setAmount] = useState('');
  const [recordState, recordAction, recordPending] = useActionState<ApFormState, FormData>(
    recordVendorPaymentAction,
    {},
  );
  const [voidState, voidAction, voidPending] = useActionState<ApFormState, FormData>(
    voidVendorPaymentAction,
    {},
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        {payableStatus ? (
          <StatusBadge
            shape={payableShape(payableStatus)}
            label={t(`payableStatuses.${payableStatus}`)}
          />
        ) : null}
      </div>

      <p className="text-xs text-[var(--pf-text-muted)]">{t('cashOnlyNote')}</p>

      {!paymentsAvailable ? <Alert tone="warning">{t('schemaPending')}</Alert> : null}

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('paid')}</p>
          <MoneyText value={money(paid, currency)} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('outstanding')}</p>
          <MoneyText value={money(outstanding, currency)} />
        </div>
      </div>

      {payments.length > 0 ? (
        <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.date')}</TableHead>
                <TableHead numeric>{t('columns.amount')}</TableHead>
                <TableHead>{t('columns.method')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                {canManage && paymentsAvailable ? (
                  <TableHead>{t('columns.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <span dir="ltr">
                      {intlDateTimeFormat(locale, { dateStyle: 'medium' }).format(
                        new Date(payment.paymentDate),
                      )}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    <MoneyText value={money(payment.amount, payment.currency)} />
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate text-sm">
                    {[payment.method, payment.reference].filter(Boolean).join(' · ') || '-'}
                  </TableCell>
                  <TableCell>{t(`statuses.${payment.status}`)}</TableCell>
                  <TableCell>
                    {canManage && paymentsAvailable && payment.status === 'recorded' ? (
                      <div className="flex flex-col items-start gap-1">
                        {canCorrectPaymentDate ? (
                          <RecordedVendorPaymentDateCorrection
                            paymentId={payment.id}
                            billId={billId}
                            initialDate={payment.paymentDate}
                            locale={locale}
                          />
                        ) : null}
                        <form action={voidAction}>
                          <input type="hidden" name="paymentId" value={payment.id} />
                          <input type="hidden" name="apBillId" value={billId} />
                          <Button type="submit" variant="ghost" size="sm" disabled={voidPending}>
                            {t('void')}
                          </Button>
                        </form>
                      </div>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
      )}

      {voidState.error ? <Alert tone="danger">{voidState.error}</Alert> : null}

      {canManage && paymentsAvailable && payableStatus !== 'paid' && payableStatus !== null ? (
        <form
          action={recordAction}
          className="flex w-full min-w-0 max-w-lg flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4"
        >
          <h3 className="font-medium">{t('recordTitle')}</h3>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('partialHint')}</p>
          {recordState.error ? <Alert tone="danger">{recordState.error}</Alert> : null}
          {recordState.success ? (
            <Alert tone="success" role="status">
              {t('recorded')}
            </Alert>
          ) : null}

          <input type="hidden" name="apBillId" value={billId} />
          <input type="hidden" name="currency" value={currency} />

          <Field label={t('amountLabel')} required>
            {(controlProps) => (
              <>
                <MoneyInput {...controlProps} required value={amount} onValueChange={setAmount} />
                <input type="hidden" name="amount" value={amount} />
              </>
            )}
          </Field>

          <Field label={t('paymentDateLabel')} required>
            {(controlProps) => (
              <Input
                {...controlProps}
                name="paymentDate"
                type="date"
                required
                defaultValue={defaultPaymentDate}
                dir="ltr"
              />
            )}
          </Field>

          <Field label={t('methodLabel')}>
            {(controlProps) => <Input {...controlProps} name="method" autoComplete="off" />}
          </Field>

          <Field label={t('referenceLabel')}>
            {(controlProps) => <Input {...controlProps} name="reference" autoComplete="off" />}
          </Field>

          <Field label={t('notesLabel')}>
            {(controlProps) => <Textarea {...controlProps} name="notes" rows={2} />}
          </Field>

          <Button type="submit" disabled={recordPending || !amount}>
            {t('submit')}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
