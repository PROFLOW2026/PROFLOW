/**
 * Permission-aware collectors for Command Center sources.
 * Each collector skips silently when permission / optional module is missing.
 */

import { and, asc, eq, isNull, lt, lte, sql, inArray } from 'drizzle-orm';
import {
  approvalRequests,
  laborAllocationRuns,
  monthClosePeriods,
  planningWorkItems,
  projectBudgets,
  projects,
} from '@drizzle/schema';
import { listBillingRecords } from '@/modules/billing';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { getOrganizationApPayables } from '@/modules/ap';
import { listMaintenanceScheduleForOrg } from '@/modules/assets';
import { listAttendanceDaysForOrg } from '@/modules/workforce';
import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { fromNumericString, isPositiveMoney, isZeroMoney } from '@/shared/money';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { addDays, daysBetween, type BusinessDate } from '@/shared/dates';
import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import { withItemDefaults } from '../domain/ranking';
import type { CommandCenterItem } from '../domain/types';
import {
  creditVoidIssueCopy,
  expiringComplianceCopy,
  fallbackWhere,
  monthCloseIncompleteCopy,
  openApprovalCopy,
  openAttendanceCopy,
  overBudgetCopy,
  overdueArCopy,
  overdueMaintenanceCopy,
  overduePlanningCopy,
  staleProjectCopy,
  unallocatedEmployeeCostCopy,
  unallocatedVendorBillCopy,
  vendorBillDueCopy,
} from '../domain/item-copy';

const PER_SOURCE_CAP = 15;
const STALE_PROJECT_DAYS = 14;

export interface CollectContext {
  readonly context: OrgContext;
  readonly modules: ModuleVisibility;
  readonly today: BusinessDate;
}

function moduleOn(modules: ModuleVisibility, key: keyof ModuleVisibility): boolean {
  return Boolean(modules[key]);
}

function localeOf(ctx: CollectContext): string {
  return ctx.context.locale || 'he-IL';
}

export async function collectOverdueAr(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) return [];
  if (!moduleOn(ctx.modules, 'billing') && !hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) {
    return [];
  }

  const records = await listBillingRecords(ctx.context, {
    filter: 'overdue',
    limit: PER_SOURCE_CAP,
  });

  const locale = localeOf(ctx);
  return records.map((record) => {
    const days = record.dueDate ? daysBetween(record.dueDate, ctx.today) : 0;
    const copy = overdueArCopy(locale, {
      reference: record.reference,
      dueDate: record.dueDate,
      outstanding: record.outstandingAmount.amount,
      currency: record.outstandingAmount.currency,
    });
    return withItemDefaults({
      sourceType: 'overdue_ar',
      sourceId: record.id,
      what: copy.what,
      why: copy.why,
      where: record.projectName ?? fallbackWhere(locale, 'billing'),
      href: `/billing/${record.id}`,
      urgencyBump: Math.min(99, Math.max(0, days)),
      meta: {
        dueDate: record.dueDate,
        outstanding: record.outstandingAmount.amount,
      },
    });
  });
}

export async function collectVendorBillsDue(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.AP_READ)) return [];

  const payables = await getOrganizationApPayables(ctx.context);
  const items: CommandCenterItem[] = [];

  for (const bill of payables.bills) {
    if (items.length >= PER_SOURCE_CAP) break;
    const outstanding = fromNumericString(bill.outstanding, bill.currency);
    if (!outstanding || isZeroMoney(outstanding) || !isPositiveMoney(outstanding)) continue;
    if (!bill.dueDate) continue;
    if (bill.dueDate >= ctx.today) continue;

    const days = daysBetween(bill.dueDate, ctx.today);
    const copy = vendorBillDueCopy(localeOf(ctx), {
      reference: bill.reference,
      dueDate: bill.dueDate,
      outstanding: bill.outstanding,
      currency: bill.currency,
    });
    items.push(
      withItemDefaults({
        sourceType: 'vendor_bill_due',
        sourceId: bill.billId,
        what: copy.what,
        why: copy.why,
        where: bill.vendorName ?? fallbackWhere(localeOf(ctx), 'vendorBills'),
        href: `/procurement/ap/${bill.billId}`,
        urgencyBump: Math.min(99, Math.max(0, days)),
        meta: { dueDate: bill.dueDate, outstanding: bill.outstanding },
      }),
    );
  }

  return items;
}

