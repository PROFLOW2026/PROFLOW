import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationCashFlowForecast } from '@/modules/financials/application/get-organization-cash-flow-forecast';
import { CashFlowForecastView } from '@/modules/financials/ui/cash-flow-forecast-view';
import { CashFlowView } from '@/modules/financials/ui/cash-flow-view';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'financial' });
  return { title: t('cashFlowForecast.pageTitle') };
}

export default async function CashFlowPage() {
  const t = await getTranslations('financial.cashFlowForecast');
  const tCash = await getTranslations('financial.cashFlow');

  const result = await withOrgContext(async (context) => {
    const allowed = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
    if (!allowed) {
      return { allowed: false as const, forecast: null };
    }
    const forecast = await getOrganizationCashFlowForecast(context);
    return { allowed: true as const, forecast };
  });

  if (!result.allowed || !result.forecast) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('pageTitle')} description={t('pageHint')} />
        <EmptyState title={t('noAccessTitle')} description={t('noAccessBody')} />
      </div>
    );
  }

  const { forecast } = result;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageHint')}
        actions={
          <Link href="/reports?section=management" className={textNavLinkClassName}>
            {t('managementLink')}
          </Link>
        }
      />

      <CashFlowForecastView
        forecast={forecast}
        copy={{
          title: t('summaryTitle'),
          hint: t('summaryHint'),
          inTitle: t('inTitle'),
          outTitle: t('outTitle'),
          inHidden: t('inHidden'),
          outHidden: t('outHidden'),
          drilldownTitle: t('drilldownTitle'),
          empty: t('empty'),
          recurringNote: t('recurringNote'),
          noDate: t('noDate'),
          bucketLabel: (key) => tCash(`buckets.${key}`),
          certaintyLabel: (key) => t(`certainty.${key}`),
          sourceLabel: (key) => t(`sources.${key}`),
          directionLabel: (key) => t(`direction.${key}`),
          itemCount: (count) => t('itemCount', { count }),
        }}
      />

      <CashFlowView
        cashFlow={forecast.outlook}
        copy={{
          title: tCash('title'),
          actualTitle: tCash('actualTitle'),
          actualHint: tCash('actualHint'),
          forecastTitle: tCash('forecastTitle'),
          forecastHint: tCash('forecastHint'),
          outgoingTitle: tCash('outgoingTitle'),
          outgoingDisclosure: tCash('outgoingDisclosure'),
          outgoingAvailableHint: tCash('outgoingAvailableHint'),
          undatedNote: tCash('undatedNote'),
          bucketLabel: (key) => tCash(`buckets.${key}`),
          paymentCount: (count) => tCash('paymentCount', { count }),
          billCount: (count) => tCash('billCount', { count }),
        }}
      />
    </div>
  );
}
