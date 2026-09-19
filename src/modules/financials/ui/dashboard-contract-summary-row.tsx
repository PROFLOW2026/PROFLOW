import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent } from '@/components/ui/card';
import type { OrgContractSummary } from '../domain/dashboard-contract-summary';

function ContractCard({
  title,
  money,
  hint,
}: {
  title: string;
  money: { amount: string; currency: string } | null;
  hint?: string;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardContent className="flex min-w-0 flex-col gap-1 p-3 sm:p-4">
        <p className="text-xs text-[var(--pf-text-muted)]">{title}</p>
        {money ? (
          <p className="min-w-0 max-w-full overflow-x-auto text-base font-semibold sm:text-lg">
            <MoneyText value={money} />
          </p>
        ) : (
          <p className="text-sm text-[var(--pf-text-secondary)]">—</p>
        )}
        {hint ? <p className="text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export async function DashboardContractSummaryRow({
  summary,
}: {
  summary: OrgContractSummary;
}) {
  const t = await getTranslations('dashboard');

  return (
    <section className="min-w-0 max-w-full">
      <h2 className="mb-2 text-sm font-semibold">{t('contractSummary.title')}</h2>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ContractCard title={t('contractSummary.original')} money={summary.originalContractTotal} />
        <ContractCard
          title={t('contractSummary.approvedChanges')}
          money={summary.approvedChangesTotal}
        />
        <ContractCard title={t('contractSummary.total')} money={summary.totalIncludingApproved} />
        <ContractCard
          title={t('contractSummary.remaining')}
          money={summary.remainingContract}
          hint={t('contractSummary.remainingHint')}
        />
      </div>
    </section>
  );
}
