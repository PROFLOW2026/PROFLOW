'use client';

import { useActionState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { formatBusinessDate } from '@/shared/dates/format';
import { businessDate } from '@/shared/dates';
import { isPositiveMoney } from '@/shared/money';
import { isExpensePaymentObligationEligible } from '@/modules/expenses/domain/payment-lifecycle';
import { resolveExpensePaymentObligation } from '@/modules/expenses/domain/resolve-expense-payment-obligation';
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

  const paymentActionable = isExpensePaymentObligationEligible({
    status: expense.status,
    voidsExpenseId: expense.voidsExpenseId,
    adjustsExpenseId: expense.adjustsExpenseId,
    hasActiveReversal: expense.hasActiveReversal ?? false,
    grossAmount: expense.grossAmount.amount,
    currency: expense.grossAmount.currency,
  });

  const obligation = resolveExpensePaymentObligation(
    {
      grossAmount: expense.grossAmount.amount,
      currency: expense.grossAmount.currency,
      expenseDate: expense.expenseDate,
      installmentCount: expense.installmentCount,
      installmentStartDate: expense.installmentStartDate,
      installmentsPaidCount: expense.installmentsPaidCount,
      paidGrossAmount: expense.paidGrossAmount,
      dueDate: expense.dueDate,
      paymentStatus: expense.paymentStatus,
      paidAt: expense.paidAt,
    },
    businessDate(defaultPaymentDate),
  );

  const status = obligation.paymentStatus ?? expense.paymentStatus ?? 'upcoming';
  const statusShape: StatusShape =
    status === 'paid'
      ? 'approved'
      : status === 'overdue'
        ? 'overdue'
        : status === 'due'
          ? 'pending'
          : 'pending';

  const hasPaidProgress = isPositiveMoney(obligation.totalPaid);
  const showConfirm =
    canManage && paymentActionable && !obligation.isFullyPaid && isPositiveMoney(obligation.payableAmount);

  return (
    <Card id="expense-payment" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t('title')}
          <StatusBadge shape={statusShape} label={t(`status.${status}`)} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <Detail
          label={t('dueDate')}
          value={
            obligation.effectiveDueDate
              ? formatBusinessDate(obligation.effectiveDueDate, locale)
              : expense.dueDate
                ? formatBusinessDate(expense.dueDate, locale)
                : '—'
          }
        />

        {expense.installmentCount > 1 ? (
          <>
            <Detail
              label={t('transactionTotal')}
              value={<MoneyText value={obligation.transactionTotal} className="font-medium" />}
            />
            {hasPaidProgress ? (
              <Detail
                label={t('paidAmount')}
                value={<MoneyText value={obligation.totalPaid} className="font-medium" />}
              />
            ) : null}
            <Detail
              label={t('remainingBalance')}
              value={<MoneyText value={obligation.totalRemaining} className="font-medium" />}
            />
          </>
        ) : null}

        {hasPaidProgress || obligation.isFullyPaid ? (
          <>
            {expense.paidAt ? (
              <Detail label={t('paidAt')} value={formatBusinessDate(expense.paidAt, locale)} />
            ) : null}
            {expense.paymentConfirmationSource ? (
              <p className="text-xs text-[var(--pf-text-muted)]">
                {t(`source.${expense.paymentConfirmationSource}`)}
              </p>
            ) : null}
          </>
        ) : null}

        {!obligation.isFullyPaid ? (
          <div>
            <span className="text-xs text-[var(--pf-text-muted)]">{t('payableAmount')}</span>
            <div>
              <MoneyText value={obligation.payableAmount} className="font-medium" />
            </div>
            {expense.installmentCount > 1 && obligation.currentInstallmentIndex != null ? (
              <p className="text-xs text-[var(--pf-text-muted)]">
                {t('installmentProgress', {
                  current: obligation.currentInstallmentIndex + 1,
                  total: expense.installmentCount,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {showConfirm ? (
          <form action={confirmAction} className="flex flex-col gap-2">
            <input type="hidden" name="expenseId" value={expense.id} />
            <input
              type="hidden"
              name="paidGrossAmount"
              value={obligation.payableAmount.amount}
            />
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

        {canManage && hasPaidProgress ? (
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

function Detail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-[var(--pf-text-muted)]">{label}</span>
      {typeof value === 'string' ? (
        <span dir="ltr" className="font-medium">
          {value}
        </span>
      ) : (
        value
      )}
    </div>
  );
}
