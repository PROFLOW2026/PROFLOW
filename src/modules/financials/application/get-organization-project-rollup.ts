import { and, eq, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { MoneyValue } from '@/shared/money';
import { compareMoney, zeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectFinancials } from './get-project-financials';
import { listActiveProjectIds } from '../data/projects.repository';

/** Cap rollup fan-out; full org financial matrix is a later reporting wave. */
const MAX_ROLLUP_PROJECTS = 50;
const ROLLUP_CONCURRENCY = 8;

export interface ProjectRollupRow {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly currency: string;
  readonly originalContract: MoneyValue | null;
  readonly approvedAdditions: MoneyValue | null;
  readonly approvedReductions: MoneyValue | null;
  readonly currentContract: MoneyValue | null;
  readonly pendingChanges: MoneyValue | null;
  readonly invoiced: MoneyValue | null;
  readonly paid: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly laborActual: MoneyValue | null;
  readonly vendorActual: MoneyValue | null;
  readonly overheadActual: MoneyValue | null;
  readonly committedOpen: MoneyValue | null;
  readonly openApPayable: MoneyValue | null;
  readonly estimatedFinalCost: MoneyValue | null;
  readonly assetCapitalActual: MoneyValue | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly progressPercent: string | null;
  readonly profitable: boolean | null;
}

export interface OrganizationOpsSummary {
  readonly activeProjectCount: number;
  readonly averageProgressPercent: string | null;
  readonly lossMakingCount: number | null;
  readonly profitableCount: number | null;
}

export interface OrganizationProjectRollup {
  readonly currency: string;
  readonly rows: readonly ProjectRollupRow[];
  readonly ops: OrganizationOpsSummary;
  /** Projects excluded because their currency differs from org base. */
  readonly excludedForeignCurrencyCount: number;
  /** Active projects not included due to the pre-launch rollup cap. */
  readonly truncatedActiveProjectCount: number;
  readonly note: string;
  readonly canReadProfit: boolean;
  readonly canReadBilling: boolean;
  readonly canReadCommercial: boolean;
}

async function mapPool<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]!);
    }
  }

  if (items.length === 0) return results;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Org-level project comparison for reporting (docs 29, 46).
 * Never mixes currencies. Profit only when PROJECT_PROFIT_READ is held.
 * Does not label anything as Revenue. VAT is not profit.
 * Actual / Committed / Forecast stay separate on cost fields.
 */
export async function getOrganizationProjectRollup(
  context: OrgContext,
): Promise<OrganizationProjectRollup> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const currency = context.organization.baseCurrency;
  const canProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canBilling = hasPermission(context, PERMISSIONS.BILLING_READ);
  const canCommercial = hasPermission(context, PERMISSIONS.CONTRACTS_READ);

  const activeIds = await listActiveProjectIds(context.db, context.organizationId);
  const truncatedActiveProjectCount = Math.max(0, activeIds.length - MAX_ROLLUP_PROJECTS);
  const cappedIds = activeIds.slice(0, MAX_ROLLUP_PROJECTS);

  const projectRows = await context.db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      currency: projects.currency,
      progressPercent: projects.progressPercent,
    })
    .from(projects)
    .where(and(eq(projects.organizationId, context.organizationId), isNull(projects.archivedAt)));

  const byId = new Map(projectRows.map((row) => [row.id, row]));
  let excludedForeignCurrencyCount = 0;
  let progressSum = 0;
  let progressCount = 0;

  const eligibleIds: string[] = [];
  for (const projectId of cappedIds) {
    const meta = byId.get(projectId);
    if (!meta) continue;
    const projectCurrency = (meta.currency ?? currency).toUpperCase();
    if (projectCurrency !== currency.toUpperCase()) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    eligibleIds.push(projectId);
  }

  const rows = await mapPool(eligibleIds, ROLLUP_CONCURRENCY, async (projectId) => {
    const meta = byId.get(projectId)!;
    const projectCurrency = (meta.currency ?? currency).toUpperCase();
    const financials = await getProjectFinancials(context, projectId);

    const originalContract = canCommercial
      ? (financials.commercial?.originalContractValue ?? null)
      : null;
    const approvedAdditions = canCommercial
      ? (financials.commercial?.approvedAdditions ?? null)
      : null;
    const approvedReductions = canCommercial
      ? (financials.commercial?.approvedReductions ?? null)
      : null;
    const currentContract = canCommercial
      ? (financials.commercial?.currentContractValue ?? null)
      : null;
    const pendingChanges = canCommercial
      ? (financials.commercial?.pendingChanges ?? null)
      : null;
    const invoiced = canBilling ? financials.billing.invoiced : null;
    const paid = canBilling ? financials.billing.paid : null;
    const outstanding = canBilling ? financials.billing.outstanding : null;
    const actualCost = financials.cost.actualCostToDate;
    const laborActual = financials.cost.laborActual;
    const vendorActual = financials.cost.vendorActual;
    const overheadActual = financials.cost.overheadActual;
    const committedOpen = financials.cost.committedOpen;
    const openApPayable = financials.cost.openApPayable;
    const estimatedFinalCost = financials.cost.estimatedFinalCost;
    const assetCapitalActual = financials.cost.byFamily.assetCapital;
    const estimatedProfit = canProfit ? (financials.profit?.estimatedProfit ?? null) : null;
    const marginPercent = canProfit ? (financials.profit?.marginPercent ?? null) : null;
    const profitable =
      estimatedProfit == null
        ? null
        : compareMoney(estimatedProfit, zeroMoney(currency)) > 0
          ? true
          : compareMoney(estimatedProfit, zeroMoney(currency)) < 0
            ? false
            : null;

    return {
      projectId,
      name: meta.name,
      status: meta.status,
      currency: projectCurrency,
      originalContract,
      approvedAdditions,
      approvedReductions,
      currentContract,
      pendingChanges,
      invoiced,
      paid,
      outstanding,
      actualCost: actualCost ?? zeroMoney(currency),
      laborActual,
      vendorActual,
      overheadActual,
      committedOpen,
      openApPayable,
      estimatedFinalCost,
      assetCapitalActual,
      estimatedProfit,
      marginPercent,
      progressPercent: meta.progressPercent,
      profitable,
    } satisfies ProjectRollupRow;
  });

  for (const row of rows) {
    if (row.progressPercent != null && row.progressPercent !== '') {
      const parsed = Number(row.progressPercent);
      if (Number.isFinite(parsed)) {
        progressSum += parsed;
        progressCount += 1;
      }
    }
  }

  rows.sort((a, b) => {
    if (canProfit && a.profitable !== b.profitable) {
      if (a.profitable === false) return -1;
      if (b.profitable === false) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  const lossMakingCount = canProfit
    ? rows.filter((row) => row.profitable === false).length
    : null;
  const profitableCount = canProfit
    ? rows.filter((row) => row.profitable === true).length
    : null;

  return {
    currency,
    rows,
    ops: {
      /** Base-currency projects included in this rollup (not FX-excluded / beyond cap). */
      activeProjectCount: rows.length,
      averageProgressPercent:
        progressCount > 0 ? (progressSum / progressCount).toFixed(1) : null,
      lossMakingCount,
      profitableCount,
    },
    excludedForeignCurrencyCount,
    truncatedActiveProjectCount,
    note: 'Amounts use organization base currency only. VAT is not treated as profit. Actual, Committed and Forecast stay labelled separately. Incomplete cost coverage is disclosed per project financials.',
    canReadProfit: canProfit,
    canReadBilling: canBilling,
    canReadCommercial: canCommercial,
  };
}
