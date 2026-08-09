import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CommercialPosition } from '@/modules/financials/domain/types';
import { addMoney, type MoneyValue } from '@/shared/money/money';

export interface CommercialSummaryCardProps {
  position: CommercialPosition;
  currency: string;
}

function SummaryRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: MoneyValue;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-start">
      <span
        className={
          emphasize
            ? 'min-w-0 flex-1 font-medium'
            : 'min-w-0 flex-1 text-sm text-[var(--pf-text-secondary)]'
        }
      >
        {label}
      </span>
      <MoneyText
        value={value}
        className={emphasize ? 'shrink-0 text-base font-semibold' : 'shrink-0 text-sm'}
      />
    </div>
  );
}

export async function CommercialSummaryCard({ position }: CommercialSummaryCardProps) {
  const t = await getTranslations('changes.summary');

  const potential = addMoney(position.currentContractValue, position.pendingChanges);

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-start text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-2">
        <SummaryRow label={t('original')} value={position.originalContractValue} />
        <SummaryRow label={t('approvedAdditions')} value={position.approvedAdditions} />
        <SummaryRow label={t('approvedReductions')} value={position.approvedReductions} />
        <SummaryRow label={t('current')} value={position.currentContractValue} emphasize />
        <SummaryRow label={t('pending')} value={position.pendingChanges} />
        <div className="mt-1 border-t border-[var(--pf-border-default)] pt-2">
          <SummaryRow label={t('potential')} value={potential} />
          <p className="mt-1 text-start text-xs text-[var(--pf-text-secondary)]">{t('potentialHint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
