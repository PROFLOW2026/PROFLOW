import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationReportsAnalytics } from '@/modules/financials';
import { ReportsAnalyticsView } from '@/modules/financials/ui';
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

  const analytics = await withOrgContext(async (context) =>
    getOrganizationReportsAnalytics(context),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/projects"
            >
              {t('exportProjects')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/clients"
            >
              {t('exportClients')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/vendors"
            >
              {t('exportVendors')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/expenses"
            >
              {t('exportExpenses')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/billing"
            >
              {t('exportBilling')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/payments"
            >
              {t('exportPayments')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/receivables-aging"
            >
              {t('exportReceivables')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/employees"
            >
              {t('exportEmployees')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/time-entries"
            >
              {t('exportTimeEntries')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/purchase-orders"
            >
              {t('exportPurchaseOrders')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/exports/ap-bills"
            >
              {t('exportApBills')}
            </Link>
            <Link
              className="inline-flex min-h-11 items-center px-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              href="/imports"
            >
              {t('importData')}
            </Link>
          </div>
        }
      />

      <ReportsAnalyticsView analytics={analytics} />
    </div>
  );
}