export async function collectOpenAttendance(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (
    !hasPermission(ctx.context, PERMISSIONS.ATTENDANCE_READ) &&
    !hasPermission(ctx.context, PERMISSIONS.ATTENDANCE_MANAGE)
  ) {
    return [];
  }

  const yesterday = addDays(ctx.today, -1);
  const fromDate = addDays(ctx.today, -14);
  const days = await listAttendanceDaysForOrg(ctx.context, {
    status: 'open',
    fromDate,
    toDate: yesterday,
  });

  const locale = localeOf(ctx);
  return days.slice(0, PER_SOURCE_CAP).map((day) => {
    const copy = openAttendanceCopy(locale, day.workDate);
    return withItemDefaults({
      sourceType: 'attendance_open',
      sourceId: day.id,
      what: copy.what,
      why: copy.why,
      where: day.employeeName,
      href: '/workforce/attendance',
      meta: { workDate: day.workDate, employeeId: day.employeeId },
    });
  });
}

export async function collectUnallocatedEmployeeCost(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.WORKFORCE_COST_READ)) return [];

  const rows = await ctx.context.db
    .select({
      id: laborAllocationRuns.id,
      unallocatedAmount: laborAllocationRuns.unallocatedAmount,
      currency: laborAllocationRuns.currency,
      employeeMonthCostId: laborAllocationRuns.employeeMonthCostId,
      status: laborAllocationRuns.status,
    })
    .from(laborAllocationRuns)
    .where(
      and(
        eq(laborAllocationRuns.organizationId, ctx.context.organizationId),
        inArray(laborAllocationRuns.status, ['applied', 'draft']),
        sql`(${laborAllocationRuns.unallocatedAmount})::numeric > 0`,
      ),
    )
    .limit(PER_SOURCE_CAP);

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const copy = unallocatedEmployeeCostCopy(locale, {
      amount: row.unallocatedAmount,
      currency: row.currency,
      status: row.status,
    });
    return withItemDefaults({
      sourceType: 'unallocated_employee_cost',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(locale, 'workforce'),
      href: '/workforce/employees',
      meta: {
        unallocated: row.unallocatedAmount,
        employeeMonthCostId: row.employeeMonthCostId,
      },
    });
  });
}

export async function collectUnallocatedVendorBills(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.AP_READ)) return [];

  const payables = await getOrganizationApPayables(ctx.context);
  const items: CommandCenterItem[] = [];

  for (const bill of payables.bills) {
    if (items.length >= PER_SOURCE_CAP) break;
    if (bill.projectId) continue;
    if (bill.billStatus === 'draft' || bill.billStatus === 'void') continue;
    const outstanding = fromNumericString(bill.outstanding, bill.currency);
    if (!outstanding || isZeroMoney(outstanding)) continue;

    const copy = unallocatedVendorBillCopy(localeOf(ctx), {
      outstanding: bill.outstanding,
      currency: bill.currency,
    });
    items.push(
      withItemDefaults({
        sourceType: 'unallocated_vendor_bill',
        sourceId: bill.billId,
        what: copy.what,
        why: copy.why,
        where: bill.vendorName ?? fallbackWhere(localeOf(ctx), 'vendorBills'),
        href: `/procurement/ap/${bill.billId}`,
        meta: { outstanding: bill.outstanding },
      }),
    );
  }

  return items;
}

export async function collectProjectOverBudget(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'budgets')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.BUDGETS_READ)) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];

  const budgets = await ctx.context.db
    .select({
      id: projectBudgets.id,
      projectId: projectBudgets.projectId,
      name: projectBudgets.name,
      currency: projectBudgets.currency,
      totalBudgetAmount: projectBudgets.totalBudgetAmount,
    })
    .from(projectBudgets)
    .where(
      and(
        eq(projectBudgets.organizationId, ctx.context.organizationId),
        eq(projectBudgets.status, 'active'),
        isNull(projectBudgets.archivedAt),
      ),
    )
    .limit(40);

  if (budgets.length === 0) return [];

  const rollup = await getOrganizationProjectRollup(ctx.context);
  const actualByProject = new Map(
    rollup.rows.map((row) => [row.projectId, row.actualCost] as const),
  );
  const nameByProject = new Map(rollup.rows.map((row) => [row.projectId, row.name] as const));

  const items: CommandCenterItem[] = [];
  for (const budget of budgets) {
    if (items.length >= PER_SOURCE_CAP) break;
    if (!budget.totalBudgetAmount) continue;
    const budgetMoney = fromNumericString(budget.totalBudgetAmount, budget.currency);
    const actual = actualByProject.get(budget.projectId) ?? null;
    if (!budgetMoney || !actual || actual.currency !== budget.currency) continue;
    if (!isPositiveMoney(actual)) continue;

    const budgetNum = Number(budgetMoney.amount);
    const actualNum = Number(actual.amount);
    if (!Number.isFinite(budgetNum) || !Number.isFinite(actualNum)) continue;
    if (actualNum <= budgetNum) continue;

    const overBy = (actualNum - budgetNum).toFixed(2);
    const copy = overBudgetCopy(localeOf(ctx), {
      actual: actual.amount,
      budget: budget.totalBudgetAmount,
      currency: budget.currency,
      overBy,
    });
    items.push(
      withItemDefaults({
        sourceType: 'project_over_budget',
        sourceId: budget.id,
        what: copy.what,
        why: copy.why,
        where: nameByProject.get(budget.projectId) ?? budget.name,
        href: `/projects/${budget.projectId}/financials`,
        urgencyBump: Math.min(99, Math.floor(((actualNum - budgetNum) / Math.max(budgetNum, 1)) * 50)),
        meta: {
          projectId: budget.projectId,
          budget: budget.totalBudgetAmount,
          actual: actual.amount,
        },
      }),
    );
  }

  return items;
}

