import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getOrganizationProjectRollup, getOrganizationCashFlowOutlook } from '@/modules/financials';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('reports.title') };
}

export default async function ReportsPage() {
  const t = await getTranslations('dashboard.reports');
  const tFinancial = await getTranslations('financial');

  const { rollup, cashFlow } = await withOrgContext(async (context) => ({
    rollup: await getOrganizationProjectRollup(context),
    cashFlow: await getOrganizationCashFlowOutlook(context),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="underline underline-offset-2" href="/exports/projects">
              {t('exportProjects')}
            </Link>
            <Link className="underline underline-offset-2" href="/exports/expenses">
              {t('exportExpenses')}
            </Link>
            <Link className="underline underline-offset-2" href="/exports/billing">
              {t('exportBilling')}
            </Link>
          </div>
        }
      />

      <p className="text-sm text-[var(--pf-text-secondary)]">{rollup.note}</p>
      {rollup.excludedForeignCurrencyCount > 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('excludedForeign', { count: rollup.excludedForeignCurrencyCount })}
        </p>
      ) : null}

      {cashFlow ? (
        <section className="flex flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] p-4">
          <div>
            <h2 className="text-sm font-semibold">{t('cashFlow.title')}</h2>
            <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{cashFlow.note}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {cashFlow.buckets.map((bucket) => (
              <div key={bucket.key} className="rounded-md bg-[var(--pf-bg-muted)] p-3">
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {t(`cashFlow.buckets.${bucket.key}`)}
                </p>
                <p className="mt-1 text-base font-semibold">
                  <MoneyText value={bucket.expectedIn} />
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ResponsiveTable
        items={rollup.rows}
        getRowKey={(row) => row.projectId}
        desktop={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.project')}</TableHead>
                <TableHead>{tFinancial('currentContractValue')}</TableHead>
                <TableHead>{tFinancial('outstanding')}</TableHead>
                <TableHead>{tFinancial('actualCostToDate')}</TableHead>
                <TableHead>{tFinancial('estimatedProfit')}</TableHead>
                <TableHead>{t('columns.progress')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rollup.rows.map((row) => (
                <TableRow key={row.projectId}>
                  <TableCell>
                    <Link href={`/projects/${row.projectId}`} className="hover:underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}
                  </TableCell>
                  <TableCell>
                    {row.outstanding ? <MoneyText value={row.outstanding} colorizeNegative /> : '—'}
                  </TableCell>
                  <TableCell>
                    {row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}
                  </TableCell>
                  <TableCell>
                    {row.estimatedProfit ? (
                      <MoneyText value={row.estimatedProfit} colorizeNegative />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{row.progressPercent ? `${row.progressPercent}%` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
        renderMobileCard={(row) => (
          <Link
            href={`/projects/${row.projectId}`}
            className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold">{row.name}</span>
              <span className="text-sm text-[var(--pf-text-secondary)]">
                {row.progressPercent ? `${row.progressPercent}%` : '—'}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{tFinancial('currentContractValue')}</dt>
                <dd>{row.currentContract ? <MoneyText value={row.currentContract} /> : '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{tFinancial('outstanding')}</dt>
                <dd>
                  {row.outstanding ? <MoneyText value={row.outstanding} colorizeNegative /> : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{tFinancial('actualCostToDate')}</dt>
                <dd>{row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}</dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{tFinancial('estimatedProfit')}</dt>
                <dd>
                  {row.estimatedProfit ? (
                    <MoneyText value={row.estimatedProfit} colorizeNegative />
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
            </dl>
          </Link>
        )}
      />
    </div>
  );
}
