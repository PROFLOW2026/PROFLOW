'use client';

import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import type { MoneyValue } from '@/shared/money';

export function ProjectHeaderMetrics({
  currentContractValue,
}: {
  currentContractValue: MoneyValue | null;
}) {
  const t = useTranslations('projects.workspace.header');

  if (!currentContractValue) return null;

  return (
    <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="min-w-0">
        <p className="text-xs text-[var(--pf-text-muted)]">{t('currentContractValue')}</p>
        <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
          <MoneyText value={currentContractValue} />
        </p>
      </div>
    </div>
  );
}
