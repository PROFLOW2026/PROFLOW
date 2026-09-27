'use client';

import { useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { MaterialTradeValue } from './trade-actions';
import { setMaterialTradeAction } from './trade-actions';

const TRADE_KEYS = ['electrical', 'plumbing', 'steel_rebar', 'concrete'] as const;

export function MaterialTradeSelector({
  materialId,
  currentTrade,
}: {
  materialId: string;
  currentTrade: MaterialTradeValue;
}) {
  const t = useTranslations('procurement.materialTrade');
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    const trade: MaterialTradeValue = value === '' ? null : (value as MaterialTradeValue);
    startTransition(async () => {
      await setMaterialTradeAction(materialId, trade);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">
        {t('label')}
      </span>
      <Select
        value={currentTrade ?? ''}
        onValueChange={handleChange}
        disabled={isPending}
      >
        <SelectTrigger className="w-48 text-sm">
          <SelectValue placeholder={t('unclassified')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">{t('unclassified')}</SelectItem>
          {TRADE_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {t(key)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-[var(--pf-text-muted)]">
        {t('hint')}
      </p>
    </div>
  );
}
