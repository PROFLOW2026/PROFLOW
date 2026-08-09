import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getOrganizationProjectRollup } from '@/modules/financials';
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

  const rollup = await withOrgContext((context) => getOrganizationProjectRollup(context));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link className="underline" href="/exports/projects">
              {t('exportProjects')}
            </Link>
            <Link className="underline" href="/exports/expenses">
              {t('exportExpenses')}
            </Link>
            <Link className="underline" href="/exports/billing">
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

      <div className="overflow-x-auto">
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
                <TableCell>{row.actualCost ? <MoneyText value={row.actualCost} /> : '—'}</TableCell>
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
      </div>
    </div>
  );
}
