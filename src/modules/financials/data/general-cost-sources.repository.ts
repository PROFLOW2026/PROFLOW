/**
 * One range-scoped load for non-AP general-cost source totals by year-month.
 * AP remainders stay in vendor-general-remainder (multi-step bill/allocation fold).
 */

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { loadGeneralCostExpenseSourceTotalsByMonths } from './expenses.repository';
import { isAllocationIntentSchemaReady } from './allocation-intent-schema';
import type { GeneralCostSourceKind } from '../domain/company-actual';
import { sqlRows } from './sql-rows';

export type GeneralCostNonApSourceRow = {
  readonly yearMonth: string;
  readonly sourceKind: GeneralCostSourceKind;
  readonly total: string;
};

function yearMonthDateBounds(yearMonths: readonly string[]): { startDate: string; endDate: string } {
  const sorted = [...yearMonths].sort();
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const [y, m] = last.split('-');
  const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
  return {
    startDate: `${first}-01`,
    endDate: `${last}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Expense unallocated, monthly labor unallocated, non-project labor, inventory writeoffs —
 * one round trip for the candidate month range.
 */
export async function loadGeneralCostNonApSourceTotalsByMonths(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonths: readonly string[],
  options: {
    readonly includeExpenses: boolean;
    readonly includeWorkforce: boolean;
  },
): Promise<readonly GeneralCostNonApSourceRow[]> {
  if (yearMonths.length === 0) return [];
  const normalized = currency.toUpperCase();
  const ymList = sql.join(yearMonths.map((ym) => sql`${ym}`), sql`, `);
  const { startDate, endDate } = yearMonthDateBounds(yearMonths);
  const intentReady = await isAllocationIntentSchemaReady(db);

  const expenseRows = options.includeExpenses
    ? await loadGeneralCostExpenseSourceTotalsByMonths(
        db,
        organizationId,
        normalized,
        yearMonths,
        { includeUnallocated: true, includeCompanyOnly: intentReady },
      )
    : [];

  const laborMonthlyPart = options.includeWorkforce
    ? sql`
        select emc.year_month as "yearMonth",
               'labor_monthly_unallocated'::text as "sourceKind",
               coalesce(sum(lar.unallocated_amount), 0)::text as total
        from labor_allocation_runs lar
        inner join employee_month_costs emc
          on lar.employee_month_cost_id = emc.id and lar.organization_id = emc.organization_id
        where lar.organization_id = ${organizationId}
          and lar.status = 'applied'
          and emc.status in ('applied', 'closed')
          and emc.recognition_source = 'monthly_allocated'
          and upper(lar.currency) = upper(${normalized})
          and emc.year_month in (${ymList})
          and lar.unallocated_amount::numeric > 0
        group by emc.year_month
        ${
          intentReady
            ? sql`
        union all
        select emc.year_month as "yearMonth",
               'labor_company_only'::text as "sourceKind",
               coalesce(sum(lar.company_only_amount), 0)::text as total
        from labor_allocation_runs lar
        inner join employee_month_costs emc
          on lar.employee_month_cost_id = emc.id and lar.organization_id = emc.organization_id
        where lar.organization_id = ${organizationId}
          and lar.status = 'applied'
          and emc.status in ('applied', 'closed')
          and emc.recognition_source = 'monthly_allocated'
          and upper(lar.currency) = upper(${normalized})
          and emc.year_month in (${ymList})
          and lar.company_only_amount::numeric > 0
        group by emc.year_month
              `
            : sql``
        }
      `
    : sql`select null::text as "yearMonth", null::text as "sourceKind", null::text as total where false`;

  const laborNonProjectPart = options.includeWorkforce
    ? sql`
        select to_char(te.work_date::date, 'YYYY-MM') as "yearMonth",
               'labor_non_project'::text as "sourceKind",
               coalesce(
                 sum(
                   case when upper(te.cost_currency) = upper(${normalized}) then (
                     case
                       when te.cost_amount is null then null
                       when te.excess_hours is null or te.excess_hours = 0 then te.cost_amount
                       when te.excess_approval_status = 'approved' then te.cost_amount
                       else (te.cost_amount * (te.hours - te.excess_hours) / te.hours)::numeric
                     end
                   ) else 0 end
                 ),
                 0
               )::text as total
        from time_entries te
        where te.organization_id = ${organizationId}
          and te.kind = 'non_project'
          and te.status = 'recorded'
          and te.approval_status = 'approved'
          and te.archived_at is null
          and to_char(te.work_date::date, 'YYYY-MM') in (${ymList})
          and not exists (
            select 1 from employee_month_costs emc
            where emc.organization_id = te.organization_id
              and emc.employee_id = te.employee_id
              and emc.year_month = to_char(te.work_date::date, 'YYYY-MM')
              and emc.status in ('applied', 'closed')
              and emc.recognition_source = 'monthly_allocated'
          )
        group by 1
      `
    : sql`select null::text as "yearMonth", null::text as "sourceKind", null::text as total where false`;

  const writeoffPart = sql`
    select to_char(c.occurred_on::date, 'YYYY-MM') as "yearMonth",
           'inventory_writeoff'::text as "sourceKind",
           coalesce(sum(c.amount), 0)::text as total
    from inventory_cost_consumptions c
    where c.organization_id = ${organizationId}
      and c.currency = ${normalized}
      and c.kind = 'writeoff'
      and c.occurred_on >= ${startDate}
      and c.occurred_on <= ${endDate}
      and to_char(c.occurred_on::date, 'YYYY-MM') in (${ymList})
    group by 1
  `;

  const laborRows = sqlRows<GeneralCostNonApSourceRow>(
    await db.execute(sql`
      ${laborMonthlyPart}
      union all
      ${laborNonProjectPart}
      union all
      ${writeoffPart}
    `),
  );

  return [...expenseRows, ...laborRows] as readonly GeneralCostNonApSourceRow[];
}

export function foldGeneralCostNonApSourceRows(
  rows: readonly GeneralCostNonApSourceRow[],
  currency: string,
  yearMonths: readonly string[],
): {
  expenseByMonth: Map<string, MoneyValue>;
  expenseCompanyOnlyByMonth: Map<string, MoneyValue>;
  laborMonthlyByMonth: Map<string, string>;
  laborCompanyOnlyByMonth: Map<string, string>;
  laborNonProjectByMonth: Map<string, string>;
  writeoffsByMonth: Map<string, MoneyValue>;
} {
  const expenseByMonth = new Map<string, MoneyValue>();
  const expenseCompanyOnlyByMonth = new Map<string, MoneyValue>();
  const laborMonthlyByMonth = new Map<string, string>();
  const laborCompanyOnlyByMonth = new Map<string, string>();
  const laborNonProjectByMonth = new Map<string, string>();
  const writeoffsByMonth = new Map<string, MoneyValue>();
  const allowed = new Set(yearMonths);

  for (const row of rows) {
    if (!row.yearMonth || !allowed.has(row.yearMonth)) continue;
    if (row.sourceKind === 'expense_unallocated') {
      expenseByMonth.set(
        row.yearMonth,
        fromNumericString(row.total, currency) ?? zeroMoney(currency),
      );
    } else if (row.sourceKind === 'expense_company_only') {
      expenseCompanyOnlyByMonth.set(
        row.yearMonth,
        fromNumericString(row.total, currency) ?? zeroMoney(currency),
      );
    } else if (row.sourceKind === 'labor_monthly_unallocated') {
      laborMonthlyByMonth.set(row.yearMonth, row.total);
    } else if (row.sourceKind === 'labor_company_only') {
      laborCompanyOnlyByMonth.set(row.yearMonth, row.total);
    } else if (row.sourceKind === 'labor_non_project') {
      laborNonProjectByMonth.set(row.yearMonth, row.total);
    } else if (row.sourceKind === 'inventory_writeoff') {
      writeoffsByMonth.set(
        row.yearMonth,
        fromNumericString(row.total, currency) ?? zeroMoney(currency),
      );
    }
  }
  return {
    expenseByMonth,
    expenseCompanyOnlyByMonth,
    laborMonthlyByMonth,
    laborCompanyOnlyByMonth,
    laborNonProjectByMonth,
    writeoffsByMonth,
  };
}
