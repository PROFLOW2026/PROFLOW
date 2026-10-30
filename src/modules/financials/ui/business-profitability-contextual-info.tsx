'use client';

import { useTranslations } from 'next-intl';
import { ContextualInfo } from '@/components/ui/contextual-info';

/** Page-level methodology notes for business profitability (not shown inline). */
export function BusinessProfitabilityContextualInfo() {
  const t = useTranslations('financial.businessProfitability');
  const tFinancial = useTranslations('financial');

  return (
    <ContextualInfo
      dialogTitle={t('pageTitle')}
      content={
        <>
          <p>{t('disclaimer')}</p>
          <p>{t('scopeNote')}</p>
          <p>{tFinancial('profitVsCash')}</p>
        </>
      }
    />
  );
}
