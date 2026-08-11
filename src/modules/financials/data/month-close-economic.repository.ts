import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { monthCloseAdjustments } from '@drizzle/schema';
import { netEconomicAdjustments } from '@/modules/month-close/domain/economic-corrections';
import { zeroMoney, type MoneyValue } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';

export interface MonthCloseEconomicNets {
  readonly costNet: MoneyValue;
  readonly revenueNet: MoneyValue;
}

function emptyNets(currency: string): MonthCloseEconomicNets {
  return { costNet: zeroMoney(currency), revenueNet: zeroMoney(currency) };
}

/**
 * Non-superseded economic month-close corrections for one project.
 * Closed source history is never rewritten — these rows fold into compose once.
 */
export async function loadMonthCloseEconomicForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<MonthCloseEconomicNets> {
  const map = await loadMonthCloseEconomicForProjects(db, organizationId, [projectId], currency);
  return map.get(projectId) ?? emptyNets(currency);
}

export async function loadMonthCloseEconomicForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, MonthCloseEconomicNets>> {
  const result = new Map<string, MonthCloseEconomicNets>();
  if (projectIds.length === 0) return result;

  const rows = await db
    .select({
      id: monthCloseAdjustments.id,
      projectId: monthCloseAdjustments.projectId,
      amount: monthCloseAdjustments.amount,
      currency: monthCloseAdjustments.currency,
      effectSide: monthCloseAdjustments.effectSide,
      supersedesAdjustmentId: monthCloseAdjustments.supersedesAdjustmentId,
    })
    .from(monthCloseAdjustments)
    .where(
      and(
        eq(monthCloseAdjustments.organizationId, organizationId),
        inArray(monthCloseAdjustments.projectId, [...projectIds]),
        isNotNull(monthCloseAdjustments.amount),
      ),
    );

  const like = rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    currency: row.currency,
    effectSide:
      row.effectSide === 'cost' ? ('cost' as const) : row.effectSide === 'revenue' ? ('revenue' as const) : null,
    projectId: row.projectId,
    supersedesAdjustmentId: row.supersedesAdjustmentId,
  }));

  for (const projectId of projectIds) {
    result.set(projectId, netEconomicAdjustments(like, { currency, projectId }));
  }

  return result;
}