export async function collectOpenApprovals(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'approvals')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.APPROVALS_READ)) return [];

  const rows = await ctx.context.db
    .select({
      id: approvalRequests.id,
      entityType: approvalRequests.entityType,
      entityId: approvalRequests.entityId,
      amount: approvalRequests.amount,
      currency: approvalRequests.currency,
      status: approvalRequests.status,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, ctx.context.organizationId),
        eq(approvalRequests.status, 'submitted'),
      ),
    )
    .limit(PER_SOURCE_CAP);

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const copy = openApprovalCopy(locale, {
      entityType: row.entityType,
      amount: row.amount,
      currency: row.currency,
    });
    return withItemDefaults({
      sourceType: 'open_approval',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(locale, 'approvals'),
      href: '/approvals',
      meta: { entityType: row.entityType, entityId: row.entityId },
    });
  });
}

export async function collectOverduePlanning(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PLANNING_READ)) return [];

  const rows = await ctx.context.db
    .select({
      id: planningWorkItems.id,
      name: planningWorkItems.name,
      projectId: planningWorkItems.projectId,
      kind: planningWorkItems.kind,
      targetEndDate: planningWorkItems.targetEndDate,
      progressPercent: planningWorkItems.progressPercent,
    })
    .from(planningWorkItems)
    .where(
      and(
        eq(planningWorkItems.organizationId, ctx.context.organizationId),
        isNull(planningWorkItems.archivedAt),
        isNull(planningWorkItems.actualEndDate),
        lt(planningWorkItems.targetEndDate, ctx.today),
        sql`(${planningWorkItems.progressPercent})::numeric < 100`,
      ),
    )
    .limit(PER_SOURCE_CAP);

  const projectIds = [...new Set(rows.map((r) => r.projectId))];
  const projectNameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const projectRows = await ctx.context.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, ctx.context.organizationId),
          inArray(projects.id, projectIds),
        ),
      );
    for (const p of projectRows) projectNameById.set(p.id, p.name);
  }

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const copy = overduePlanningCopy(locale, {
      kind: row.kind,
      targetEndDate: row.targetEndDate ?? '',
      progressPercent: String(row.progressPercent),
    });
    const projectName = projectNameById.get(row.projectId) ?? fallbackWhere(locale, 'project');
    return withItemDefaults({
      sourceType: 'overdue_planning',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: `${projectName} · ${row.name}`,
      href: `/projects/${row.projectId}`,
      meta: { projectId: row.projectId, targetEndDate: row.targetEndDate },
    });
  });
}

export async function collectExpiringCompliance(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.COMPLIANCE_READ)) return [];
  if (!moduleOn(ctx.modules, 'compliance')) return [];

  const artifacts = await listComplianceArtifactsForOrg(ctx.context, { limit: 200 });
  const actionable = artifacts.filter(
    (a) => a.status === 'expiring_soon' || a.status === 'expired',
  );

  const locale = localeOf(ctx);
  return actionable.slice(0, PER_SOURCE_CAP).map((artifact) => {
    const copy = expiringComplianceCopy(locale, {
      status: artifact.status,
      expiresOn: artifact.expiresOn,
    });
    return withItemDefaults({
      sourceType: 'expiring_compliance',
      sourceId: artifact.id,
      what: copy.what,
      why: copy.why,
      where: artifact.name,
      href: `/compliance/${artifact.id}`,
      severity: artifact.status === 'expired' ? 'high' : 'medium',
      urgencyBump: artifact.status === 'expired' ? 40 : 10,
    });
  });
}

