'use client';

import { useActionState, useState } from 'react';
import { useTranslations } from 'next-intl';
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
import {
  recordVendorPaymentAction,
  voidVendorPaymentAction,
  type ApFormState,
} from '../actions';

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
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
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
                      <form action={voidAction}>
                        <input type="hidden" name="paymentId" value={payment.id} />
                        <input type="hidden" name="apBillId" value={billId} />
                        <Button type="submit" variant="ghost" size="sm" disabled={voidPending}>
                          {t('void')}
                        </Button>
                      </form>
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
