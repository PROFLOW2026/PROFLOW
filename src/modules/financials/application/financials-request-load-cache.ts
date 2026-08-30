import { and, eq, isNotNull } from 'drizzle-orm';
import { monthCloseAdjustments } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { netEconomicAdjustments } from '@/modules/month-close/domain/economic-corrections';
import {
  LABOR_COST_DEFAULTS_SETTING_KEY,
  parseLaborCostDefaults,
  type LaborCostDefaults,
  getOrganizationSettingValue,
} from '@/modules/tenancy';
import type { ProjectExpenseContribution } from '../domain/cost-aggregation';
import { loadOrganizationExpenseContributions } from '../data/expenses.repository';
import { loadOrganizationInventoryConsumptionContributions } from '../data/inventory-consumptions.repository';
import type { MonthCloseEconomicNets } from '../data/month-close-economic.repository';
import { zeroMoney } from '@/shared/money';

const orgExpensesByTx = new WeakMap<object, Promise<readonly ProjectExpenseContribution[]>>();
const orgInventoryByTx = new WeakMap<object, Promise<readonly ProjectExpenseContribution[]>>();
const monthCloseByTx = new WeakMap<object, Promise<Map<string, MonthCloseEconomicNets>>>();
const laborDefaultsByTx = new WeakMap<object, Promise<LaborCostDefaults>>();

/** One org-wide expense contribution load per DB transaction — slice + GCM basis share it. */
export function loadCachedOrganizationExpenseContributions(
  db: DbExecutor,
  organizationId: string,
): Promise<readonly ProjectExpenseContribution[]> {
  const key = db as object;
  const hit = orgExpensesByTx.get(key);
  if (hit) return hit;
  const pending = loadOrganizationExpenseContributions(db, organizationId);
  orgExpensesByTx.set(key, pending);
  return pending;
}

/** One org-wide inventory consumption load per DB transaction — slice + GCM basis share it. */
export function loadCachedOrganizationInventoryContributions(
  db: DbExecutor,
  organizationId: string,
): Promise<readonly ProjectExpenseContribution[]> {
  const key = db as object;
  const hit = orgInventoryByTx.get(key);
  if (hit) return hit;
  const pending = loadOrganizationInventoryConsumptionContributions(db, organizationId);
  orgInventoryByTx.set(key, pending);
  return pending;
}

export async function loadCachedExpenseContributionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<ProjectExpenseContribution[]> {
  if (projectIds.length === 0) return [];
  const all = await loadCachedOrganizationExpenseContributions(db, organizationId);
  const idSet = new Set(projectIds);
  return all.filter((row) => row.projectId != null && idSet.has(row.projectId));
}

export async function loadCachedProjectExpenseContributions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectExpenseContribution[]> {
  const all = await loadCachedOrganizationExpenseContributions(db, organizationId);
  return all.filter((row) => row.projectId === projectId);
}

export async function loadCachedInventoryContributionsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<ProjectExpenseContribution[]> {
  if (projectIds.length === 0) return [];
  const all = await loadCachedOrganizationInventoryContributions(db, organizationId);
  const idSet = new Set(projectIds);
  return all.filter((row) => row.projectId != null && idSet.has(row.projectId));
}

export async function loadCachedProjectInventoryContributions(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectExpenseContribution[]> {
  const all = await loadCachedOrganizationInventoryContributions(db, organizationId);
  return all.filter((row) => row.projectId === projectId);
}

/** One org-wide month-close economic fold per DB transaction. */
export async function loadCachedMonthCloseEconomicByProject(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<Map<string, MonthCloseEconomicNets>> {
  const key = db as object;
  const hit = monthCloseByTx.get(key);
  if (hit) return hit;

  const pending = (async () => {
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
          isNotNull(monthCloseAdjustments.projectId),
          isNotNull(monthCloseAdjustments.amount),
        ),
      );

    const like = rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      currency: row.currency,
      effectSide:
        row.effectSide === 'cost'
          ? ('cost' as const)
          : row.effectSide === 'revenue'
            ? ('revenue' as const)
            : null,
      projectId: row.projectId,
      supersedesAdjustmentId: row.supersedesAdjustmentId,
    }));

    const projectIds = [...new Set(rows.map((row) => row.projectId).filter(Boolean))] as string[];
    const result = new Map<string, MonthCloseEconomicNets>();
    for (const projectId of projectIds) {
      result.set(projectId, netEconomicAdjustments(like, { currency, projectId }));
    }
    return result;
  })();

  monthCloseByTx.set(key, pending);
  return pending;
}

export async function loadCachedMonthCloseEconomicForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<MonthCloseEconomicNets> {
  const map = await loadCachedMonthCloseEconomicByProject(db, organizationId, currency);
  return map.get(projectId) ?? { costNet: zeroMoney(currency), revenueNet: zeroMoney(currency) };
}

export async function loadCachedMonthCloseEconomicForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, MonthCloseEconomicNets>> {
  const all = await loadCachedMonthCloseEconomicByProject(db, organizationId, currency);
  const result = new Map<string, MonthCloseEconomicNets>();
  for (const projectId of projectIds) {
    const nets = all.get(projectId);
    if (nets) result.set(projectId, nets);
  }
  return result;
}

/** One labor-cost defaults read per DB transaction (Financials labor preview). */
export function seedCachedLaborCostDefaults(
  db: object,
  laborDefaults: LaborCostDefaults,
): void {
  laborDefaultsByTx.set(db, Promise.resolve(laborDefaults));
}

export function loadCachedLaborCostDefaults(
  db: DbExecutor,
  organizationId: string,
): Promise<LaborCostDefaults> {
  const key = db as object;
  const hit = laborDefaultsByTx.get(key);
  if (hit) return hit;
  const pending = getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  ).then(parseLaborCostDefaults);
  laborDefaultsByTx.set(key, pending);
  return pending;
}
