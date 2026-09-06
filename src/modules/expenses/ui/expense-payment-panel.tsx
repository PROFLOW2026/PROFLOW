'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { formatBusinessDate } from '@/shared/dates/format';
import { money } from '@/shared/money';
import type { ExpenseDetail } from '@/modules/expenses/domain/types';
import {
  confirmExpensePaidAction,
  voidExpensePaymentAction,
  type ExpensePaymentActionState,
} from '@/app/[locale]/(app)/expenses/[expenseId]/payment-actions';

interface ExpensePaymentPanelProps {
  readonly expense: ExpenseDetail;
  readonly locale: string;
  readonly canManage: boolean;
  readonly defaultPaymentDate: string;
}

export function ExpensePaymentPanel({
  expense,
  locale,
  canManage,
  defaultPaymentDate,
}: ExpensePaymentPanelProps) {
  const t = useTranslations('expenses.payment');
  const [confirmState, confirmAction, confirmPending] = useActionState(
    confirmExpensePaidAction,
    {} as ExpensePaymentActionState,
  );
  const [voidState, voidAction, voidPending] = useActionState(
    voidExpensePaymentAction,
    {} as ExpensePaymentActionState,
  );

  if (expense.status !== 'finalized') return null;

  const status = expense.paymentStatus ?? 'upcoming';
  const statusShape: StatusShape =
    status === 'paid'
      ? 'approved'
      : status === 'overdue'
        ? 'overdue'
        : status === 'due'
          ? 'pending'
          : 'pending';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t('title')}
          <StatusBadge shape={statusShape} label={t(`status.${status}`)} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <Detail label={t('dueDate')} value={expense.dueDate ? formatBusinessDate(expense.dueDate, locale) : '—'} />
        {expense.paidAt ? (
          <>
            <Detail label={t('paidAt')} value={formatBusinessDate(expense.paidAt, locale)} />
            <div>
              <span className="text-xs text-[var(--pf-text-muted)]">{t('paidAmount')}</span>
              <div>
                <MoneyText
                  value={
                    expense.paidGrossAmount
                      ? money(expense.paidGrossAmount, expense.grossAmount.currency)
                      : expense.grossAmount
                  }
                  className="font-medium"
                />
              </div>
            </div>
            {expense.paymentConfirmationSource ? (
              <p className="text-xs text-[var(--pf-text-muted)]">
                {t(`source.${expense.paymentConfirmationSource}`)}
              </p>
            ) : null}
          </>
        ) : (
          <div>
            <span className="text-xs text-[var(--pf-text-muted)]">{t('payableAmount')}</span>
            <div>
              <MoneyText value={expense.grossAmount} className="font-medium" />
            </div>
          </div>
        )}

        {canManage && !expense.paidAt ? (
          <form action={confirmAction} className="flex flex-col gap-2">
            <input type="hidden" name="expenseId" value={expense.id} />
            <Field label={t('paymentDateLabel')} required>
              {(controlProps) => (
                <Input
                  {...controlProps}
                  type="date"
                  name="paidAt"
                  defaultValue={defaultPaymentDate}
                />
              )}
            </Field>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('paymentDateHint')}</p>
            <Button type="submit" size="sm" loading={confirmPending} className="self-start">
              {t('confirmPaid')}
            </Button>
            {confirmState.error ? <Alert tone="danger">{confirmState.error}</Alert> : null}
            {confirmState.ok ? <Alert tone="success">{t('confirmed')}</Alert> : null}
          </form>
        ) : null}

        {canManage && expense.paidAt ? (
          <form action={voidAction} className="flex flex-col gap-2">
            <input type="hidden" name="expenseId" value={expense.id} />
            <Button type="submit" size="sm" variant="secondary" loading={voidPending} className="self-start">
              {t('voidConfirmation')}
            </Button>
            {voidState.error ? <Alert tone="danger">{voidState.error}</Alert> : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-[var(--pf-text-muted)]">{label}</span>
      <span dir="ltr" className="font-medium">
        {value}
      </span>
    </div>
  );
}
