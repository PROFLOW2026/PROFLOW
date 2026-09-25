import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { MoneyValue } from '@/shared/money';
import type { EmployerCostOverview as EmployerCostOverviewData } from '../application/get-employer-cost-overview';

function Figure({
  label,
  hint,
  value,
  unavailable,
}: {
  readonly label: string;
  readonly hint: string;
  readonly value: MoneyValue | null;
  readonly unavailable: string;
}) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
      <p className="text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--pf-text-muted)]">{hint}</p>
      <p className="mt-1 text-base font-semibold">
        {value ? <MoneyText value={value} /> : <span className="text-[var(--pf-text-muted)]">{unavailable}</span>}
      </p>
    </div>
  );
}

export async function EmployerCostOverview({
  data,
}: {
  readonly data: EmployerCostOverviewData;
}) {
  const t = await getTranslations('workforce.employerCostOverview');

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-start text-base">{t('title')}</CardTitle>
        <CardDescription className="text-start">{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.monthFactCount === 0 ? (
          <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        ) : (
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Figure label={t('estimated')} hint={t('estimatedHint')} value={data.estimated} unavailable={t('unavailable')} />
            <Figure label={t('actual')} hint={t('actualHint')} value={data.actual} unavailable={t('unavailable')} />
            <Figure
              label={t('projectAllocated')}
              hint={t('projectAllocatedHint')}
              value={data.projectAllocated}
              unavailable={t('unavailable')}
            />
            <Figure
              label={t('companyOnly')}
              hint={t('companyOnlyHint')}
              value={data.companyOnly}
              unavailable={t('companyOnlyUnavailable')}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