export async function collectOverdueMaintenance(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.ASSETS_READ)) return [];
  if (!moduleOn(ctx.modules, 'assets')) return [];

  const schedule = await listMaintenanceScheduleForOrg(ctx.context);

  const locale = localeOf(ctx);
  return schedule.overdue.slice(0, PER_SOURCE_CAP).map((record) => {
    const copy = overdueMaintenanceCopy(locale, {
      performedOn: record.performedOn,
      status: record.status,
    });
    return withItemDefaults({
      sourceType: 'overdue_maintenance',
      sourceId: record.id,
      what: copy.what,
      why: copy.why,
      where: record.assetName || fallbackWhere(locale, 'assets'),
      href: '/assets/maintenance',
      meta: { assetId: record.assetId },
    });
  });
}

export async function collectStaleProjects(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECTS_READ)) return [];

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - STALE_PROJECT_DAYS);

  const rows = await ctx.context.db
    .select({
      id: projects.id,
      name: projects.name,
      updatedAt: projects.updatedAt,
      workKind: projects.workKind,
    })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, ctx.context.organizationId),
        eq(projects.status, 'active'),
        isNull(projects.archivedAt),
        lt(projects.updatedAt, cutoff),
      ),
    )
    .orderBy(asc(projects.updatedAt))
    .limit(PER_SOURCE_CAP);

  const copy = staleProjectCopy(localeOf(ctx), STALE_PROJECT_DAYS);
  return rows.map((row) =>
    withItemDefaults({
      sourceType: 'stale_project',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: row.name,
      href: row.workKind === 'job' ? `/jobs/${row.id}` : `/projects/${row.id}`,
      meta: { updatedAt: row.updatedAt.toISOString() },
    }),
  );
}

export async function collectCreditVoidIssues(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) return [];

  const records = await listBillingRecords(ctx.context, { filter: 'all', limit: 200 });
  const items: CommandCenterItem[] = [];

  for (const record of records) {
    if (items.length >= PER_SOURCE_CAP) break;

    // Credit notes that still show open/partial collection need attention.
    if (
      record.kind === 'credit_note' &&
      record.status === 'finalized' &&
      record.collectionStatus &&
      record.collectionStatus !== 'paid'
    ) {
      const copy = creditVoidIssueCopy(localeOf(ctx), record.collectionStatus);
      items.push(
        withItemDefaults({
          sourceType: 'credit_void_issue',
          sourceId: record.id,
          what: copy.what,
          why: copy.why,
          where: record.projectName ?? record.reference ?? fallbackWhere(localeOf(ctx), 'billing'),
          href: `/billing/${record.id}`,
          meta: { kind: record.kind, status: record.status },
        }),
      );
      continue;
    }

    // Recently voided finalized history is not an issue; skip pure voids.
  }

  return items;
}

export async function collectMonthCloseIncomplete(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'month_close')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.MONTH_CLOSE_READ)) return [];

  const yearMonth = ctx.today.slice(0, 7);
  const rows = await ctx.context.db
    .select({
      id: monthClosePeriods.id,
      yearMonth: monthClosePeriods.yearMonth,
      status: monthClosePeriods.status,
      completenessPercent: monthClosePeriods.completenessPercent,
    })
    .from(monthClosePeriods)
    .where(
      and(
        eq(monthClosePeriods.organizationId, ctx.context.organizationId),
        inArray(monthClosePeriods.status, ['open', 'ready']),
        lte(monthClosePeriods.yearMonth, yearMonth),
      ),
    )
    .limit(PER_SOURCE_CAP);

  const locale = localeOf(ctx);
  return rows.map((row) => {
    const pct = row.completenessPercent ?? '0';
    const copy = monthCloseIncompleteCopy(locale, {
      yearMonth: row.yearMonth,
      status: row.status,
      completenessPercent: pct,
    });
    return withItemDefaults({
      sourceType: 'month_close_incomplete',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(locale, 'monthClose'),
      href: '/month-close',
      meta: { yearMonth: row.yearMonth, status: row.status, completeness: pct },
    });
  });
}

/** Run all collectors; individual failures are isolated. */
export async function collectAllSources(ctx: CollectContext): Promise<CommandCenterItem[]> {
  const collectors = [
    collectOverdueAr,
    collectVendorBillsDue,
    collectOpenAttendance,
    collectUnallocatedEmployeeCost,
    collectUnallocatedVendorBills,
    collectProjectOverBudget,
    collectOpenApprovals,
    collectOverduePlanning,
    collectExpiringCompliance,
    collectOverdueMaintenance,
    collectStaleProjects,
    collectCreditVoidIssues,
    collectMonthCloseIncomplete,
  ];

  const settled = await Promise.allSettled(collectors.map((fn) => fn(ctx)));
  const items: CommandCenterItem[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') items.push(...result.value);
  }
  return items;
}
