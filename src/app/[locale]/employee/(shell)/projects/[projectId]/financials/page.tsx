import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { getProjectFinancials } from '@/modules/financials';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoneyDisplay } from '@/shared/money';
import {
  employeePageStackClass,
  employeeStatCardClass,
} from '@/modules/employee-app/ui/employee-surface-styles';

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function EmployeeProjectFinancialsPage({ params }: PageProps) {
  const { projectId } = await params;
  const t = await getTranslations('employeeApp.financials');

  const payload = await withOrgContext(async (context) => {
    if (!employeeHasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) {
      return null;
    }

    const financials = await getProjectFinancials(context, projectId);
    const canProfit = employeeHasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);

    return { financials, canProfit };
  });

  if (!payload) notFound();

  const { financials, canProfit } = payload;
  const profit = canProfit ? financials.profit : null;

  return (
    <div className={employeePageStackClass}>
      <Link
        href={`/employee/projects/${projectId}`}
        className="inline-flex text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('back')}
      </Link>

      <header className="space-y-1">
        <h2 className="text-xl font-bold text-[var(--pf-text-primary)]">{t('title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
      </header>

      {financials.commercial ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('sections.commercial')}</h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              label={t('fields.currentContract')}
              value={formatMoneyDisplay(financials.commercial.currentContractValue)}
            />
            <Stat
              label={t('fields.pendingChanges')}
              value={formatMoneyDisplay(financials.commercial.pendingChanges)}
            />
          </dl>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('sections.billing')}</h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label={t('fields.invoiced')} value={formatMoneyDisplay(financials.billing.invoiced)} />
          <Stat label={t('fields.paid')} value={formatMoneyDisplay(financials.billing.netPaid)} />
          <Stat
            label={t('fields.outstanding')}
            value={formatMoneyDisplay(financials.billing.netOutstanding)}
          />
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('sections.cost')}</h3>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat
            label={t('fields.actualCost')}
            value={formatMoneyDisplay(financials.cost.actualCostToDate)}
          />
          <Stat
            label={t('fields.forecastCost')}
            value={formatMoneyDisplay(financials.cost.directForecastFinalCost)}
          />
        </dl>
      </section>

      {profit ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('sections.profit')}</h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              label={t('fields.actualProfit')}
              value={formatMoneyDisplay(profit.actualProfit)}
            />
            <Stat
              label={t('fields.estimatedProfit')}
              value={formatMoneyDisplay(profit.estimatedProfit)}
            />
            {profit.actualMarginPercent != null ? (
              <Stat
                label={t('fields.actualMargin')}
                value={`${profit.actualMarginPercent}%`}
              />
            ) : null}
          </dl>
        </section>
      ) : financials.priceNotSet ? (
        <p className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm text-[var(--pf-text-secondary)]">
          {t('priceNotSet')}
        </p>
      ) : !canProfit ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('profitHidden')}</p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={employeeStatCardClass}>
      <dt className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-[var(--pf-text-primary)]">{value}</dd>
    </div>
  );
}
