import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { formatBusinessDate } from '@/shared/dates/format';
import type { UnallocatedPaymentRow } from '@/modules/billing/domain/types';

export async function UnallocatedReceiptsPanel({
  rows,
  locale,
  canManage,
}: {
  rows: readonly UnallocatedPaymentRow[];
  locale: string;
  canManage: boolean;
}) {
  const t = await getTranslations('billing');

  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{t('receivables.unallocatedReceipts')}</h2>
        <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
          {t('receivables.unallocatedReceiptsHint')}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--pf-border-default)] p-3"
          >
            <div className="min-w-0 text-start">
              <p className="font-medium">
                {row.clientName ?? row.clientId.slice(0, 8)} ·{' '}
                <MoneyText value={row.unallocatedAmount} />
              </p>
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                <span dir="ltr">{formatBusinessDate(row.paymentDate, locale, 'short')}</span>
                {' · '}
                {t('paymentForm.cashReceivedPreview')}: <MoneyText value={row.amount} />
                {' · '}
                {t('paymentForm.allocatedPreview')}: <MoneyText value={row.appliedAmount} />
              </p>
            </div>
            {canManage ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/billing/payments/${row.id}/allocate`}>
                  {t('paymentForm.allocateSubmit')}
                </Link>
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
