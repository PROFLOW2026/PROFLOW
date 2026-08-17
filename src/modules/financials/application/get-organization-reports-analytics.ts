import { listBillingRecords, computeReceivablesAging } from '@/modules/billing';
import type { ReceivablesAging } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { isZeroMoney, zeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  aggregateOrgCash,
  aggregateOrgCommercial,
  aggregateOrgCost,
  aggregateOrgProfit,
  sumAssetCapitalActual,
  type OrgCashTotals,
  type OrgCommercialTotals,
  type OrgCostTotals,
  type OrgProfitTotals,
} from '../domain/aggregate-org-report';
import {
  computeUnallocatedOrganizationCosts,
  sumProjectTouchingExpenseNets,
} from '../domain/org-cost-reconciliation';
import { hasNonZeroMoney, type CountReportMetric } from '../domain/report-metric';
import {
  loadOrganizationExpenseContributions,
  sumOrganizationActualCosts,
} from '../data/expenses.repository';
import { loadOperationsReportCounts } from '../data/operations-report.repository';
import type { CashFlowOutlook } from '../domain/cash-flow';
import { getOrganizationCashFlowOutlook } from './get-organization-cash-flow';
import {
  getOrganizationProjectRollup,
  type OrganizationProjectRollup,
} from './get-organization-project-rollup';
import { composeManagementAnalytics } from './compose-management-analytics';
import type { ManagementAnalytics } from '../domain/management-analytics';

export interface OperationsReportSection {
  readonly progressAveragePercent: string | null;
  readonly activeProjectCount: number;
  readonly milestones: {
    readonly planned: CountReportMetric;
    readonly missed: CountReportMetric;
    readonly overdue: CountReportMetric;
  } | null;
  readonly procurement: {
    readonly openOrders: CountReportMetric;
    readonly issuedOrders: CountReportMetric;
  } | null;
  readonly fieldOpenItems: CountReportMetric | null;
  readonly compliance: {
    readonly expired: CountReportMetric;
    readonly expiringSoon: CountReportMetric;
    readonly missingEvidence: CountReportMetric;
  } | null;
  readonly assets: {
    readonly active: CountReportMetric;
    readonly assignedToProjects: CountReportMetric;
    readonly inMaintenance: CountReportMetric;
    /** Actual expense family asset_capital - not maintenance metadata amounts. */
    readonly capitalExpenseActual: ReturnType<typeof aggregateOrgCost>['actual'] | null;
  } | null;
}

export interface OrganizationReportsAnalytics {
  readonly currency: string;
  readonly asOf: string;
  readonly commercial: OrgCommercialTotals | null;
  readonly cash: OrgCashTotals | null;
  readonly cost: OrgCostTotals | null;
  readonly profitability: OrgProfitTotals | null;
  readonly operations: OperationsReportSection;
  readonly rollup: OrganizationProjectRollup;
  readonly cashFlow: CashFlowOutlook | null;
  readonly arAging: ReceivablesAging | null;
  readonly showArAging: boolean;
  readonly management: ManagementAnalytics;
  readonly disclosures: readonly string[];
}

function countMetric(
  key: string,
  count: number,
  kind: CountReportMetric['kind'],
  inclusions: readonly string[],
  exclusions: readonly string[] = [],
): CountReportMetric {
  return { key, kind, count, inclusions, exclusions };
}

export interface OrganizationReportsAnalyticsOptions {
  /**
   * All | Projects | Jobs. Unallocated business costs remain visible beside
   * project/job totals regardless of filter (never double-counted into profit).
   */
  readonly workKindFilter?: string | null;
}

/**
 * Wave 4 org reports / analytics projection (docs 29, 46).
 * Reuses project financials, cash-flow, AR aging, procurement/AP committed figures.
 * No new schema. Progressive: empty sections stay null / hidden by the UI.
 */
