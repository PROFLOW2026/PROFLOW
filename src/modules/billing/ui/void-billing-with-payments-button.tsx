'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BusinessChangeConfirmDialog } from '@/components/patterns/business-change-confirm-dialog';
import { Button } from '@/components/ui/button';
import type { BusinessChangeFieldDiff, BusinessChangeImpactLine } from '@/shared/business-change/types';
import { formatMoney } from '@/shared/money/format';
import { formatBusinessDate } from '@/shared/dates/format';
import type { BusinessDate } from '@/shared/dates/dates';
import type { MoneyValue } from '@/shared/money/money';
import { voidBillingRecordAction } from './actions';
import { resolveBillingError } from './billing-detail-actions';

interface VoidBillingWithPaymentsButtonProps {
  readonly billingRecordId: string;
  readonly recordReference: string | null;
  readonly recordedPayments: readonly {
    paymentId: string;
    amount: MoneyValue;
    paymentDate: BusinessDate;
  }[];
  readonly locale: string;
}

export function VoidBillingWithPaymentsButton({
  billingRecordId,
  recordReference,
  recordedPayments,
  locale,
}: VoidBillingWithPaymentsButtonProps) {
  const t = useTranslations('billing');
  const tErrors = useTranslations('errors');
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const referenceLabel = recordReference ?? t('detail.title');

  const changes: BusinessChangeFieldDiff[] = [
    {
      fieldLabel: t('retroactiveVoid.billingStatus'),
      before: t('retroactiveVoid.statusFinalized'),
      after: t('retroactiveVoid.statusVoid'),
    },
    ...recordedPayments.map((payment, index) => ({
      fieldLabel: t('retroactiveVoid.paymentLine', { index: index + 1 }),
      before: `${formatMoney(payment.amount, locale)} · ${formatBusinessDate(payment.paymentDate, locale)}`,
      after: t('retroactiveVoid.paymentVoided'),
    })),
  ];

  const impacts: BusinessChangeImpactLine[] = [
    {
      label: t('retroactiveVoid.impactHistory'),
      detail: t('retroactiveVoid.impactHistoryDetail'),
    },
    {
      label: t('retroactiveVoid.impactAllocations'),
      detail: t('retroactiveVoid.impactAllocationsDetail'),
    },
  ];

  async function confirmVoid() {
    setPending(true);
    setError(null);
    const result = await voidBillingRecordAction(billingRecordId, { changeAcknowledged: true });
    setPending(false);
    if (result.error) {
      setError(resolveBillingError(result.error, t, tErrors));
      return;
    }
    setOpen(false);
    window.location.reload();
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        {t('detail.void')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-[var(--pf-status-danger-fg)]">
          {error}
        </p>
      ) : null}
      <BusinessChangeConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('retroactiveVoid.confirmTitle', { reference: referenceLabel })}
        description={t('retroactiveVoid.confirmDescription')}
        changes={changes}
        impacts={impacts}
        pending={pending}
        onConfirm={confirmVoid}
        onBackToEdit={() => setOpen(false)}
      />
    </>
  );
}
