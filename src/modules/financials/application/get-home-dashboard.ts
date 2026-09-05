import {
  areEmployeeMonthCostsAvailable,
  hasWorkforceLaborData,
  mergeResidualTimeAndMonthlyAllocatedLabor,
  sumMonthlyAllocatedLaborByProject,
  sumOrganizationProjectLaborCoverage,
  sumTimeLaborPeriodReconciliation,
} from '@/modules/workforce';
import { getOrganizationApPayables } from '@/modules/ap';
import {
  getBusinessProfileKeyForOrg,
  getModuleVisibility,
  getSuggestedDefaultsForOrg,
  getWorkMixForOrg,
  dashboardCardsForPersona,
  personaForBusinessProfile,
  workMixSurfacesJobs,
  type ExperienceDashboardCard,
  type ExperiencePersonaKey,
} from '@/modules/tenancy';
import {
  canUseExperiencePreview,
  resolveExperiencePreview,
} from '@/modules/tenancy/domain/experience-preview';
import { readExperiencePreviewCookie } from '@/modules/tenancy/application/experience-preview';
import { serverEnv } from '@/shared/env/server';
import type { CostSourceKey, FinancialCoverage } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { endOfMonth, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { addMoney, fromNumericString, isZeroMoney, money, zeroMoney, type MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  mergeDataConfidence,
  dataConfidenceFromCoverage,
  type DataConfidence,
} from '../domain/data-confidence';
import {
  buildDashboardMissingDataItems,
  resolveDashboardKpiAvailability,
  type DashboardKpiAvailabilityMap,
  type DashboardMissingDataItem,
} from '../domain/dashboard-missing-data';
import { buildFinancialCoverage, mergeCoveragePartials } from '../domain/coverage';
import type { CoveragePartial } from '../domain/types';
import { aggregateProjectCosts } from '../domain/cost-aggregation';
import {
  aggregateOrgCommercial,
  aggregateOrgCost,
  aggregateOrgProfit,
  deriveRecognizedCompanyRevenue,
} from '../domain/aggregate-org-report';
import {
  computeUnallocatedOrganizationCosts,
  sumProjectTouchingExpenseNets,
} from '../domain/org-cost-reconciliation';
import {
  computeBillingPositionFromRows,
  countOverdueFromBillingRows,
  hasAnyBillingUsage,
  loadOrganizationBillingRows,
  sumInvoicedInDateRange,
  sumCollectionsInDateRange,
} from '../data/billing.repository';
import {
  countPendingChanges,
  countUnbilledApprovedChanges,
} from '../data/commercial.repository';
import {
  hasAnyExpenseUsage,
  listUnallocatedBusinessExpenses,
  loadOrganizationExpenseContributions,
  sumOrganizationActualCosts,
  sumOrganizationRecognizedCostsInDateRange,
} from '../data/expenses.repository';
import {
  countActiveProjects,
  hasAnyProject,
  listRecentActiveProjects,
  loadActiveProjectClientNames,
  type ActiveProjectSummary,
} from '../data/projects.repository';
import { getOrganizationProjectRollup } from './get-organization-project-rollup';
import { sumOrganizationGeneralPoolTotals } from '../data/general-cost-months.repository';
import {
  composeCompanyActual,
  composeCompanyProfit,
  shouldSurfaceCompanyActual,
  shouldSurfaceCompanyProfit,
} from '../domain/company-actual';
import { parseWorkKindFilter } from '../domain/work-pricing';

export interface DashboardAttention {
  readonly pendingChangesCount: number;
  readonly unbilledApprovedCount: number;
  readonly overdueBillingCount: number;
}

/** Draft / submitted time in the selected period — not in labor Actual. */
export interface PendingTimeAlert {
  readonly pendingTimeCount: number;
  readonly affectedEmployees: number;
  readonly pendingHours: number;
}

/** Allocated (approved) + unallocated (draft/submitted) = total recorded labor hours. */
export interface LaborReconciliation {
  readonly allocatedHours: number;
  readonly unallocatedHours: number;
  readonly totalHours: number;
}

/**
 * Organization forecast reconciliation across all base-currency active projects.
 * Unallocated business costs are disclosed beside project totals - never forced into profit.
 */
export interface OrganizationForecastSummary {
  readonly totalCurrentContract: MoneyValue;
  /** Null when org Actual is withheld (permission / incomplete KPI — N-002). */
  readonly totalActualProjectCost: MoneyValue | null;
  readonly totalAllocatedOverhead: MoneyValue | null;
  readonly totalRemainingCommitments: MoneyValue | null;
  readonly totalExpectedRemaining: MoneyValue | null;
  readonly totalForecastFinalCost: MoneyValue | null;
  readonly totalActualMargin: MoneyValue | null;
  readonly totalForecastMargin: MoneyValue | null;
  /** Finalized org costs awaiting allocation - not in project Actual / profit. */
  readonly unallocatedBusinessCosts: MoneyValue | null;
  /** Company Actual when a general-cost pool exists (Direct + general; allocation is attribution only). */
  readonly companyActual: MoneyValue | null;
  /** Recognized revenue − Company Actual; null when revenue or company actual context is unavailable. */
  readonly companyProfit: MoneyValue | null;
  readonly eligibleProjectCount: number;
  readonly excludedForeignCurrencyCount: number;
}

export interface HomeDashboardProjectTableRow {
  readonly projectId: string;
  readonly name: string;
  readonly clientName: string | null;
  readonly currentContract: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly actualProfit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly status: string;
}

export interface HomeDashboardData {
  readonly isBrandNew: boolean;
  readonly activeProjectCount: number;
  readonly recentProjects: readonly ActiveProjectSummary[];
  /** Active projects with financial rollup for owner dashboard table. */
  readonly projectTableRows: readonly HomeDashboardProjectTableRow[];
  /** Org actual profit (sum of project actual margins). */
  readonly actualProfitTotal: MoneyValue | null;
  /** Org profitability % from actual profit / contract value. */
  readonly profitabilityPercent: string | null;
  readonly totalContractValue: MoneyValue | null;
  readonly contractValueCoverage: FinancialCoverage | null;
  readonly totalActualCost: MoneyValue | null;
  readonly costCoverage: FinancialCoverage | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly profitCoverage: FinancialCoverage | null;
  /** Full org forecast rollup (closes Wave 2 Actual-centric home limitation). */
  readonly forecast: OrganizationForecastSummary | null;
  readonly billing: {
    readonly invoiced: MoneyValue;
    readonly paid: MoneyValue;
    readonly outstanding: MoneyValue;
  } | null;
  readonly billingCoverage: FinancialCoverage | null;
  readonly organizationSummary: {
    readonly outstanding: MoneyValue;
    readonly invoicedThisMonth: MoneyValue;
    readonly collectionsThisMonth: MoneyValue;
    readonly costsThisMonth: MoneyValue;
  } | null;
  readonly attention: DashboardAttention;
  /** Null when the user cannot read workforce or there is nothing pending. */
  readonly pendingTime: PendingTimeAlert | null;
  /** Null when there are no recorded hours in the selected period. */
  readonly laborReconciliation: LaborReconciliation | null;
  readonly canApproveTime: boolean;
  readonly showBilling: boolean;
  readonly showProfit: boolean;
  readonly canCreateProject: boolean;
  readonly canCreateExpense: boolean;
  readonly canReadToday: boolean;
  /**
   * Brand-new empty CTA: which work surface to start with (profile / work mix).
   * Always set so the dashboard empty state stays honest for jobs/service orgs.
   */
  readonly emptyStartKind: 'project' | 'job' | 'work_order';
  /**
   * Profile / work-mix bias for home chrome (empty CTA + attention order).
   * Does not change financial totals.
   */
  readonly preferServiceSurface: boolean;
  /** Org-scope DATA CONFIDENCE (worst-of projects + unallocated / FX). */
  readonly dataConfidence: DataConfidence | null;
  /** Structured gaps for actionable dashboard UX (derived — no extra queries). */
  readonly missingDataItems: readonly DashboardMissingDataItem[];
  readonly kpiAvailability: DashboardKpiAvailabilityMap | null;
  readonly persona: ExperiencePersonaKey;
  readonly dashboardCards: readonly ExperienceDashboardCard[];
  /** Quotes module visible — used for quotePipeline card chrome. */
  readonly showQuotes: boolean;
  /**
   * Total AP outstanding (unpaid vendor bills, base currency).
   * Null when the user lacks AP_READ permission or no AP bills exist.
   */
  readonly apOutstanding: MoneyValue | null;
  /**
   * The effective month being shown as "YYYY-MM".
   * Defaults to the current month; can be overridden via the `selectedMonth` option.
   */
  readonly selectedMonth: string;
  /**
   * Work-kind filter active during this load — preserved in month-navigation links.
   * Null / "all" means no filter.
   */
  readonly workKindFilter: string | null;
}

export interface HomeDashboardOptions {
  /** All | Projects | Jobs for forecast / rollup scope. Default: all. */
  readonly workKindFilter?: string | null;
  /**
   * Month to show for the `organizationSummary` KPIs (costsThisMonth / invoicedThisMonth).
   * Format: "YYYY-MM". Defaults to the current month when omitted or invalid.
   */
  readonly selectedMonth?: string | null;
}

export async function getHomeDashboard(
  context: OrgContext,
  options: HomeDashboardOptions = {},
): Promise<HomeDashboardData> {
  const currency = context.organization.baseCurrency;
  const today = todayInTimeZone(context.organization.timezone);

  // Resolve effective month — default to current, allow override via options.
  const rawSelectedMonth =
    options.selectedMonth && /^\d{4}-\d{2}$/.test(options.selectedMonth)
      ? options.selectedMonth
      : null;
  const effectiveSelectedMonth = rawSelectedMonth ?? today.slice(0, 7);
  const monthStart = `${effectiveSelectedMonth}-01` as BusinessDate;
  const monthEnd = endOfMonth(monthStart);

  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canReadProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canReadContracts = hasPermission(context, PERMISSIONS.CONTRACTS_READ);
  const canCreateProject = hasPermission(context, PERMISSIONS.PROJECTS_CREATE);
  const canCreateExpense = hasPermission(context, PERMISSIONS.EXPENSES_CREATE);
  const canReadToday = hasPermission(context, PERMISSIONS.COMMAND_CENTER_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canCreateService = hasPermission(context, PERMISSIONS.SERVICE_MANAGE);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const canApproveTime = hasPermission(context, PERMISSIONS.TIME_APPROVE);

  const [workMix, suggestedDefaults, modules, businessProfileKey, previewSelection] =
    await Promise.all([
      getWorkMixForOrg(context),
      getSuggestedDefaultsForOrg(context.db, context.organizationId),
      getModuleVisibility(context),
      getBusinessProfileKeyForOrg(context.db, context.organizationId),
      readExperiencePreviewCookie(),
    ]);

  const env = serverEnv();
  const previewAllowed = canUseExperiencePreview(
    context.roleKeys,
    env.APP_ENV,
    env.PF_EXPERIENCE_PREVIEW,
  );
  const preview = resolveExperiencePreview(previewAllowed ? previewSelection : 'actual');
  const effectiveProfileKey =
    preview.active && preview.profileKey ? preview.profileKey : businessProfileKey;
  const persona = personaForBusinessProfile(effectiveProfileKey);
  const dashboardCards = dashboardCardsForPersona(persona);
  const effectiveModules =
    preview.active && preview.modules ? preview.modules : modules;
  const effectiveWorkMix =
    preview.active && preview.workMix != null ? preview.workMix : workMix;
  const effectiveSuggestedDefaults =
    preview.active && preview.suggestedDefaults
      ? preview.suggestedDefaults
      : suggestedDefaults;
  const showQuotes = Boolean(effectiveModules.quotes);
  const jobsReachable =
    Boolean(effectiveModules.jobs) || workMixSurfacesJobs(effectiveWorkMix);
  const serviceReachable = Boolean(effectiveModules.service) && canCreateService;
  const preferServiceSurface = Boolean(effectiveSuggestedDefaults?.preferServiceSurface);
  const slimOwnerDashboard =
    !preferServiceSurface &&
    (persona === 'project_contractor' ||
      persona === 'renovation' ||
      persona === 'architecture' ||
      persona === 'consulting' ||
      persona === 'mixed');
  let emptyStartKind: 'project' | 'job' | 'work_order' = 'project';
  if (
    serviceReachable &&
    canCreateProject &&
    (effectiveSuggestedDefaults?.preferServiceSurface ||
      effectiveSuggestedDefaults?.defaultWorkKind === 'work_order')
  ) {
    emptyStartKind = 'work_order';
  } else if (
    canCreateProject &&
    jobsReachable &&
    (effectiveWorkMix === 'jobs' ||
      effectiveSuggestedDefaults?.defaultWorkKind === 'job' ||
      effectiveSuggestedDefaults?.defaultWorkKind === 'work_order')
  ) {
    emptyStartKind = 'job';
  }

  // Kick off org financial rollup in parallel with existence probes.
  // Brand-new orgs discard the result - empty rollup is cheap; warm path saves a full wave.
  const orgExpenseContributionsPromise =
    canReadFinancials && canReadExpenses
      ? loadOrganizationExpenseContributions(context.db, context.organizationId)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof loadOrganizationExpenseContributions>>,
        );

  const rollupPromise = canReadFinancials
    ? orgExpenseContributionsPromise.then((expenseContributions) =>
        getOrganizationProjectRollup(context, {
          workKindFilter: options.workKindFilter,
          expenseContributions,
        }),
      )
    : Promise.resolve(null);

  const expenseLayerPromise = canReadFinancials
    ? collectOrgExpenseLayer(context, currency, orgExpenseContributionsPromise)
    : Promise.resolve(null);

  const [
    hasProjects,
    hasExpenses,
    hasBilling,
    activeProjectCount,
    recentProjects,
    pendingChangesCount,
    unbilledApprovedCount,
    rollup,
    expenseLayer,
    timeLaborPeriod,
  ] = await Promise.all([
    hasAnyProject(context.db, context.organizationId),
    hasAnyExpenseUsage(context.db, context.organizationId),
    hasAnyBillingUsage(context.db, context.organizationId),
    countActiveProjects(context.db, context.organizationId),
    listRecentActiveProjects(context.db, context.organizationId),
    canReadContracts
      ? countPendingChanges(context.db, context.organizationId)
      : Promise.resolve(0),
    canReadContracts
      ? countUnbilledApprovedChanges(context.db, context.organizationId)
      : Promise.resolve(0),
    rollupPromise,
    expenseLayerPromise,
    canReadWorkforce
      ? sumTimeLaborPeriodReconciliation(
          context.db,
          context.organizationId,
          monthStart,
          monthEnd,
        )
      : Promise.resolve(null),
  ]);

  const pendingTime: PendingTimeAlert | null =
    timeLaborPeriod && timeLaborPeriod.pendingTimeCount > 0
      ? {
          pendingTimeCount: timeLaborPeriod.pendingTimeCount,
          affectedEmployees: timeLaborPeriod.affectedEmployees,
          pendingHours: timeLaborPeriod.pendingHours,
        }
      : null;
  const laborReconciliation: LaborReconciliation | null = timeLaborPeriod
    ? (() => {
        const allocatedHours = timeLaborPeriod.allocatedHours;
        const unallocatedHours = timeLaborPeriod.pendingHours;
        const totalHours = allocatedHours + unallocatedHours;
        return totalHours > 0 ? { allocatedHours, unallocatedHours, totalHours } : null;
      })()
    : null;

  const isBrandNew = !hasProjects && !hasExpenses && !hasBilling;

  if (isBrandNew) {
    return {
      isBrandNew: true,
      activeProjectCount,
      recentProjects,
      projectTableRows: [],
      actualProfitTotal: null,
      profitabilityPercent: null,
      totalContractValue: null,
      contractValueCoverage: null,
      totalActualCost: null,
      costCoverage: null,
      estimatedProfit: null,
      profitCoverage: null,
      forecast: null,
      billing: null,
      billingCoverage: null,
      organizationSummary: null,
      attention: {
        pendingChangesCount,
        unbilledApprovedCount,
        overdueBillingCount: 0,
      },
      pendingTime,
      laborReconciliation,
      canApproveTime,
      showBilling: false,
      showProfit: false,
      canCreateProject,
      canCreateExpense,
      canReadToday,
      emptyStartKind,
      preferServiceSurface,
      dataConfidence: null,
      missingDataItems: [],
      kpiAvailability: null,
      persona,
      dashboardCards,
      showQuotes,
      apOutstanding: null,
      selectedMonth: effectiveSelectedMonth,
      workKindFilter: options.workKindFilter ?? null,
    };
  }

  const wantBilling = canReadBilling && hasBilling;
  const wantMonthInvoiced = !slimOwnerDashboard && canReadFinancials && wantBilling;
  const wantMonthCosts = !slimOwnerDashboard && canReadFinancials && (wantBilling || hasExpenses);
  const wantMonthCollections = !slimOwnerDashboard && canReadFinancials && wantBilling;

  const [
    billingRows,
    invoicedThisMonth,
    costsThisMonth,
    collectionsThisMonth,
    generalPoolTotals,
    apPayablesSummary,
  ] = await Promise.all([
    wantBilling
      ? loadOrganizationBillingRows(context.db, context.organizationId)
      : Promise.resolve(null),
    wantMonthInvoiced
      ? sumInvoicedInDateRange(
          context.db,
          context.organizationId,
          currency,
          monthStart,
          monthEnd,
        )
      : Promise.resolve(null),
    wantMonthCosts
      ? sumOrganizationRecognizedCostsInDateRange(
          context.db,
          context.organizationId,
          currency,
          monthStart,
          monthEnd,
        )
      : Promise.resolve(null),
    wantMonthCollections
      ? sumCollectionsInDateRange(
          context.db,
          context.organizationId,
          currency,
          monthStart,
          monthEnd,
        )
      : Promise.resolve(null),
    canReadFinancials && !slimOwnerDashboard
      ? sumOrganizationGeneralPoolTotals(context.db, context.organizationId, currency)
      : Promise.resolve(null),
    // AP outstanding: base-currency bills not yet paid. Only loaded when permissioned.
    canReadAp
      ? getOrganizationApPayables(context, { currency })
      : Promise.resolve(null),
  ]);

  // Derive AP outstanding KPI: non-null only when AP bills exist in base currency.
  const apOutstanding: MoneyValue | null =
    apPayablesSummary && apPayablesSummary.bills.length > 0
      ? money(apPayablesSummary.outstanding, apPayablesSummary.currency)
      : null;

  // Derive overdue from the billing rows already loaded - avoid a second full org load.
  const overdueBillingCount = billingRows
    ? countOverdueFromBillingRows(billingRows, today)
    : 0;

  const costCoverageBundle = expenseLayer?.coverage ?? null;
  const unallocatedBusinessCosts = expenseLayer?.unallocatedBusinessCosts ?? null;

  let totalContractValue: MoneyValue | null = null;
  let contractValueCoverage: FinancialCoverage | null = null;
  let totalActualCost: MoneyValue | null = null;
  let costCoverage: FinancialCoverage | null = null;
  let profitCoverage: FinancialCoverage | null = null;
  let estimatedProfit: MoneyValue | null = null;
  let forecast: OrganizationForecastSummary | null = null;

  if (rollup) {
    const commercial = rollup.canReadCommercial
      ? aggregateOrgCommercial(rollup.rows, currency)
      : null;
    const cost = aggregateOrgCost(rollup.rows, currency, {
      unallocatedBusinessCosts,
    });
    const profitability = rollup.canReadProfit
      ? aggregateOrgProfit(rollup.rows, currency)
      : null;

    if (commercial && rollup.totalEligibleProjectCount > 0) {
      totalContractValue = commercial.current.value;
      if (rollup.excludedForeignCurrencyCount > 0) {
        contractValueCoverage = buildFinancialCoverage([], new Date(), [
          {
            reason: 'foreign_currency_contracts_excluded',
            count: rollup.excludedForeignCurrencyCount,
          },
        ]);
      }
    }

    const hasProjectCost =
      rollup.totalEligibleProjectCount > 0 &&
      (costCoverageBundle?.hasCostData ||
        (cost.actual != null && !isZeroMoney(cost.actual.value)) ||
        (cost.committed != null && !isZeroMoney(cost.committed.value)) ||
        (cost.expectedRemaining != null && !isZeroMoney(cost.expectedRemaining.value)) ||
        (cost.estimatedFinal != null && !isZeroMoney(cost.estimatedFinal.value)));

    if (hasProjectCost || (unallocatedBusinessCosts && !isZeroMoney(unallocatedBusinessCosts))) {
      // Never substitute zero when Actual was withheld on every row (N-002).
      totalActualCost = cost.actual?.value ?? null;
      if (costCoverageBundle) {
        const mergedSources = mergeSourcePresence(costCoverageBundle.sources);
        const mergedPartials = mergeCoveragePartials(
          costCoverageBundle.partials,
          contractValueCoverage?.partials ?? [],
        );
        costCoverage = buildFinancialCoverage(mergedSources, new Date(), mergedPartials);
        profitCoverage = costCoverage;
      }

      if (canReadProfit && profitability) {
        estimatedProfit = profitability.estimatedProfit?.value ?? null;
      }
    }

    const workKindFilter = parseWorkKindFilter(options.workKindFilter);
    const companyComposition =
      !slimOwnerDashboard && workKindFilter === 'all' && generalPoolTotals
        ? composeCompanyActual({
            currency,
            directProjectActual: cost.actual?.value ?? zeroMoney(currency),
            generalPool: fromNumericString(generalPoolTotals.pool, currency) ?? zeroMoney(currency),
            allocatedGeneralToProjects:
              fromNumericString(generalPoolTotals.allocated, currency) ?? zeroMoney(currency),
            unallocatableGeneral:
              fromNumericString(generalPoolTotals.unallocatable, currency) ?? zeroMoney(currency),
          })
        : null;
    const companyActual = shouldSurfaceCompanyActual(companyComposition)
      ? (companyComposition?.companyActual ?? null)
      : null;
    const recognizedCompanyRevenue = deriveRecognizedCompanyRevenue(
      rollup.rows,
      currency,
      rollup.canReadCommercial,
    );
    const companyProfitComposition =
      companyComposition && canReadProfit
        ? composeCompanyProfit({
            currency,
            recognizedCompanyRevenue,
            companyActual: companyComposition.companyActual,
          })
        : null;
    const companyProfit = shouldSurfaceCompanyProfit(
      companyComposition,
      companyProfitComposition,
    )
      ? (companyProfitComposition?.companyProfit ?? null)
      : null;

    forecast = {
      totalCurrentContract: commercial?.current.value ?? zeroMoney(currency),
      totalActualProjectCost: cost.actual?.value ?? null,
      totalAllocatedOverhead: slimOwnerDashboard ? null : (cost.overhead?.value ?? null),
      totalRemainingCommitments: slimOwnerDashboard ? null : (cost.committed?.value ?? null),
      totalExpectedRemaining: slimOwnerDashboard ? null : (cost.expectedRemaining?.value ?? null),
      totalForecastFinalCost: slimOwnerDashboard ? null : (cost.estimatedFinal?.value ?? null),
      totalActualMargin: canReadProfit ? (profitability?.actualProfit?.value ?? null) : null,
      totalForecastMargin: slimOwnerDashboard
        ? null
        : canReadProfit
          ? (profitability?.estimatedProfit?.value ?? null)
          : null,
      unallocatedBusinessCosts: slimOwnerDashboard ? null : (unallocatedBusinessCosts ?? null),
      companyActual,
      companyProfit,
      eligibleProjectCount: rollup.totalEligibleProjectCount,
      excludedForeignCurrencyCount: rollup.excludedForeignCurrencyCount,
    };
  }

  let billing: HomeDashboardData['billing'] = null;
  let billingCoverage: FinancialCoverage | null = null;
  let organizationSummary: HomeDashboardData['organizationSummary'] = null;

  if (billingRows && !slimOwnerDashboard) {
    const position = computeBillingPositionFromRows(billingRows, currency);
    billing = {
      invoiced: position.invoiced,
      paid: position.paid,
      outstanding: position.outstanding,
    };
    if (position.excludedForeignCurrencyRecordCount > 0) {
      billingCoverage = buildFinancialCoverage([], new Date(), [
        {
          reason: 'foreign_currency_billing_excluded',
          count: position.excludedForeignCurrencyRecordCount,
        },
      ]);
    }

    if (canReadFinancials && invoicedThisMonth && costsThisMonth) {
      organizationSummary = {
        outstanding: position.outstanding,
        invoicedThisMonth,
        collectionsThisMonth: collectionsThisMonth ?? zeroMoney(currency),
        costsThisMonth,
      };
    }
  } else if (!slimOwnerDashboard && canReadFinancials && hasExpenses && costsThisMonth) {
    organizationSummary = {
      outstanding: zeroMoney(currency),
      invoicedThisMonth: zeroMoney(currency),
      collectionsThisMonth: zeroMoney(currency),
      costsThisMonth,
    };
  }

  const dataConfidencePieces: DataConfidence[] = [];
  if (rollup?.dataConfidence) {
    dataConfidencePieces.push({
      level: rollup.dataConfidence.level,
      reasons: rollup.dataConfidence.reasons as DataConfidence['reasons'],
    });
  }
  if (costCoverage) {
    dataConfidencePieces.push(
      dataConfidenceFromCoverage(costCoverage, {
        unallocatedRemainder: unallocatedBusinessCosts,
      }),
    );
  } else if (unallocatedBusinessCosts && !isZeroMoney(unallocatedBusinessCosts)) {
    dataConfidencePieces.push(
      dataConfidenceFromCoverage(buildFinancialCoverage([], new Date()), {
        unallocatedRemainder: unallocatedBusinessCosts,
      }),
    );
  }
  if (billingCoverage) {
    dataConfidencePieces.push(dataConfidenceFromCoverage(billingCoverage));
  }
  const dataConfidence =
    canReadFinancials && dataConfidencePieces.length > 0
      ? mergeDataConfidence(dataConfidencePieces)
      : canReadFinancials
        ? ({ level: 'high', reasons: [] } satisfies DataConfidence)
        : null;

  const missingDataItems =
    canReadFinancials && dataConfidence
      ? buildDashboardMissingDataItems({
          dataConfidence,
          costCoverage,
          contractValueCoverage,
          billingCoverage,
          unallocatedBusinessCosts,
          unallocatedExpensePreview:
            canReadExpenses &&
            unallocatedBusinessCosts &&
            !isZeroMoney(unallocatedBusinessCosts)
              ? await listUnallocatedBusinessExpenses(
                  context.db,
                  context.organizationId,
                  currency,
                  5,
                ).then((preview) => ({
                  count: preview.totalCount,
                  amount: unallocatedBusinessCosts,
                  samples: preview.items,
                }))
              : null,
          openPriceProjectCount: rollup?.openPriceProjectCount ?? 0,
          pricedProjectCount: rollup?.pricedProjectCount ?? 0,
          excludedForeignCurrencyCount: rollup?.excludedForeignCurrencyCount ?? 0,
          projectMissingCostSignals: rollup?.projectMissingCostSignals ?? [],
        })
      : [];

  const kpiAvailability =
    canReadFinancials && rollup
      ? resolveDashboardKpiAvailability({
          missingItems: missingDataItems,
          openPriceProjectCount: rollup.openPriceProjectCount,
          pricedProjectCount: rollup.pricedProjectCount,
          hasContractValue: totalContractValue != null,
          hasProfitValue: estimatedProfit != null,
          hasActualCost: (forecast?.totalActualProjectCost ?? totalActualCost) != null,
          hasForecastCost: forecast?.totalForecastFinalCost != null,
          hasCommitted: forecast?.totalRemainingCommitments != null,
        })
      : null;

  let projectTableRows: HomeDashboardProjectTableRow[] = [];
  let actualProfitTotal: MoneyValue | null = null;
  let profitabilityPercent: string | null = null;

  if (rollup && canReadFinancials) {
    const clientNames = await loadActiveProjectClientNames(context.db, context.organizationId);
    projectTableRows = rollup.rows.map((row) => ({
      projectId: row.projectId,
      name: row.name,
      clientName: clientNames.get(row.projectId) ?? null,
      currentContract: row.currentContract,
      actualCost: row.actualCost,
      actualProfit: row.actualProfit,
      marginPercent: row.actualMarginPercent,
      status: row.status,
    }));
    const profitTotals = aggregateOrgProfit(rollup.rows, currency);
    actualProfitTotal = profitTotals.actualProfit?.value ?? forecast?.totalActualMargin ?? null;
    if (actualProfitTotal && totalContractValue) {
      const contractAmt = Number.parseFloat(totalContractValue.amount);
      const profitAmt = Number.parseFloat(actualProfitTotal.amount);
      if (contractAmt > 0 && Number.isFinite(profitAmt)) {
        profitabilityPercent = ((profitAmt / contractAmt) * 100).toFixed(1);
      }
    }
  }

  return {
    isBrandNew,
    activeProjectCount,
    recentProjects,
    projectTableRows,
    actualProfitTotal,
    profitabilityPercent,
    totalContractValue,
    contractValueCoverage,
    totalActualCost,
    costCoverage,
    estimatedProfit,
    profitCoverage,
    forecast,
    billing,
    billingCoverage,
    organizationSummary,
    attention: {
      pendingChangesCount,
      unbilledApprovedCount,
      overdueBillingCount,
    },
    pendingTime,
    laborReconciliation,
    canApproveTime,
    showBilling: hasBilling && canReadBilling,
    showProfit: canReadProfit && estimatedProfit !== null,
    canCreateProject,
    canCreateExpense,
    canReadToday,
    emptyStartKind,
    preferServiceSurface,
    dataConfidence,
    missingDataItems,
    kpiAvailability,
    persona,
    dashboardCards,
    showQuotes,
    apOutstanding,
    selectedMonth: effectiveSelectedMonth,
    workKindFilter: options.workKindFilter ?? null,
  };
}

/**
 * Expense-layer coverage + unallocated org costs in one pass.
 * Unallocated = org finalized expense NET − project-touching expense NET.
 *
 * When `contributionsPromise` is provided, reuse that authoritative load
 * instead of querying organization expense contributions again.
 */
async function collectOrgExpenseLayer(
  context: OrgContext,
  currency: string,
  contributionsPromise?: Promise<
    Awaited<ReturnType<typeof loadOrganizationExpenseContributions>>
  >,
): Promise<{
  coverage: {
    sources: { source: CostSourceKey; hasData: boolean }[];
    partials: CoveragePartial[];
    hasCostData: boolean;
  };
  unallocatedBusinessCosts: MoneyValue | null;
}> {
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const monthCostsReady = canReadWorkforce && areEmployeeMonthCostsAvailable();

  const [contributions, laborAgg, monthlyLaborByProject, orgExpense] = await Promise.all([
    canReadExpenses
      ? (contributionsPromise ??
        loadOrganizationExpenseContributions(context.db, context.organizationId))
      : Promise.resolve([]),
    canReadWorkforce
      ? sumOrganizationProjectLaborCoverage(context.db, context.organizationId, currency)
      : Promise.resolve(null),
    monthCostsReady
      ? sumMonthlyAllocatedLaborByProject(context.db, context.organizationId, null, currency)
      : Promise.resolve(new Map()),
    canReadExpenses
      ? sumOrganizationActualCosts(context.db, context.organizationId, currency)
      : Promise.resolve({ total: zeroMoney(currency), hasExpenseData: false }),
  ]);

  const projectTouching = sumProjectTouchingExpenseNets(contributions, currency);
  // Do not invent a confident zero unallocated when expenses are permission-denied.
  const unallocatedBusinessCosts = canReadExpenses
    ? computeUnallocatedOrganizationCosts({
        orgFinalizedExpenseTotal: orgExpense.total,
        projectTouchingExpenseTotal: projectTouching,
      })
    : null;

  const residualTimeLabor =
    fromNumericString(laborAgg?.totalAmount ?? '0', currency) ?? zeroMoney(currency);
  let monthlyAllocatedLabor = zeroMoney(currency);
  const projectIdsWithWorkforceLabor = new Set(laborAgg?.projectIdsWithLabor ?? []);
  for (const [projectId, monthlyAgg] of monthlyLaborByProject) {
    projectIdsWithWorkforceLabor.add(projectId);
    const amount =
      fromNumericString(monthlyAgg.totalAmount, currency) ?? zeroMoney(currency);
    monthlyAllocatedLabor = addMoney(monthlyAllocatedLabor, amount);
  }

  const residualEntryCount = laborAgg?.entryCount ?? 0;
  const hasWorkforce = hasWorkforceLaborData({
    residualEntryCount,
    monthlyAllocatedLabor,
  });

  let labor = null;
  if (hasWorkforce) {
    labor = {
      laborCost: mergeResidualTimeAndMonthlyAllocatedLabor({
        residualTimeLabor,
        monthlyAllocatedLabor,
      }),
      hasWorkforceData: true,
      entriesMissingCost: laborAgg?.entriesMissingCost ?? 0,
      excludedForeignCurrencyEntries: laborAgg?.excludedForeignCurrencyEntries ?? 0,
      projectIdsWithWorkforceLabor,
    };
  }

  if (contributions.length === 0 && !labor?.hasWorkforceData) {
    return {
      coverage: { sources: [], partials: [], hasCostData: false },
      unallocatedBusinessCosts,
    };
  }

  const aggregated = aggregateProjectCosts(contributions, labor, currency);
  return {
    coverage: {
      sources: [...aggregated.sources],
      partials: [...aggregated.partials],
      hasCostData: true,
    },
    unallocatedBusinessCosts,
  };
}

function mergeSourcePresence(
  sources: readonly { source: CostSourceKey; hasData: boolean }[],
): { source: CostSourceKey; hasData: boolean }[] {
  const map = new Map<string, boolean>();
  for (const item of sources) {
    map.set(item.source, (map.get(item.source) ?? false) || item.hasData);
  }

  return (
    [
      'direct_expenses',
      'workforce',
      'allocated_overhead',
      'shared_costs',
      'subcontractor',
    ] as const
  ).map((source) => ({
    source,
    hasData: map.get(source) ?? false,
  }));
}
