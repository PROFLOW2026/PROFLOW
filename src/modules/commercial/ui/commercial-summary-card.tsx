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
    <div className="flex items-baseline justify-between gap-3">
      <span className={emphasize ? 'font-medium' : 'text-sm text-[var(--pf-text-secondary)]'}>
        {label}
      </span>
      <MoneyText value={value} className={emphasize ? 'text-base font-semibold' : 'text-sm'} />
    </div>
  );
}

export async function CommercialSummaryCard({ position }: CommercialSummaryCardProps) {
  const t = await getTranslations('changes.summary');

  const potential = addMoney(position.currentContractValue, position.pendingChanges);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <SummaryRow label={t('original')} value={position.originalContractValue} />
        <SummaryRow label={t('approvedAdditions')} value={position.approvedAdditions} />
        <SummaryRow label={t('approvedReductions')} value={position.approvedReductions} />
        <SummaryRow label={t('current')} value={position.currentContractValue} emphasize />
        <SummaryRow label={t('pending')} value={position.pendingChanges} />
        <div className="mt-1 border-t border-[var(--pf-border-default)] pt-2">
          <SummaryRow label={t('potential')} value={potential} />
          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('potentialHint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
