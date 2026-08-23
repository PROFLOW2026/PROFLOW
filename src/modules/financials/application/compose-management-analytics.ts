import { and, eq, isNull } from 'drizzle-orm';
import { clients, projects } from '@drizzle/schema';
import { evaluateEarlyWarnings } from '@/modules/forecast';
import { listQuotesForOrg } from '@/modules/quotes';
import { listOpportunitiesForOrg } from '@/modules/crm';
import {
  canReadOrgWorkforce,
  listTimeEntriesForOrg,
} from '@/modules/workforce';
import {
  getOrganizationApPayables,
  isRecognizedVendorBillStatus,
  listApBills,
} from '@/modules/ap';
import type { OrgContext } from '@/shared/auth/context';
import { startOfMonth, todayInTimeZone } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { money } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrganizationProjectRollup } from './get-organization-project-rollup';
import type { CashFlowOutlook } from '../domain/cash-flow';
import {
  computeOpportunityConversion,
  computeQuotesConversion,
  computeUnbilledBacklog,
  computeVendorConcentration,
  emptyManagementAnalytics,
  groupProfitByClient,
  groupProfitByProject,
  groupProfitByWorkType,
  timedCashFromOutlook,
  type ManagementAnalytics,
  type ProjectRiskRow,
} from '../domain/management-analytics';

function warningClassRank(value: ProjectRiskRow['highestClass']): number {
  if (value === 'confirmed') return 2;
  if (value === 'projected') return 1;
  return 0;
}

