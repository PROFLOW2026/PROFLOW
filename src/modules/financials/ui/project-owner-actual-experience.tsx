import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { MoneyText } from '@/components/patterns/money-text';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { getProjectActualBreakdown } from '../application/get-project-actual-breakdown';
import { getProjectFinancials } from '../application/get-project-financials';
import { resolveProjectKpiDisplay } from './resolve-kpi-display';
import {
  ProjectActualBreakdownView,
  ProjectForecastFormulaPanel,
  ProjectOwnerStoryPanel,
  type OwnerStoryCopy,
  type OwnerStoryMetrics,
} from './project-actual-breakdown-view';
import type { ProjectActualBreakdownCategoryKey } from '../domain/project-actual-breakdown';

async function loadOwnerStoryCopy(): Promise<OwnerStoryCopy> {
  const t = await getTranslations('financial.ownerStory');
  const categories = {
    employees: t('categories.employees'),
    subcontractors: t('categories.subcontractors'),
    vendors: t('categories.vendors'),
    materials: t('categories.materials'),
    otherExpenses: t('categories.otherExpenses'),
    overhead: t('categories.overhead'),
  } satisfies Record<ProjectActualBreakdownCategoryKey, string>;

  return {
    title: t('title'),
    currentContract: t('currentContract'),
    actualCost: t('actualCost'),
    openCommitments: t('openCommitments'),
    forecastFinal: t('forecastFinal'),
    billed: t('billed'),
    collected: t('collected'),
    actualProfit: t('actualProfit'),
    forecastProfit: t('forecastProfit'),
    unavailable: t('unavailable'),
    breakdownTitle: t('breakdownTitle'),
    categories,
    total: t('total'),
    percent: t('percent'),
    sources: t('sources'),
    expand: t('expand'),
    collapse: t('collapse'),
    hours: t('hours'),
    workDays: t('workDays'),
    missingCost: t('missingCost'),
    ofLabor: t('ofLabor'),
    period: t('period'),
    forecastFormulaTitle: t('forecastFormulaTitle'),
    forecastFormulaActual: t('forecastFormulaActual'),
    forecastFormulaCommitments: t('forecastFormulaCommitments'),
    forecastFormulaEtc: t('forecastFormulaEtc'),
    forecastFormulaEquals: t('forecastFormulaEquals'),
    profitFormulaTitle: t('profitFormulaTitle'),
    profitFormulaContract: t('profitFormulaContract'),
    profitFormulaForecast: t('profitFormulaForecast'),
    profitFormulaEquals: t('profitFormulaEquals'),
    openApCashNote: t('openApCashNote'),
    actualLabel: t('actualLabel'),
    commitmentLabel: t('commitmentLabel'),
    paidLabel: t('paidLabel'),
    openSource: t('openSource'),
  };
}

function buildMetrics(
  financials: Awaited<ReturnType<typeof getProjectFinancials>>,
  canReadProfit: boolean,
  canReadBilling: boolean,
): OwnerStoryMetrics {
  const kpis = resolveProjectKpiDisplay(financials);
  const priceNotSet = kpis.priceNotSet;

  return {
    currentContract: kpis.currentContract,
    actualCost: kpis.actualCost,
    openCommitments: kpis.committed,
    forecastFinal: kpis.forecastCost,
    billed: canReadBilling ? kpis.billed : null,
    collected: canReadBilling ? kpis.paid : null,
    outstanding: canReadBilling ? kpis.outstanding : null,
    unbilled: canReadBilling ? kpis.unbilled : null,
    actualProfit: canReadProfit ? kpis.actualMargin : null,
    forecastProfit: canReadProfit ? kpis.forecastMargin : null,
    expectedRemaining: kpis.expectedRemainingCost,
    openApPayable: financials.cost.openApPayable,
    priceNotSet,
  };
}

export async function ProjectOwnerActualExperience({
  projectId,
  variant,
}: {
  projectId: string;
  variant: 'overview' | 'financials';
}) {
  const copy = await loadOwnerStoryCopy();

  const loaded = await withOrgContext(async (context) => {
    const canRead = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
    if (!canRead) return null;
    // Already inside org context — do not nest loadCachedProjectFinancials (withOrgContext).
    // Financials panel may still share work via its own loadCached call in the same request
    // when React cache hits; otherwise one extra compose is acceptable (not N+1).
    const financials = await getProjectFinancials(context, projectId);
    const breakdownResult = await getProjectActualBreakdown(context, projectId, financials);
    return {
      breakdownResult,
      financials,
      canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
      canReadBilling: hasPermission(context, PERMISSIONS.BILLING_READ),
    };
  });

  if (!loaded) return null;

  const { breakdownResult, financials, canReadProfit, canReadBilling } = loaded;
  const result = { breakdownResult, financials };
  const metrics = buildMetrics(financials, canReadProfit, canReadBilling);

  if (variant === 'overview') {
    return (
      <div className="flex flex-col gap-4" data-pf-owner-actual-experience="overview">
        <Card className="min-w-0 max-w-full">
          <CardContent className="flex flex-col gap-4 pt-6">
            <ProjectOwnerStoryPanel copy={copy} metrics={metrics} />
            <div className="border-t border-[var(--pf-border-default)] pt-4">
              <ProjectActualBreakdownView
                breakdown={result.breakdownResult.breakdown}
                laborByEmployee={result.breakdownResult.laborByEmployee}
                copy={copy}
                projectId={projectId}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Financials order: Contract → Actual Breakdown → Commitments/Forecast → (panel continues Billing/Cash/Advanced)
  return (
    <div
      className="flex flex-col gap-4"
      data-pf-owner-actual-experience="financials"
      data-pf-financials-order="contract-breakdown-forecast"
    >
      <Card className="min-w-0 max-w-full" data-pf-contract-block>
        <CardContent className="flex flex-col gap-2 pt-6 text-sm">
          <h3 className="text-base font-semibold">{copy.currentContract}</h3>
          <div className="flex min-w-0 justify-between gap-3 font-semibold">
            <span className="text-[var(--pf-text-secondary)]">{copy.currentContract}</span>
            <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
              {metrics.priceNotSet || !metrics.currentContract ? (
                copy.unavailable
              ) : (
                <MoneyText value={metrics.currentContract} />
              )}
            </span>
          </div>
          <div className="flex min-w-0 justify-between gap-3 font-semibold">
            <span className="text-[var(--pf-text-secondary)]">{copy.actualCost}</span>
            <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
              {metrics.actualCost ? <MoneyText value={metrics.actualCost} /> : copy.unavailable}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full" data-pf-actual-breakdown-block>
        <CardContent className="pt-6">
          <ProjectActualBreakdownView
            breakdown={result.breakdownResult.breakdown}
            laborByEmployee={result.breakdownResult.laborByEmployee}
            copy={copy}
            projectId={projectId}
          />
        </CardContent>
      </Card>

      <Card className="min-w-0 max-w-full" data-pf-forecast-block>
        <CardContent className="pt-6">
          <ProjectForecastFormulaPanel copy={copy} metrics={metrics} />
        </CardContent>
      </Card>
    </div>
  );
}
