'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { Alert } from '@/components/ui/alert';
import { MoneyText } from '@/components/patterns/money-text';
import type { MoneyValue } from '@/shared/money/money';

export function BillingPaymentRecordedAlert({
  outstandingAmount,
  fullyPaid,
  receiptOutcome,
  providerDisplayName,
}: {
  readonly outstandingAmount: MoneyValue;
  readonly fullyPaid: boolean;
  readonly receiptOutcome: 'none' | 'issued' | 'pending' | 'failed';
  readonly providerDisplayName: string | null;
}) {
  const t = useTranslations('billing.paymentRecorded');
  const searchParams = useSearchParams();
  const show = searchParams.get('paymentRecorded') === '1';

  useEffect(() => {
    if (!show) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('paymentRecorded');
    url.searchParams.delete('paymentId');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }, [show]);

  if (!show) return null;

  return (
    <div className="flex flex-col gap-2">
      <Alert tone="success" role="status">
        {t('paymentSuccess')}
      </Alert>
      {fullyPaid ? (
        <Alert tone="success" role="status">
          {t('fullyPaid')}
        </Alert>
      ) : (
        <Alert tone="info" role="status">
          {t('outstandingRemaining')}{' '}
          <MoneyText value={outstandingAmount} className="inline font-semibold" />
        </Alert>
      )}
      {receiptOutcome === 'issued' && providerDisplayName ? (
        <Alert tone="success" role="status">
          {t('receiptIssued', { provider: providerDisplayName })}
        </Alert>
      ) : null}
      {receiptOutcome === 'failed' ? (
        <Alert tone="warning" role="status">
          {t('receiptFailed')}
        </Alert>
      ) : null}
      {receiptOutcome === 'pending' ? (
        <Alert tone="info" role="status">
          {t('receiptPending')}
        </Alert>
      ) : null}
    </div>
  );
}
