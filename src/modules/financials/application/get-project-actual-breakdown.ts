import { cache } from 'react';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  loadProjectLaborByEmployee,
  type ProjectLaborByEmployeeAggregate,
} from '@/modules/workforce';
import { fromNumericString, isZeroMoney, type MoneyValue } from '@/shared/money';
import { shouldExcludeLaborExpenseForWorkforce } from '../domain/labor-expense-integrity';
import { applyLinkedExpenseDeductionsToContributions } from '../domain/expense-ap-dedup';
import {
  assertBreakdownReconciles,
  buildProjectActualBreakdown,
  type ProjectActualAtom,
  type ProjectActualBreakdown,
} from '../domain/project-actual-breakdown';
import { getProjectFinancials } from './get-project-financials';
import type { ProjectFinancials } from '../domain/types';
import { loadProjectExpenseContributions } from '../data/expenses.repository';
import { loadRecognizedVendorBillAtomsForProject } from '../data/recognized-vendor-bill-atoms.repository';
import { loadRecognizedVendorBillsForProject } from '../data/committed-costs.repository';

export type { ProjectLaborByEmployeeAggregate };

/**
 * Request-cached labor-by-employee aggregate — Overview / Financials / Team / Time
 * must all call this (same React cache key per projectId).
 */
export const getProjectLaborByEmployeeAggregate = cache(
  async (projectId: string): Promise<ProjectLaborByEmployeeAggregate | null> => {
    const { withOrgContext } = await import('@/shared/auth/session');
    return withOrgContext(async (context) => {
      if (
        !hasPermission(context, PERMISSIONS.WORKFORCE_READ) &&
        !hasPermission(context, PERMISSIONS.WORKFORCE_COST_READ) &&
        !hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)
      ) {
        return null;
      }
      const { ensureOpenMonthlyLaborFreshForProject } = await import(
        '@/modules/workforce/application/ensure-open-monthly-labor-fresh'
      );
      await ensureOpenMonthlyLaborFreshForProject(context, projectId);
      const currency = context.organization.baseCurrency;
      return loadProjectLaborByEmployee(
        context.db,
        context.organizationId,
        projectId,
        currency,
      );
    });
  },
);

export interface ProjectActualBreakdownResult {
  readonly breakdown: ProjectActualBreakdown;
  readonly laborByEmployee: ProjectLaborByEmployeeAggregate | null;
  readonly financialsActual: MoneyValue;
}

/**
 * Owner Actual breakdown for one project — classification of canonical Actual atoms.
 * Prefer `getCachedProjectActualBreakdown` in RSC so financials share the request cache.
 */
export async function getProjectActualBreakdown(
  context: OrgContext,
  projectId: string,
  financials?: ProjectFinancials,
): Promise<ProjectActualBreakdownResult> {
  const resolvedFinancials =
    financials ?? (await getProjectFinancials(context, projectId));
  const currency = resolvedFinancials.currency.toUpperCase();
  const totalActual = resolvedFinancials.cost.actualCostToDate;

  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadWorkforce = hasPermission(context, PERMISSIONS.WORKFORCE_READ);

  const expenseContributions = canReadExpenses
    ? await loadProjectExpenseContributions(context.db, context.organizationId, projectId)
    : [];

  const recognizedRollup = canReadAp
    ? await loadRecognizedVendorBillsForProject(
        context.db,
        context.organizationId,
        projectId,
        currency,
      )
    : null;

  const billAtoms = canReadAp
    ? await loadRecognizedVendorBillAtomsForProject(
        context.db,
        context.organizationId,
        projectId,
        currency,
      )
    : [];

  const laborByEmployee = canReadWorkforce
    ? await (async () => {
        const { ensureOpenMonthlyLaborFreshForProject } = await import(
          '@/modules/workforce/application/ensure-open-monthly-labor-fresh'
        );
        await ensureOpenMonthlyLaborFreshForProject(context, projectId);
        return loadProjectLaborByEmployee(
          context.db,
          context.organizationId,
          projectId,
          currency,
        );
      })()
    : null;

  const linked = recognizedRollup?.linkedExpenseDeductions ?? new Map<string, string>();
  const expensesForActual = applyLinkedExpenseDeductionsToContributions(
    expenseContributions,
    linked,
  );

  // Same workforce gate as aggregateProjectCosts / compose.
  const hasWorkforceLabor =
    Boolean(laborByEmployee?.hasWorkforceData) ||
    Boolean(
      resolvedFinancials.coverage.entries?.some((e) => e.source === 'workforce' && e.included),
    ) ||
    !isZeroMoney(resolvedFinancials.cost.laborActual);

  const atoms: ProjectActualAtom[] = [];

  // Employees atom MUST equal canonical laborActual (not a parallel sum).
  if (hasWorkforceLabor && !isZeroMoney(resolvedFinancials.cost.laborActual)) {
    atoms.push({
      amount: resolvedFinancials.cost.laborActual,
      sourceKind: 'labor',
      sourceId: `labor:${projectId}`,
      label: 'workforce',
    });
  }

  for (const line of expensesForActual) {
    if (
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: line.isLaborCategory ?? false,
        projectId: line.projectId ?? null,
        hasWorkforceData: hasWorkforceLabor,
      })
    ) {
      continue;
    }
    const amount = fromNumericString(line.amount, line.currency);
    if (!amount || isZeroMoney(amount)) continue;
    if (amount.currency.toUpperCase() !== currency) continue;

    atoms.push({
      amount,
      sourceKind: 'expense',
      sourceId: line.expenseId ?? `expense-line:${line.amount}`,
      label: line.vendorName ?? line.categoryKey ?? null,
      costFamily: line.costFamily,
      categoryKey: line.categoryKey,
      vendorId: line.vendorId,
      vendorName: line.vendorName,
      vendorType: line.vendorType,
      isLaborCategory: line.isLaborCategory,
      hasWorkforceLaborOnProject: hasWorkforceLabor,
    });
  }

  for (const bill of billAtoms) {
    if (isZeroMoney(bill.amount)) continue;
    atoms.push({
      amount: bill.amount,
      sourceKind: 'ap_bill',
      sourceId: bill.billId,
      label: bill.vendorName,
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      vendorType: bill.vendorType,
      subcontractAgreementId: bill.subcontractAgreementId,
    });
  }

  const monthClose = resolvedFinancials.cost.monthCloseCostNet;
  if (monthClose && !isZeroMoney(monthClose) && monthClose.currency.toUpperCase() === currency) {
    atoms.push({
      amount: monthClose,
      sourceKind: 'month_close',
      sourceId: `month-close:${projectId}`,
      label: 'month_close',
    });
  }

  let employeesAvailability: 'value' | 'unavailable' | 'partial' = 'value';
  if (!canReadWorkforce) {
    employeesAvailability = 'unavailable';
  } else if (laborByEmployee && laborByEmployee.entriesMissingCost > 0) {
    employeesAvailability = 'partial';
  }

  const breakdown = buildProjectActualBreakdown({
    totalActual,
    atoms,
    employeesAvailability,
  });

  assertBreakdownReconciles(breakdown);

  return {
    breakdown,
    laborByEmployee,
    financialsActual: totalActual,
  };
}

/** Cached wrapper for RSC — one breakdown per project per request. */
export const getCachedProjectActualBreakdown = cache(async (projectId: string) => {
  const { withOrgContext } = await import('@/shared/auth/session');
  return withOrgContext((context) => getProjectActualBreakdown(context, projectId));
});