export async function composeManagementAnalytics(
  context: OrgContext,
  input: {
    readonly rollup: OrganizationProjectRollup;
    readonly cashFlow: CashFlowOutlook | null;
    readonly commercialCurrent: ReturnType<typeof money> | null;
    readonly invoiced: ReturnType<typeof money> | null;
    readonly netInvoiced?: ReturnType<typeof money> | null;
    readonly actualCost: ReturnType<typeof money> | null;
    readonly commitments: ReturnType<typeof money> | null;
    readonly expectedProfit: ReturnType<typeof money> | null;
    readonly clientOutstanding: ReturnType<typeof money> | null;
  },
): Promise<ManagementAnalytics> {
  const currency = context.organization.baseCurrency;
  const base = emptyManagementAnalytics();
  const canProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canQuotes = hasPermission(context, PERMISSIONS.QUOTES_READ);
  const canCrm = hasPermission(context, PERMISSIONS.CRM_READ);
  const canAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canWorkforce = canReadOrgWorkforce(context);

  const today = todayInTimeZone(context.organization.timezone);

  const [quotes, opportunities, timeEntries, apPayables, apBills, clientRows] = await Promise.all([
    canQuotes ? listQuotesForOrg(context).catch(() => []) : Promise.resolve([]),
    canCrm ? listOpportunitiesForOrg(context).catch(() => []) : Promise.resolve([]),
    canWorkforce
      ? listTimeEntriesForOrg(context, {
          fromDate: startOfMonth(today),
          toDate: today,
          status: 'recorded',
        }).catch(() => [])
      : Promise.resolve([]),
    canAp ? getOrganizationApPayables(context).catch(() => null) : Promise.resolve(null),
    canAp
      ? listApBills(context.db, context.organizationId, { limit: ORG_LIST_EXPORT_CAP }).catch(
          () => [],
        )
      : Promise.resolve([]),
    context.db
      .select({
        projectId: projects.id,
        clientId: projects.clientId,
        clientName: clients.name,
      })
      .from(projects)
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .where(and(eq(projects.organizationId, context.organizationId), isNull(projects.archivedAt)))
      .catch(() => []),
  ]);

  const quotesConversion = computeQuotesConversion(quotes);
  const opportunityConversion = computeOpportunityConversion(opportunities);

  const recognizedBills = apBills.filter(
    (bill) =>
      isRecognizedVendorBillStatus(bill.status) &&
      bill.currency.toUpperCase() === currency.toUpperCase(),
  );
  const concentration = computeVendorConcentration(
    recognizedBills.map((bill) => ({
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      amount: money(bill.totalAmount, bill.currency),
    })),
    currency,
  );

  const clientNameByProject = new Map(
    clientRows.map((row) => [row.projectId, { clientId: row.clientId, clientName: row.clientName }]),
  );

  const profitByClient = canProfit
    ? groupProfitByClient(
        input.rollup.rows.map((row) => {
          const client = clientNameByProject.get(row.projectId);
          return {
            clientId: client?.clientId ?? null,
            clientName: client?.clientName ?? null,
            actualProfit: row.actualProfit,
          };
        }),
        currency,
      )
    : null;

  const riskByProject = new Map<string, ProjectRiskRow>();
  for (const row of input.rollup.rows) {
    const warnings = evaluateEarlyWarnings({
      projectId: row.projectId,
      workKind: row.workKind,
      currency: row.currency,
      priceNotSet: row.priceNotSet,
      currentContractAmount: row.currentContract?.amount ?? null,
      actualCostAmount: row.actualCost?.amount ?? null,
      forecastFinalCostAmount: row.estimatedFinalCost?.amount ?? null,
      committedOpenAmount: row.committedOpen?.amount ?? null,
      expectedRemainingAmount: row.expectedRemainingCost?.amount ?? null,
      invoicedAmount: row.invoiced?.amount ?? null,
      outstandingAmount: row.outstanding?.amount ?? null,
      actualMarginPercent: row.actualMarginPercent,
      forecastMarginPercent: row.marginPercent,
      budgetAmount: null,
      progressPercent: row.progressPercent,
      dataConfidenceLevel: input.rollup.dataConfidence.level,
      canReadProfit: canProfit,
      canReadBudget: false,
      canReadBilling: input.rollup.canReadBilling,
    });
    if (warnings.length === 0) continue;
    let highestClass: ProjectRiskRow['highestClass'] = 'missing_data';
    for (const warning of warnings) {
      if (warningClassRank(warning.warningClass) > warningClassRank(highestClass)) {
        highestClass = warning.warningClass;
      }
    }
    riskByProject.set(row.projectId, {
      projectId: row.projectId,
      name: row.name,
      href: warnings[0]?.href ?? `/projects/${row.projectId}?tab=financials`,
      warningCount: warnings.length,
      highestClass,
    });
  }

  const employeeIds = new Set(timeEntries.map((entry) => entry.employeeId));
  let recordedHours = 0;
  for (const entry of timeEntries) {
    const hours = Number(entry.hours);
    if (Number.isFinite(hours)) recordedHours += hours;
  }

  const vendorOutstanding =
    apPayables && apPayables.currency.toUpperCase() === currency.toUpperCase()
      ? money(apPayables.outstanding, apPayables.currency)
      : null;

  return {
    ...base,
    activeProjectValue: input.commercialCurrent,
    unbilledBacklog: computeUnbilledBacklog(
      input.commercialCurrent,
      input.netInvoiced ?? input.invoiced,
      input.invoiced,
    ),
    totalActualCost: input.actualCost,
    totalCommitments: input.commitments,
    expectedProfit: canProfit ? input.expectedProfit : null,
    clientOutstanding: input.clientOutstanding,
    vendorOutstanding,
    cashExpectedIn: timedCashFromOutlook(input.cashFlow, 'in'),
    cashExpectedOut: timedCashFromOutlook(input.cashFlow, 'out'),
    quotesConversion: quotesConversion
      ? { ...quotesConversion, href: '/quotes' }
      : null,
    opportunityConversion: opportunityConversion
      ? { ...opportunityConversion, href: '/crm' }
      : null,
    profitByProject: canProfit ? groupProfitByProject(input.rollup.rows) : null,
    profitByClient: profitByClient,
    profitByWorkType: canProfit ? groupProfitByWorkType(input.rollup.rows, currency) : null,
    projectsAtRisk: riskByProject.size > 0 ? [...riskByProject.values()] : null,
    workforceHours:
      timeEntries.length > 0
        ? {
            recordedHours: recordedHours.toFixed(2),
            employeeCount: employeeIds.size,
            utilizationPercent: null,
            href: '/workforce/time',
          }
        : null,
    vendorConcentration: concentration
      ? {
          ...concentration,
          href: concentration.topVendorId
            ? `/vendors/${concentration.topVendorId}`
            : '/procurement/ap',
        }
      : null,
  };
}
