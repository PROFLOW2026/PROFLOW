import { and, eq, sql } from 'drizzle-orm';
import { employeeMonthCosts, employees } from '@drizzle/schema';
import type { BusinessDate } from '@/shared/dates';
import { yearMonthFromBusinessDate } from '@/modules/month-close';
import { isSubcontractorEconomicCategoryKey } from '@/modules/financials/domain/economic-classification';
import type { DbExecutor } from '@/shared/db/types';

const AMOUNT_TOLERANCE = 0.01;

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE;
}

export interface PayrollExpenseSimilarityHint {
  readonly kind: 'team_total' | 'individual';
  readonly workMonth: string;
  readonly matchedAmount: number;
}

/**
 * Warning-only hint: subcontractor expense NET may resemble workforce month costs.
 * Does NOT block, suppress, or establish identity — user must confirm duplicates.
 */
export async function detectPayrollExpenseSimilarity(
  db: DbExecutor,
  organizationId: string,
  input: {
    readonly categoryKey: string | null | undefined;
    readonly expenseDate: BusinessDate;
    readonly netAmount: string;
    readonly currency: string;
  },
): Promise<readonly PayrollExpenseSimilarityHint[]> {
  if (!isSubcontractorEconomicCategoryKey(input.categoryKey)) return [];

  const net = Number(input.netAmount);
  if (!Number.isFinite(net) || net <= 0) return [];

  const workMonth = yearMonthFromBusinessDate(input.expenseDate);

  const rows = await db
    .select({
      amount: sql<string>`coalesce(${employeeMonthCosts.actualAmount}, ${employeeMonthCosts.knownAmount})`,
    })
    .from(employeeMonthCosts)
    .innerJoin(
      employees,
      and(
        eq(employees.id, employeeMonthCosts.employeeId),
        eq(employees.organizationId, employeeMonthCosts.organizationId),
      ),
    )
    .where(
      and(
        eq(employeeMonthCosts.organizationId, organizationId),
        eq(employeeMonthCosts.yearMonth, workMonth),
        eq(employeeMonthCosts.status, 'applied'),
        eq(employeeMonthCosts.currency, input.currency),
        eq(employees.compensationClass, 'standard'),
        eq(employees.status, 'active'),
        sql`coalesce(${employeeMonthCosts.actualAmount}, ${employeeMonthCosts.knownAmount}) > 0`,
      ),
    );

  if (rows.length === 0) return [];

  const individualAmounts = rows.map((row) => Number(row.amount)).filter((value) => value > 0);
  const teamTotal = individualAmounts.reduce((sum, value) => sum + value, 0);
  const hints: PayrollExpenseSimilarityHint[] = [];

  if (amountsMatch(net, teamTotal)) {
    hints.push({ kind: 'team_total', workMonth, matchedAmount: teamTotal });
  }

  for (const amount of individualAmounts) {
    if (amountsMatch(net, amount)) {
      hints.push({ kind: 'individual', workMonth, matchedAmount: amount });
    }
  }

  return hints;
}
