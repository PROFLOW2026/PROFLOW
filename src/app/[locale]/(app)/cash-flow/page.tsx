import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationCashFlowForecast } from '@/modules/financials/application/get-organization-cash-flow-forecast';
import { buildRunningCashPosition } from '@/modules/financials/domain/running-cash-position';
import { CashFlowForecastView } from '@/modules/financials/ui/cash-flow-forecast-view';
import { CashRunningPositionView } from '@/modules/financials/ui/cash-running-position-view';
import { getOpeningCashBalanceForOrg } from '@/modules/tenancy/application/opening-cash-balance';
import { withOrgContext } from '@/shared/auth/session';
import { money, zeroMoney } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { OpeningCashBalanceForm } from './opening-cash-balance-form';

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
  const tFinancial = await getTranslations('financial');
  const tCash = await getTranslations('financial.cashFlow');

  const result = await withOrgContext(async (context) => {
    const allowed = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
    if (!allowed) {
      return { allowed: false as const };
    }
    const [forecast, opening] = await Promise.all([
      getOrganizationCashFlowForecast(context),
      getOpeningCashBalanceForOrg(context),
    ]);
    const currency = forecast.currency;
    const usable =
      opening != null && opening.currency.toUpperCase() === currency.toUpperCase();
    const position = buildRunningCashPosition({
      opening: usable ? money(opening.amount, currency) : zeroMoney(currency),
      asOf: forecast.asOf,
      items: forecast.items,
    });
    return {
      allowed: true as const,
      forecast,
      position,
      openingRecorded: usable,
      openingAsOf: usable ? opening.asOf : null,
      openingAmount: usable ? opening.amount : null,
      canEdit: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
      currency,
    };
  });

  if (!result.allowed) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('pageTitle')} description={t('pageHint')} />
        <EmptyState title={t('noAccessTitle')} description={t('noAccessBody')} />
      </div>
    );
  }

  const { forecast, position } = result;

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

      <OpeningCashBalanceForm
        currency={result.currency}
        initialAmount={result.openingAmount}
        initialAsOf={result.openingAsOf}
        canEdit={result.canEdit}
      />

      <CashRunningPositionView
        position={position}
        openingRecorded={result.openingRecorded}
        openingAsOf={result.openingAsOf}
        inflowsHidden={!forecast.showInflows}
        copy={{
          title: t('positionTitle'),
          hint: t('positionHint'),
          opening: t('positionOpening'),
          openingUnset: t('openingUnset'),
          expectedIn: t('inTitle'),
          expectedOut: t('outTitle'),
          endBalance: t('endBalance'),
          lowest: t('lowest'),
          excludedTitle: t('excludedTitle'),
          excludedLater: tCash('buckets.later'),
          excludedUndated: tCash('buckets.undated'),
          excludedEmpty: t('excludedEmpty'),
          notInRunning: t('notInRunning'),
          inLabel: t('direction.in'),
          outLabel: t('direction.out'),
          bucketLabel: (key) => tCash(`buckets.${key}`),
          inflowsHidden: t('inHidden'),
        }}
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
          includingVatLabel: tFinancial('kpis.includingVat'),
        }}
      />

    </div>
  );
}
