import { and, eq, isNull } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { MoneyValue } from '@/shared/money';
import { zeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectFinancials } from './get-project-financials';
import { listActiveProjectIds } from '../data/projects.repository';

export interface ProjectRollupRow {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly currency: string;
  readonly currentContract: MoneyValue | null;
  readonly outstanding: MoneyValue | null;
  readonly actualCost: MoneyValue | null;
  readonly estimatedProfit: MoneyValue | null;
  readonly marginPercent: string | null;
  readonly progressPercent: string | null;
  readonly profitable: boolean | null;
}

export interface OrganizationProjectRollup {
  readonly currency: string;
  readonly rows: readonly ProjectRollupRow[];
  /** Projects excluded because their currency differs from org base. */
  readonly excludedForeignCurrencyCount: number;
  readonly note: string;
}

/**
 * Org-level project comparison for reporting (docs 29, 46).
 * Never mixes currencies. Profit only when PROJECT_PROFIT_READ is held.
 * Does not label anything as Revenue.
 */
export async function getOrganizationProjectRollup(
  context: OrgContext,
): Promise<OrganizationProjectRollup> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  const currency = context.organization.baseCurrency;
  const canProfit = hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ);
  const canBilling = hasPermission(context, PERMISSIONS.BILLING_READ);

  const activeIds = await listActiveProjectIds(context.db, context.organizationId);
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
  const rows: ProjectRollupRow[] = [];
  let excludedForeignCurrencyCount = 0;

  for (const projectId of activeIds) {
    const meta = byId.get(projectId);
    if (!meta) continue;
    const projectCurrency = (meta.currency ?? currency).toUpperCase();
    if (projectCurrency !== currency.toUpperCase()) {
      excludedForeignCurrencyCount += 1;
      continue;
    }

    const financials = await getProjectFinancials(context, projectId);
    const currentContract = financials.commercial?.currentContractValue ?? null;
    const outstanding = canBilling ? financials.billing.outstanding : null;
    const actualCost = financials.cost.actualCostToDate;
    const estimatedProfit = canProfit ? financials.profit.estimatedProfit : null;
    const marginPercent = canProfit ? financials.profit.marginPercent : null;
    const profitable =
      estimatedProfit == null
        ? null
        : Number(estimatedProfit.amount) > 0
          ? true
          : Number(estimatedProfit.amount) < 0
            ? false
            : null;

    rows.push({
      projectId,
      name: meta.name,
      status: meta.status,
      currency: projectCurrency,
      currentContract,
      outstanding,
      actualCost: actualCost ?? zeroMoney(currency),
      estimatedProfit,
      marginPercent,
      progressPercent: meta.progressPercent,
      profitable,
    });
  }

  rows.sort((a, b) => {
    if (canProfit && a.profitable !== b.profitable) {
      if (a.profitable === false) return -1;
      if (b.profitable === false) return 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    currency,
    rows,
    excludedForeignCurrencyCount,
    note: 'Amounts use organization base currency only. VAT is not treated as profit. Incomplete cost coverage is disclosed per project financials.',
  };
}