export async function getOrganizationReportsAnalytics(
  context: OrgContext,
  options: OrganizationReportsAnalyticsOptions = {},
): Promise<OrganizationReportsAnalytics> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const currency = context.organization.baseCurrency;
  const asOf = todayInTimeZone(context.organization.timezone);

  const canReadBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const billingRecordsPromise = canReadBilling
    ? listBillingRecords(context, { filter: 'all', limit: ORG_LIST_EXPORT_CAP })
    : Promise.resolve(null);

  // Shared org billing promise - cash flow + AR aging previously each re-listed all records.
  const [rollup, billingRecords, unallocatedBusinessCosts, cashFlow] = await Promise.all([
    getOrganizationProjectRollup(context, {
      workKindFilter: options.workKindFilter,
    }),
    billingRecordsPromise,
    loadUnallocatedBusinessCosts(context, currency),
    canReadBilling
      ? billingRecordsPromise.then((records) =>
          getOrganizationCashFlowOutlook(context, { billingRecords: records }),
        )
      : Promise.resolve(null),
  ]);

  const arAging = billingRecords
    ? computeReceivablesAging(
        billingRecords.filter((record) => !isZeroMoney(record.outstandingAmount)),
        currency,
        asOf,
      )
    : null;

  // Rollup includes every base-currency active project (no correctness cap).
  // Optional limit/offset on rollup pages rows only - aggregates always use the full set.
  const commercial = rollup.canReadCommercial
    ? aggregateOrgCommercial(rollup.rows, currency)
    : null;
  const cash = rollup.canReadBilling ? aggregateOrgCash(rollup.rows, currency) : null;
  const cost = aggregateOrgCost(rollup.rows, currency, { unallocatedBusinessCosts });
  const profitability = rollup.canReadProfit
    ? aggregateOrgProfit(rollup.rows, currency)
    : null;

  const canField = hasPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const canProcurement = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canCompliance = hasPermission(context, PERMISSIONS.COMPLIANCE_READ);
  const canAssets = hasPermission(context, PERMISSIONS.ASSETS_READ);

  const opsCounts =
    canField || canProcurement || canCompliance || canAssets
      ? await loadOperationsReportCounts(context.db, context.organizationId, asOf)
      : null;

  const assetCapital = sumAssetCapitalActual(
    rollup.rows
      .map((row) => row.assetCapitalActual)
      .filter((value): value is NonNullable<typeof value> => value != null),
    currency,
  );

  const operations: OperationsReportSection = {
    progressAveragePercent: rollup.ops.averageProgressPercent,
    activeProjectCount: rollup.ops.activeProjectCount,
    milestones:
      canField && opsCounts
        ? {
            planned: countMetric(
              'milestonesPlanned',
              opsCounts.milestonesPlanned,
              'operational',
              ['plannedMilestones'],
            ),
            missed: countMetric(
              'milestonesMissed',
              opsCounts.milestonesMissed,
              'operational',
              ['missedMilestones'],
            ),
            overdue: countMetric(
              'milestonesOverdue',
              opsCounts.milestonesOverdue,
              'operational',
              ['plannedPastTargetDate'],
              ['notifications'],
            ),
          }
        : null,
    procurement:
      canProcurement && opsCounts
        ? {
            openOrders: countMetric(
              'purchaseOrdersOpen',
              opsCounts.purchaseOrdersOpen,
              'operational',
              ['draftIssuedPartiallyReceived'],
              ['expenseActual'],
            ),
            issuedOrders: countMetric(
              'purchaseOrdersIssued',
              opsCounts.purchaseOrdersIssued,
              'committed',
              ['issuedOrPartiallyReceived'],
              ['expenseActual'],
            ),
          }
        : null,
    fieldOpenItems:
      canField && opsCounts
        ? countMetric(
            'openPunchItems',
            opsCounts.openPunchItems,
            'operational',
            ['openOrInProgressPunch'],
            ['notifications'],
          )
        : null,
    compliance:
      canCompliance && opsCounts
        ? {
            expired: countMetric(
              'complianceExpired',
              opsCounts.complianceExpired,
              'operational',
              ['expiredArtifacts'],
              ['notifications'],
            ),
            expiringSoon: countMetric(
              'complianceExpiringSoon',
              opsCounts.complianceExpiringSoon,
              'operational',
              ['expiringSoonArtifacts'],
              ['notifications'],
            ),
            missingEvidence: countMetric(
              'complianceMissingEvidence',
              opsCounts.complianceMissingEvidence,
              'operational',
              ['noDocumentAttached'],
              ['notifications'],
            ),
          }
        : null,
    assets:
      canAssets && opsCounts
        ? {
            active: countMetric(
              'assetsActive',
              opsCounts.assetsActive,
              'operational',
              ['activeAssets'],
              ['maintenanceCostAsExpense'],
            ),
            assignedToProjects: countMetric(
              'assetsAssigned',
              opsCounts.assetsAssignedToProjects,
              'operational',
              ['assetsWithProjectAssignment'],
              ['maintenanceCostAsExpense'],
            ),
            inMaintenance: countMetric(
              'assetsInMaintenance',
              opsCounts.assetsInMaintenance,
              'operational',
              ['inMaintenanceStatus'],
              ['maintenanceCostAsExpense'],
            ),
            capitalExpenseActual: hasNonZeroMoney(assetCapital)
              ? {
                  key: 'assetCapitalActual',
                  kind: 'actual' as const,
                  value: assetCapital,
                  currency,
                  inclusions: ['assetCapitalExpenseFamily'],
                  exclusions: ['maintenanceMetadataAmounts', 'foreignCurrencyProjects'],
                }
              : null,
          }
        : null,
  };

  const showArAging =
    arAging != null && !isZeroMoney(arAging.totalOutstanding);

  const disclosures = [
    'baseCurrencyOnly',
    'vatNotProfit',
    'contractNeBillingNePayment',
    'committedNeExpense',
    'apBillNeExpense',
    'forecastNeActual',
    'projectPlusUnallocatedEqualsOrgExpense',
    'unallocatedNotInProjectProfit',
  ] as const;

  // Progressive: hide zero commercial/cash when unused.
  const commercialVisible =
    commercial &&
    (hasNonZeroMoney(commercial.current.value) ||
      hasNonZeroMoney(commercial.pending.value) ||
      hasNonZeroMoney(commercial.original.value))
      ? commercial
      : commercial && rollup.rows.some((r) => r.originalContract != null)
        ? commercial
        : null;

  const cashVisible =
    cash &&
    (hasNonZeroMoney(cash.invoiced.value) ||
      hasNonZeroMoney(cash.paid.value) ||
      hasNonZeroMoney(cash.outstanding.value))
      ? cash
      : null;

  const costVisible =
    hasNonZeroMoney(cost.actual.value) ||
    hasNonZeroMoney(cost.committed.value) ||
    hasNonZeroMoney(cost.expectedRemaining.value) ||
    hasNonZeroMoney(cost.openAp.value) ||
    hasNonZeroMoney(cost.unallocatedBusinessCosts?.value)
      ? cost
      : null;

  const profitVisible =
    profitability &&
    (hasNonZeroMoney(profitability.estimatedProfit.value) ||
      hasNonZeroMoney(profitability.actualProfit.value) ||
      rollup.ops.lossMakingCount != null ||
      rollup.ops.profitableCount != null)
      ? profitability
      : null;

  const management = await composeManagementAnalytics(context, {
    rollup,
    cashFlow,
    commercialCurrent: commercialVisible?.current.value ?? null,
    invoiced: cashVisible?.invoiced.value ?? null,
    actualCost: costVisible?.actual.value ?? null,
    commitments: costVisible?.committed.value ?? null,
    expectedProfit: profitVisible?.estimatedProfit.value ?? null,
    clientOutstanding: cashVisible?.outstanding.value ?? null,
  });

  return {
    currency,
    asOf,
    commercial: commercialVisible,
    cash: cashVisible,
    cost: costVisible,
    profitability: profitVisible,
    operations,
    rollup,
    cashFlow,
    arAging,
    showArAging,
    management,
    disclosures: [...disclosures],
  };
}

async function loadUnallocatedBusinessCosts(
  context: OrgContext,
  currency: string,
) {
  if (!hasPermission(context, PERMISSIONS.EXPENSES_READ)) {
    return zeroMoney(currency);
  }

  const [orgExpense, contributions] = await Promise.all([
    sumOrganizationActualCosts(context.db, context.organizationId, currency),
    loadOrganizationExpenseContributions(context.db, context.organizationId),
  ]);

  return computeUnallocatedOrganizationCosts({
    orgFinalizedExpenseTotal: orgExpense.total,
    projectTouchingExpenseTotal: sumProjectTouchingExpenseNets(contributions, currency),
  });
}
