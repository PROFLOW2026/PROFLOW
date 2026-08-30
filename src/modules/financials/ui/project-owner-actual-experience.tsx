import { getTranslations } from 'next-intl/server';
import { Card, CardContent } from '@/components/ui/card';
import { MoneyText } from '@/components/patterns/money-text';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { getProjectActualBreakdown } from '../application/get-project-actual-breakdown';
import { getProjectAllocatedGeneralDetail } from '../application/get-project-allocated-general-detail';
import { loadCachedProjectFinancials } from '../application/load-cached-project-financials';
import type { getProjectFinancials } from '../application/get-project-financials';
import { resolveProjectProfitabilityDisplay } from '../domain/project-profitability-display';
import { DEFAULT_PROJECT_PROFITABILITY_MODE } from '@/modules/tenancy/domain/project-profitability-mode';
import { resolveProjectKpiDisplay } from './resolve-kpi-display';
import { AllocatedGeneralSummaryLine } from './allocated-general-detail-panel';
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
    ofWhich: t('ofWhich'),
    allocatedGeneral: t('allocatedGeneral'),
    openCommitments: t('openCommitments'),
    forecastFinal: t('forecastFinal'),
    directForecastFinal: t('directForecastFinal'),
    fullForecastFinal: t('fullForecastFinal'),
    futureGeneralAllocatedForecast: t('futureGeneralAllocatedForecast'),
    recognizedAllocatedGeneral: t('recognizedAllocatedGeneral'),
    billed: t('billed'),
    collected: t('collected'),
    actualProfit: t('actualProfit'),
    afterGeneralProfit: t('afterGeneralProfit'),
    forecastProfit: t('forecastProfit'),
    unavailable: t('unavailable'),
    breakdownTitle: t('breakdownTitle'),
    categories: {
      ...categories,
      allocatedGeneral: t('allocatedGeneral'),
    },
    directActualCost: t('directActualCost'),
    directBreakdownSectionTitle: t('directBreakdownSectionTitle'),
    fullCostLayerTitle: t('fullCostLayerTitle'),
    fullActualIncludingGeneral: t('fullActualIncludingGeneral'),
    allocatedGeneralDetail: {
      expand: t('expand'),
      collapse: t('collapse'),
      expenseAmount: t('allocatedGeneralDetail.expenseAmount'),
      allocatedToProject: t('allocatedGeneralDetail.allocatedToProject'),
      poolWeightPercent: t('allocatedGeneralDetail.poolWeightPercent'),
      informationalPercent: t('allocatedGeneralDetail.informationalPercent'),
      monthBreakdownTitle: t('allocatedGeneralDetail.monthBreakdownTitle'),
      supplier: t('allocatedGeneralDetail.supplier'),
      method: t('allocatedGeneralDetail.method'),
      poolOther: t('allocatedGeneralDetail.poolOther'),
      openExpense: t('allocatedGeneralDetail.openExpense'),
      sharedAcrossProjects: t.raw('allocatedGeneralDetail.sharedAcrossProjects') as string,
      methods: {
        manual_amount: t('allocatedGeneralDetail.methods.manual_amount'),
        manual_percent: t('allocatedGeneralDetail.methods.manual_percent'),
        contract_weight: t('allocatedGeneralDetail.methods.contract_weight'),
        labor_hours_weight: t('allocatedGeneralDetail.methods.labor_hours_weight'),
        direct_cost_weight: t('allocatedGeneralDetail.methods.direct_cost_weight'),
        equal_split: t('allocatedGeneralDetail.methods.equal_split'),
        direct_actual_weight: t('allocatedGeneralDetail.methods.direct_actual_weight'),
        none: t('allocatedGeneralDetail.methods.none'),
        category_default: t('allocatedGeneralDetail.methods.category_default'),
      },
    },
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
    subcontractGroupTotal: t('subcontractGroupTotal'),
    overheadCategoryHint: t('overheadCategoryHint'),
    allocatedGeneralCompanyOnlyNote: t('allocatedGeneralCompanyOnlyNote'),
    fullCostFormulaTitle: t('fullCostFormulaTitle'),
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
    allocatedGeneralBusinessCost: financials.cost.allocatedGeneralBusinessCost ?? null,
    openCommitments: kpis.committed,
    forecastFinal: kpis.directForecastCost,
    directForecastFinal: kpis.directForecastCost,
    fullForecastFinal: kpis.fullForecastCost,
    futureGeneralAllocatedForecast: kpis.futureGeneralAllocatedForecast,
    fullActualCost: kpis.fullActualCost,
    billed: canReadBilling ? kpis.billed : null,
    collected: canReadBilling ? kpis.paid : null,
    outstanding: canReadBilling ? kpis.outstanding : null,
    unbilled: canReadBilling ? kpis.unbilled : null,
    actualProfit: canReadProfit ? kpis.actualMargin : null,
    afterGeneralProfit:
      canReadProfit && kpis.showBothProfits ? kpis.afterGeneralProfit : null,
    forecastProfit: canReadProfit ? kpis.forecastMargin : null,
    fullForecastProfit: canReadProfit ? kpis.fullForecastMargin : null,
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

  const financials = await loadCachedProjectFinancials(projectId).catch(() => null);
  const loaded = await withOrgContext(async (context) => {
    const canRead = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
    if (!canRead || !financials) return null;
    const [breakdownResult, allocatedGeneralDetail] = await Promise.all([
      getProjectActualBreakdown(context, projectId, financials),
      getProjectAllocatedGeneralDetail(
        context,
        projectId,
        financials.cost.allocatedGeneralBusinessCost,
      ),
    ]);
    return {
      breakdownResult,
      allocatedGeneralDetail,
      canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
      canReadBilling: hasPermission(context, PERMISSIONS.BILLING_READ),
    };
  });

  if (!loaded || !financials) return null;

  const { breakdownResult, allocatedGeneralDetail, canReadProfit, canReadBilling } = loaded;
  const result = { breakdownResult, financials };
  const metrics = buildMetrics(financials, canReadProfit, canReadBilling);
  const profitabilityMode =
    financials.projectProfitabilityMode ?? DEFAULT_PROJECT_PROFITABILITY_MODE;
  const profitability = resolveProjectProfitabilityDisplay(
    profitabilityMode,
    financials.cost,
    financials.commercial?.currentContractValue ?? null,
    financials.priceNotSet === true,
  );
  const hasAllocatedGeneral =
    metrics.allocatedGeneralBusinessCost != null &&
    Number(metrics.allocatedGeneralBusinessCost.amount) > 0;
  const includeGeneralInPrimary = profitabilityMode === 'include_general';
  const allocatedGeneralDetailCopy = copy.allocatedGeneralDetail!;
  const allocatedGeneralProp = hasAllocatedGeneral
    ? {
        amount: metrics.allocatedGeneralBusinessCost!,
        includeInBreakdownTotal: includeGeneralInPrimary,
        detail: allocatedGeneralDetail,
      }
    : null;
  const costComposition =
    hasAllocatedGeneral && !includeGeneralInPrimary
      ? {
          directActual: financials.cost.actualCostToDate,
          fullActual: profitability.fullActualCost,
        }
      : null;

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
                allocatedGeneral={allocatedGeneralProp}
                breakdownTotalOverride={
                  includeGeneralInPrimary ? profitability.fullActualCost : null
                }
                costComposition={costComposition}
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
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex min-w-0 justify-between gap-3 font-semibold">
              <span className="text-[var(--pf-text-secondary)]">
                {includeGeneralInPrimary ? copy.actualCost : copy.directActualCost}
              </span>
              <span className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                {metrics.actualCost ? <MoneyText value={metrics.actualCost} /> : copy.unavailable}
              </span>
            </div>
            {!includeGeneralInPrimary && hasAllocatedGeneral ? (
              <>
                <AllocatedGeneralSummaryLine
                  label={copy.allocatedGeneral}
                  amount={metrics.allocatedGeneralBusinessCost!}
                  detail={allocatedGeneralDetail}
                  copy={allocatedGeneralDetailCopy}
                  projectId={projectId}
                />
                <div className="flex min-w-0 justify-between gap-3 text-sm text-[var(--pf-text-secondary)]">
                  <span>{copy.fullActualIncludingGeneral}</span>
                  <span className="min-w-0 max-w-[55%] overflow-x-auto text-end font-medium text-[var(--pf-text-primary)]">
                    <MoneyText value={profitability.fullActualCost} />
                  </span>
                </div>
              </>
            ) : null}
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
            allocatedGeneral={allocatedGeneralProp}
            breakdownTotalOverride={
              includeGeneralInPrimary ? profitability.fullActualCost : null
            }
            costComposition={costComposition}
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
