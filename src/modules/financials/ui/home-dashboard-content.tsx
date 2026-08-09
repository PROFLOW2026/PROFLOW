import { AlertCircle, FolderKanban, Plus, Receipt } from 'lucide-react';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import { mapCoverageToSources, partialNote, standalonePartialNotes } from './map-coverage-sources';

interface HomeDashboardContentProps {
  data: HomeDashboardData;
}

export async function HomeDashboardContent({ data }: HomeDashboardContentProps) {
  const t = await getTranslations('dashboard');
  const tFinancial = await getTranslations('financial');
  const tNav = await getTranslations('nav');

  if (data.isBrandNew) {
    return (
      <EmptyState
        icon={FolderKanban}
        title={t('empty.title')}
        description={t('empty.body')}
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            {data.canCreateProject ? (
              <Button asChild>
                <Link href="/projects/new">
                  <Plus aria-hidden />
                  {t('empty.action')}
                </Link>
              </Button>
            ) : null}
            {data.canCreateExpense ? (
              <Button asChild variant="secondary">
                <Link href="/expenses/new">
                  <Receipt aria-hidden />
                  {tNav('newMenu.expense')}
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />
    );
  }

  const coverageSources = data.profitCoverage
    ? mapCoverageToSources(data.profitCoverage, tFinancial)
    : [];
  const costCoverageSources = data.costCoverage
    ? mapCoverageToSources(data.costCoverage, tFinancial)
    : [];
  const contractValueNote =
    data.contractValueCoverage?.partials?.[0] &&
    partialNote(
      data.contractValueCoverage.partials[0].reason,
      data.contractValueCoverage.partials[0].count,
      tFinancial,
    );

  const hasAttention =
    data.attention.pendingChangesCount > 0 ||
    data.attention.unbilledApprovedCount > 0 ||
    data.attention.overdueBillingCount > 0;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      {(data.totalContractValue ||
        data.totalActualCost ||
        data.estimatedProfit ||
        data.showBilling) && (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 text-sm font-semibold text-[var(--pf-text-secondary)]">
            {t('businessSummary.title')}
          </h2>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.activeProjectCount > 0 ? (
              <KpiCard title={t('activeProjects')} value={String(data.activeProjectCount)} />
            ) : null}
            {data.totalContractValue ? (
              <KpiCard
                title={tFinancial('currentContractValue')}
                money={data.totalContractValue}
                footer={
                  contractValueNote ? (
                    <p className="break-words text-xs text-[var(--pf-text-secondary)]">{contractValueNote}</p>
                  ) : null
                }
              />
            ) : null}
            {data.totalActualCost ? (
              <KpiCard
                title={tFinancial('actualCostToDate')}
                money={data.totalActualCost}
                footer={
                  data.costCoverage ? (
                    <CoverageDisclosure sources={costCoverageSources} />
                  ) : null
                }
              />
            ) : null}
            {data.showProfit && data.estimatedProfit ? (
              <KpiCard
                title={tFinancial('estimatedProfitBasedOnEnteredData')}
                money={data.estimatedProfit}
                footer={<CoverageDisclosure sources={coverageSources} />}
              />
            ) : null}
          </div>

          {data.showBilling && data.billing ? (
            <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
              <KpiCard
                title={tFinancial('invoiced')}
                money={data.billing.invoiced}
                footer={(() => {
                  if (!data.billingCoverage) return null;
                  const notes = standalonePartialNotes(data.billingCoverage, tFinancial, [
                    'foreign_currency_billing_excluded',
                  ]);
                  if (notes.length === 0) return null;
                  return notes.map((note) => (
                    <p key={note} className="break-words text-xs text-[var(--pf-text-secondary)]">
                      {note}
                    </p>
                  ));
                })()}
              />
              <KpiCard title={tFinancial('paid')} money={data.billing.paid} />
              <KpiCard title={tFinancial('outstanding')} money={data.billing.outstanding} />
            </div>
          ) : null}
        </section>
      )}

      {data.organizationSummary ? (
        <section className="min-w-0 max-w-full">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {data.showBilling ? (
              <KpiCard
                title={t('businessSummary.outstanding')}
                money={data.organizationSummary.outstanding}
              />
            ) : null}
            {data.showBilling ? (
              <KpiCard
                title={t('businessSummary.invoicedThisMonth')}
                money={data.organizationSummary.invoicedThisMonth}
              />
            ) : null}
            <KpiCard
              title={t('businessSummary.costsThisMonth')}
              money={data.organizationSummary.costsThisMonth}
            />
          </div>
        </section>
      ) : null}

      {hasAttention ? (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <AlertCircle className="size-4 shrink-0" aria-hidden />
            {t('attention.title')}
          </h2>
          <ul className="flex min-w-0 flex-col gap-2 text-sm">
            {data.attention.pendingChangesCount > 0 ? (
              <li className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                {t('attention.pendingChanges', { count: data.attention.pendingChangesCount })}
              </li>
            ) : null}
            {data.attention.unbilledApprovedCount > 0 ? (
              <li className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                {t('attention.approvedNotBilled', { count: data.attention.unbilledApprovedCount })}
              </li>
            ) : null}
            {data.attention.overdueBillingCount > 0 ? (
              <li className="min-w-0 break-words rounded-md border border-[var(--pf-border-default)] px-3 py-2">
                {t('attention.overdueBilling', { count: data.attention.overdueBillingCount })}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {data.recentProjects.length > 0 ? (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 text-sm font-semibold">{t('activeProjects')}</h2>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            {data.recentProjects.map((project) => (
              <Card key={project.id} className="min-w-0 max-w-full">
                <CardHeader className="py-3">
                  <CardTitle className="min-w-0 break-words text-base">
                    <Link href={`/projects/${project.id}`} className="hover:underline">
                      {project.name}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 pb-3 text-sm text-[var(--pf-text-secondary)]">
                  {project.clientName ?? '—'}
                  {project.currentContractValue && project.currency ? (
                    <p className="mt-1 min-w-0 max-w-full overflow-x-auto">
                      <MoneyText
                        value={{
                          amount: project.currentContractValue,
                          currency: project.currency,
                        }}
                        compact
                      />
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {(data.canCreateProject || data.canCreateExpense) && (
        <section className="min-w-0 max-w-full">
          <h2 className="mb-3 text-sm font-semibold">{t('quickActions')}</h2>
          <div className="flex min-w-0 max-w-full flex-wrap gap-2">
            {data.canCreateProject ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/projects/new">{tNav('newMenu.project')}</Link>
              </Button>
            ) : null}
            {data.canCreateExpense ? (
              <Button asChild size="sm" variant="secondary">
                <Link href="/expenses/new">{tNav('newMenu.expense')}</Link>
              </Button>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCard({
  title,
  money,
  value,
  footer,
}: {
  title: string;
  money?: { amount: string; currency: string };
  value?: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="min-w-0 max-w-full">
      <CardHeader className="pb-1">
        <CardTitle className="break-words text-xs font-medium text-[var(--pf-text-secondary)]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-1">
        {money ? (
          <div className="min-w-0 max-w-full overflow-x-auto">
            <MoneyText value={money} className="text-lg font-semibold" />
          </div>
        ) : (
          <span className="text-lg font-semibold">{value}</span>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
