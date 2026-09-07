'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmPaymentButton } from '@/components/ui/confirm-payment-button';
import { MoneyText } from '@/components/patterns/money-text';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { formatBusinessDate } from '@/shared/dates/format';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { confirmPayrollPaymentAction } from '@/app/[locale]/(app)/workforce/employees/actions';

export interface EmployeePayrollMonthPanelProps {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly yearMonth: string;
  readonly paymentId: string;
  readonly expectedAmount: string;
  readonly currency: string;
  readonly dueDate: string | null;
  readonly paymentStatus: string | null;
  readonly paidAt: string | null;
  readonly locale: string;
  readonly canManage: boolean;
  readonly defaultPaymentDate: string;
}

export function EmployeePayrollMonthPanel({
  employeeId,
  employeeName,
  yearMonth,
  paymentId,
  expectedAmount,
  currency,
  dueDate,
  paymentStatus,
  paidAt,
  locale,
  canManage,
  defaultPaymentDate,
}: EmployeePayrollMonthPanelProps) {
  const t = useTranslations('workforce.payrollPayment');
  const tActions = useTranslations('commandCenter.actions');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const status = paidAt ? 'paid' : (paymentStatus ?? 'upcoming');
  const statusShape: StatusShape =
    status === 'paid'
      ? 'approved'
      : status === 'overdue'
        ? 'overdue'
        : status === 'due'
          ? 'pending'
          : 'pending';

  return (
    <Card id="employee-payroll-payment" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t('title', { yearMonth })}
          <StatusBadge shape={statusShape} label={t(`status.${status}`)} />
        </CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {employeeName} · {yearMonth}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <Detail
          label={t('dueDate')}
          value={dueDate ? formatBusinessDate(businessDate(dueDate), locale) : '—'}
        />
        <div>
          <span className="text-xs text-[var(--pf-text-muted)]">
            {paidAt ? t('paidAmount') : t('expectedAmount')}
          </span>
          <div>
            <MoneyText
              value={money(expectedAmount, currency)}
              className="font-medium"
            />
          </div>
        </div>
        {paidAt ? (
          <Detail label={t('paidAt')} value={formatBusinessDate(businessDate(paidAt), locale)} />
        ) : null}

        {canManage && !paidAt ? (
          <ConfirmPaymentButton
            label={tActions('confirmPaid')}
            paymentDateLabel={tActions('paymentDateLabel')}
            paymentDateHint={tActions('paymentDateHint')}
            confirmLabel={tActions('paymentConfirm')}
            cancelLabel={tActions('cancel')}
            defaultPaymentDate={defaultPaymentDate}
            disabled={pending}
            onConfirm={async (paidAtDate) => {
              startTransition(async () => {
                await confirmPayrollPaymentAction({
                  employeeId,
                  paymentId,
                  paidAt: paidAtDate,
                });
                router.refresh();
              });
            }}
          />
        ) : null}

        {!canManage && !paidAt ? (
          <Alert tone="info">{t('readOnlyHint')}</Alert>
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
