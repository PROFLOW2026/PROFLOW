import { getOrganizationReceivablesAging } from '@/modules/billing';
import type { ReceivablesAging } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { isZeroMoney } from '@/shared/money';
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
import { hasNonZeroMoney, type CountReportMetric } from '../domain/report-metric';
import { loadOperationsReportCounts } from '../data/operations-report.repository';
import type { CashFlowOutlook } from '../domain/cash-flow';
import { getOrganizationCashFlowOutlook } from './get-organization-cash-flow';
import {
  getOrganizationProjectRollup,
  type OrganizationProjectRollup,
} from './get-organization-project-rollup';

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
    /** Actual expense family asset_capital — not maintenance metadata amounts. */
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

/**
 * Wave 4 org reports / analytics projection (docs 29, 46).
 * Reuses project financials, cash-flow, AR aging, procurement/AP committed figures.
 * No new schema. Progressive: empty sections stay null / hidden by the UI.
 */
export async function getOrganizationReportsAnalytics(
  context: OrgContext,
): Promise<OrganizationReportsAnalytics> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const currency = context.organization.baseCurrency;
  const asOf = todayInTimeZone(context.organization.timezone);

  const [rollup, cashFlow, arAging] = await Promise.all([
    getOrganizationProjectRollup(context),
    getOrganizationCashFlowOutlook(context),
    hasPermission(context, PERMISSIONS.BILLING_READ)
      ? getOrganizationReceivablesAging(context)
      : Promise.resolve(null),
  ]);

  const commercial = rollup.canReadCommercial
    ? aggregateOrgCommercial(rollup.rows, currency)
    : null;
  const cash = rollup.canReadBilling ? aggregateOrgCash(rollup.rows, currency) : null;
  const cost = aggregateOrgCost(rollup.rows, currency);
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
    hasNonZeroMoney(cost.openAp.value)
      ? cost
      : null;

  const profitVisible =
    profitability &&
    (hasNonZeroMoney(profitability.estimatedProfit.value) ||
      rollup.ops.lossMakingCount != null ||
      rollup.ops.profitableCount != null)
      ? profitability
      : null;

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
    disclosures: [...disclosures],
  };
}
