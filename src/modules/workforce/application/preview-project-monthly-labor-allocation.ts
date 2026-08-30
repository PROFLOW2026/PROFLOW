/**
 * Read-only current-month monthly labor allocation for Project Financials.
 */

import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { addMoney, fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { loadCachedLaborCostDefaults } from '@/modules/financials/application/financials-request-load-cache';
import { isMonthClosedForFinancialsRead } from '@/modules/month-close';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';
import { monthDateBounds } from '../domain/monthly-accrual';
import {
  foldMonthlyLaborPreviewBundle,
  loadMonthlyLaborPreviewBundleForProject,
} from '../data/monthly-labor-preview-bundle.repository';
import {
  computeMonthlyEmployeeLaborAllocationDraft,
  type MonthlyLaborAllocationPreload,
} from './monthly-cost-recompute';

const previewByTx = new WeakMap<object, Map<string, Promise<MoneyValue>>>();

export async function previewCurrentMonthAllocatedLaborForProject(
  context: OrgContext,
  projectId: string,
  currency: string,
): Promise<MoneyValue> {
  if (!areEmployeeMonthCostsAvailable()) {
    return zeroMoney(currency);
  }

  const txKey = context.db as object;
  const cacheKey = `${projectId}:${currency.toUpperCase()}`;
  let byProject = previewByTx.get(txKey);
  if (!byProject) {
    byProject = new Map();
    previewByTx.set(txKey, byProject);
  }
  const hit = byProject.get(cacheKey);
  if (hit) return hit;

  const pending = previewCurrentMonthAllocatedLaborForProjectUncached(context, projectId, currency);
  byProject.set(cacheKey, pending);
  return pending;
}

async function previewCurrentMonthAllocatedLaborForProjectUncached(
  context: OrgContext,
  projectId: string,
  currency: string,
): Promise<MoneyValue> {
  const currentYearMonth = todayInTimeZone(context.organization.timezone).slice(0, 7);
  const { fromDate, toDate: monthEnd } = monthDateBounds(currentYearMonth);
  const t0 = performance.now();

  const [bundleRows, monthClosed, laborDefaults] = await Promise.all([
    loadMonthlyLaborPreviewBundleForProject(
      context.db,
      context.organizationId,
      projectId,
      fromDate,
      monthEnd,
    ),
    isMonthClosedForFinancialsRead(context, currentYearMonth),
    loadCachedLaborCostDefaults(context.db, context.organizationId),
  ]);

  if (bundleRows.length === 0) {
    if (process.env.PF_TAB_PROFILE === '1') {
      console.error(`[labor-preview] project=${projectId} employees=0 queries=3 ms=${Math.round(performance.now() - t0)}`);
    }
    return zeroMoney(currency);
  }

  const { employees, versionsByEmployee, componentsByRateId, entriesByEmployee } =
    foldMonthlyLaborPreviewBundle(bundleRows, context.organizationId);

  let total = zeroMoney(currency);
  for (const employeeId of employees.keys()) {
    const employee = employees.get(employeeId);
    if (!employee) continue;
    const versions = versionsByEmployee.get(employeeId) ?? [];
    const components = versions.flatMap((version) => componentsByRateId.get(version.id) ?? []);
    const preload: MonthlyLaborAllocationPreload = {
      employee,
      versions,
      components,
      entries: entriesByEmployee.get(employeeId) ?? [],
      monthClosed,
      laborDefaults,
    };
    const draft = await computeMonthlyEmployeeLaborAllocationDraft(context, {
      employeeId,
      yearMonth: currentYearMonth,
      preload,
    });
    if (draft.skipped) continue;
    const line = draft.allocation.projectLines.find((entry) => entry.key === projectId);
    if (!line) continue;
    total = addMoney(total, line.amount);
  }

  if (process.env.PF_TAB_PROFILE === '1') {
    console.error(
      `[labor-preview] project=${projectId} employees=${employees.size} queries=3 ms=${Math.round(performance.now() - t0)} amount=${total.amount}`,
    );
  }

  return fromNumericString(total.amount, currency) ?? zeroMoney(currency);
}
