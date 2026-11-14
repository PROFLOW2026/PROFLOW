'use client';

import { useRouter } from '@/shared/i18n/navigation';
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
import { displayedPayrollAmount } from '@/modules/workforce/domain/payroll-obligation';
import { EmployeePayrollRetroactiveEdit } from '@/modules/workforce/ui/employee-payroll-retroactive-edit';

export interface EmployeePayrollMonthPanelProps {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly yearMonth: string;
  readonly paymentId: string;
  readonly expectedAmount: string;
  readonly paidAmount?: string | null;
  /** Base salary to pay (compensation rate) — distinct from employer cost. */
  readonly baseSalaryAmount?: string | null;
  /** Full-month employer cost pool (rate + burden) — distinct from cash paid. */
  readonly employerCostFullMonthAmount?: string | null;
  readonly currency: string;
  readonly dueDate: string | null;
  readonly paymentStatus: string | null;
  readonly paidAt: string | null;
  readonly locale: string;
  readonly canManage: boolean;
  readonly isOwner?: boolean;
  readonly defaultPaymentDate: string;
}

export function EmployeePayrollMonthPanel({
  employeeId,
  employeeName,
  yearMonth,
  paymentId,
  expectedAmount,
  paidAmount = null,
  baseSalaryAmount = null,
  employerCostFullMonthAmount = null,
  currency,
  dueDate,
  paymentStatus,
  paidAt,
  locale,
  canManage,
  isOwner = false,
  defaultPaymentDate,
}: EmployeePayrollMonthPanelProps) {
  const t = useTranslations('workforce.payrollPayment');
  const tActions = useTranslations('commandCenter');
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

        <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-surface-subtle)] px-3 py-2 text-xs text-[var(--pf-text-secondary)]">
          <p className="font-medium text-[var(--pf-text-primary)]">{t('threeConceptsTitle')}</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>{t('conceptBaseSalary')}</li>
            <li>{t('conceptEmployerCost')}</li>
            <li>{t('conceptPaidAmount')}</li>
          </ul>
        </div>

        {baseSalaryAmount ? (
          <div>
            <span className="text-xs text-[var(--pf-text-muted)]">{t('baseSalaryAmount')}</span>
            <div>
              <MoneyText value={money(baseSalaryAmount, currency)} className="font-medium" />
            </div>
          </div>
        ) : null}

        {employerCostFullMonthAmount ? (
          <div>
            <span className="text-xs text-[var(--pf-text-muted)]">{t('employerCostFullMonth')}</span>
            <div>
              <MoneyText
                value={money(employerCostFullMonthAmount, currency)}
                className="font-medium"
              />
            </div>
          </div>
        ) : null}

        <div>
          <span className="text-xs text-[var(--pf-text-muted)]">
            {paidAt ? t('paidAmount') : t('obligationExpectedAmount')}
          </span>
          <div>
            <MoneyText
              value={money(
                displayedPayrollAmount({ paidAt, paidAmount, expectedAmount }),
                currency,
              )}
              className="font-medium"
            />
          </div>
          {!paidAt ? (
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('obligationHint')}</p>
          ) : null}
        </div>
        {paidAt ? (
          <Detail label={t('paidAt')} value={formatBusinessDate(businessDate(paidAt), locale)} />
        ) : null}

        {canManage && !paidAt ? (
          <ConfirmPaymentButton
            label={tActions('actions.confirmPaid')}
            paymentDateLabel={tActions('actions.paymentDateLabel')}
            paymentDateHint={tActions('actions.paymentDateHint')}
            confirmLabel={tActions('actions.paymentConfirm')}
            cancelLabel={tActions('actions.cancel')}
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

        {paidAt && canManage && isOwner ? (
          <EmployeePayrollRetroactiveEdit
            employeeId={employeeId}
            yearMonth={yearMonth}
            initialPaidAt={paidAt}
            initialPaidAmount={paidAmount ?? expectedAmount}
            currency={currency}
            locale={locale}
          />
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
