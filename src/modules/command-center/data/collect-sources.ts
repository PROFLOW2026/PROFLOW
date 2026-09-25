/**
 * Permission-aware collectors for Command Center sources.
 * Each collector skips silently when permission / optional module is missing.
 */

import { and, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import {
  approvalRequests,
  monthClosePeriods,
  planningWorkItems,
  projectBudgets,
  projects,
} from '@drizzle/schema';
import { listBillingRecords } from '@/modules/billing';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { getOrganizationApPayables } from '@/modules/ap';
import { listMaintenanceScheduleForOrg } from '@/modules/assets';
import { listAttendanceDaysForOrg, listEmployeesWithoutAttendanceToday, listTimesheetsForOrg } from '@/modules/workforce';
import {
  listUnattributedProjectLaborSources,
} from '@/modules/workforce/application/labor-allocation-alerts';
import { getLaborCostDefaultsForApply, resolveOrgWorkWeekdays } from '@/modules/tenancy';
import { getOrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import type { OrganizationProjectRollup } from '@/modules/financials/application/get-organization-project-rollup';
import { getOrganizationEarlyWarnings } from '@/modules/forecast';
import { isOcrReviewUiAllowed, listOcrCandidates } from '@/modules/ocr';
import { listInspectionsForOrg, listPunchListItemsForOrg } from '@/modules/field-ops';
import { listSafetyRecordsForOrg } from '@/modules/safety';
import { listRecurringDraftsForOrg } from '@/modules/recurring-drafts/application/queries';
import { ANY_DRAFT_ACCESS_PERMISSIONS } from '@/modules/recurring-drafts/domain/permissions';
import {
  collectAutomationFollowups,
  collectCashFlowRisk,
  collectCloseoutBlockers,
  collectFailedCommunications,
  collectWarrantyExpiring,
} from './collect-next-gen';
import { collectExpensesDueToday, collectExpensesNeedingAllocation, collectPayrollDueToday } from './collect-owner-payments';
import { collectMonthlyWorkforceReportReady } from './collect-monthly-workforce-report';
import { collectUwmTaskSources } from './collect-tasks';
import {
  attendanceEmployeeDateAlertHref,
  missingAttendanceTodayAlertHref,
} from '../domain/alert-deep-links';
import { fromNumericString, isPositiveMoney, isZeroMoney } from '@/shared/money';
import type { OrgContext } from '@/shared/auth/context';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { addDays, businessDate, daysBetween, type BusinessDate } from '@/shared/dates';
import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import { withItemDefaults } from '../domain/ranking';
import type { CommandCenterItem, CommandCenterSeverity } from '../domain/types';
import { createCommandCenterCopyTranslator } from '@/shared/i18n/namespace-translator';
import {
  commandCenterCopyScope,
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
  unattributedProjectLaborCopy,
  unallocatedVendorBillCopy,
  vendorBillDueCopy,
  boqMeasurementAwaitingCopy,
  boqProgressReadyToBillCopy,
  boqVsContractMismatchCopy,
  vendorBillApproachingCopy,
  ocrNeedsReviewCopy,
  ocrFailedCopy,
  forecastWarningCopy,
  punchOpenCopy,
  safetyOpenCopy,
  inspectionOpenCopy,
  recurringDraftIssueCopy,
  timesheetMissingCopy,
  billingPlanCycleDraftCopy,
  billingPlanMilestoneDueCopy,
  billingPlanRetentionReleaseDueCopy,
  missingAttendanceTodayCopy,
  type CommandCenterCopyScope,
} from '../domain/item-copy';
// (UWM copy helpers are imported directly in collect-tasks.ts)

const PER_SOURCE_CAP = 15;
const OCR_CAP = 10;
const VENDOR_BILL_APPROACHING_DAYS = 7;

export interface CollectContext {
  readonly context: OrgContext;
  readonly modules: ModuleVisibility;
  readonly today: BusinessDate;
  readonly copyScope: CommandCenterCopyScope;
  /**
   * One org rollup for this collection. Undefined means the collector may load
   * its own. Null means this collection already decided there is no rollup.
   */
  readonly sharedOrganizationRollup?: OrganizationProjectRollup | null;
}

export async function buildCollectContext(
  input: Omit<CollectContext, 'copyScope'>,
): Promise<CollectContext> {
  const locale = input.context.locale || 'he-IL';
  const copyT = await createCommandCenterCopyTranslator(locale);
  return {
    ...input,
    copyScope: commandCenterCopyScope(copyT, locale),
  };
}

function moduleOn(modules: ModuleVisibility, key: keyof ModuleVisibility): boolean {
  return Boolean(modules[key]);
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

  return records.map((record) => {
    const days = record.dueDate ? daysBetween(record.dueDate, ctx.today) : 0;
    const copy = overdueArCopy(ctx.copyScope, {
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
      where: record.projectName ?? fallbackWhere(ctx.copyScope, 'billing'),
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
    const copy = vendorBillDueCopy(ctx.copyScope, {
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
        where: bill.vendorName ?? fallbackWhere(ctx.copyScope, 'vendorBills'),
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

  return days.slice(0, PER_SOURCE_CAP).map((day) => {
    const copy = openAttendanceCopy(ctx.copyScope, day.workDate);
    return withItemDefaults({
      sourceType: 'attendance_open',
      sourceId: day.id,
      what: copy.what,
      why: copy.why,
      where: day.employeeName,
      href: attendanceEmployeeDateAlertHref({
        employeeId: day.employeeId,
        workDate: day.workDate,
      }),
      meta: { workDate: day.workDate, employeeId: day.employeeId },
    });
  });
}

export async function collectMissingAttendanceToday(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.ATTENDANCE_MANAGE)) return [];

  const laborDefaults = await getLaborCostDefaultsForApply(ctx.context);
  const workWeekdays = resolveOrgWorkWeekdays(laborDefaults);
  const [year, month, day] = ctx.today.split('-').map(Number);
  const weekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  if (!workWeekdays.includes(weekday)) return [];

  const missing = await listEmployeesWithoutAttendanceToday(ctx.context, ctx.today);
  if (missing.length === 0) return [];

  return missing.slice(0, PER_SOURCE_CAP).map((employee) => {
    const copy = missingAttendanceTodayCopy(ctx.copyScope, { count: 1, date: ctx.today });
    return withItemDefaults({
      sourceType: 'missing_attendance_today',
      sourceId: `${employee.employeeId}:${ctx.today}`,
      what: copy.what,
      why: `${employee.employeeName} · ${copy.why}`,
      where: employee.employeeName,
      href: missingAttendanceTodayAlertHref({ employeeId: employee.employeeId, workDate: ctx.today }),
      severity: 'medium' as const,
      meta: { employeeId: employee.employeeId, date: ctx.today },
    });
  });
}

export async function collectUnallocatedEmployeeCost(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.WORKFORCE_COST_READ)) return [];

  const sources = await listUnattributedProjectLaborSources(ctx.context, {
    limit: PER_SOURCE_CAP,
  });
  if (sources.length === 0) return [];

  return sources.map((source) => {
    const copy = unattributedProjectLaborCopy(ctx.copyScope, source);
    return withItemDefaults({
      sourceType: 'unallocated_employee_cost',
      sourceId: source.timeEntryId,
      what: copy.what,
      why: copy.why,
      where: `${source.employeeName} · ${source.workDate}`,
      href: attendanceEmployeeDateAlertHref({
        employeeId: source.employeeId,
        workDate: source.workDate,
      }),
      meta: {
        employeeId: source.employeeId,
        workDate: source.workDate,
        timeEntryId: source.timeEntryId,
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

    const copy = unallocatedVendorBillCopy(ctx.copyScope, {
      outstanding: bill.outstanding,
      currency: bill.currency,
    });
    items.push(
      withItemDefaults({
        sourceType: 'unallocated_vendor_bill',
        sourceId: bill.billId,
        what: copy.what,
        why: copy.why,
        where: bill.vendorName ?? fallbackWhere(ctx.copyScope, 'vendorBills'),
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

  const rollup =
    ctx.sharedOrganizationRollup !== undefined
      ? ctx.sharedOrganizationRollup
      : await getOrganizationProjectRollup(ctx.context);
  if (!rollup) return [];
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
    const copy = overBudgetCopy(ctx.copyScope, {
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
        href: `/projects/${budget.projectId}?tab=financials`,
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

  return rows.map((row) => {
    const copy = openApprovalCopy(ctx.copyScope, {
      entityType: row.entityType,
      amount: row.amount,
      currency: row.currency,
    });
    return withItemDefaults({
      sourceType: 'open_approval',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'approvals'),
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

  return rows.map((row) => {
    const copy = overduePlanningCopy(ctx.copyScope, {
      kind: row.kind,
      targetEndDate: row.targetEndDate ?? '',
      progressPercent: String(row.progressPercent),
    });
    const projectName = projectNameById.get(row.projectId) ?? fallbackWhere(ctx.copyScope, 'project');
    return withItemDefaults({
      sourceType: 'overdue_planning',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: `${projectName} · ${row.name}`,
      href: `/projects/${row.projectId}?tab=schedule`,
      meta: {
        projectId: row.projectId,
        targetEndDate: row.targetEndDate,
        scheduleKind: row.kind,
      },
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

  return actionable.slice(0, PER_SOURCE_CAP).map((artifact) => {
    const copy = expiringComplianceCopy(ctx.copyScope, {
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

  return schedule.overdue.slice(0, PER_SOURCE_CAP).map((record) => {
    const copy = overdueMaintenanceCopy(ctx.copyScope, {
      performedOn: record.performedOn,
      status: record.status,
    });
    return withItemDefaults({
      sourceType: 'overdue_maintenance',
      sourceId: record.id,
      what: copy.what,
      why: copy.why,
      where: record.assetName || fallbackWhere(ctx.copyScope, 'assets'),
      href: '/assets/maintenance',
      meta: { assetId: record.assetId },
    });
  });
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
      const copy = creditVoidIssueCopy(ctx.copyScope, record.collectionStatus);
      items.push(
        withItemDefaults({
          sourceType: 'credit_void_issue',
          sourceId: record.id,
          what: copy.what,
          why: copy.why,
          where: record.projectName ?? record.reference ?? fallbackWhere(ctx.copyScope, 'billing'),
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

  return rows.map((row) => {
    const pct = row.completenessPercent ?? '0';
    const copy = monthCloseIncompleteCopy(ctx.copyScope, {
      yearMonth: row.yearMonth,
      status: row.status,
      completenessPercent: pct,
    });
    return withItemDefaults({
      sourceType: 'month_close_incomplete',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'monthClose'),
      href: '/month-close',
      meta: { yearMonth: row.yearMonth, status: row.status, completeness: pct },
    });
  });
}

/**
 * BOQ measurement draft awaiting approve.
 * Progress ≠ Actual - this only nudges the measurement workflow.
 */
export async function collectBoqMeasurementAwaitingApproval(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'boq')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.BOQ_PROGRESS_APPROVE)) return [];

  const {
    listDraftProgressBatchesForOrg,
  } = await import('@/modules/boq/data/boq.repository');
  const rows = await listDraftProgressBatchesForOrg(
    ctx.context.db,
    ctx.context.organizationId,
  );

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

  return rows.slice(0, PER_SOURCE_CAP).map((row) => {
    const copy = boqMeasurementAwaitingCopy(ctx.copyScope, {
      periodLabel: row.periodLabel,
      certificateNumber: row.certificateNumber,
    });
    return withItemDefaults({
      sourceType: 'boq_measurement_awaiting_approval',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: projectNameById.get(row.projectId) ?? fallbackWhere(ctx.copyScope, 'boq'),
      href: `/projects/${row.projectId}?tab=boq`,
      meta: { projectId: row.projectId, boqId: row.boqId },
    });
  });
}

/** Approved progress with no billing link - ready for progress billing draft. */
export async function collectBoqProgressReadyToBill(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'boq')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.BOQ_BILLING_CREATE)) return [];

  const {
    listApprovedUnbilledProgressBatchesForOrg,
  } = await import('@/modules/boq/data/boq.repository');
  const rows = await listApprovedUnbilledProgressBatchesForOrg(
    ctx.context.db,
    ctx.context.organizationId,
  );

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

  return rows.slice(0, PER_SOURCE_CAP).map((row) => {
    const copy = boqProgressReadyToBillCopy(ctx.copyScope, {
      periodLabel: row.periodLabel,
      certificateNumber: row.certificateNumber,
    });
    return withItemDefaults({
      sourceType: 'boq_progress_ready_to_bill',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: projectNameById.get(row.projectId) ?? fallbackWhere(ctx.copyScope, 'boq'),
      href: `/projects/${row.projectId}?tab=boq`,
      meta: { projectId: row.projectId, boqId: row.boqId },
    });
  });
}

/**
 * Contract ↔ BOQ mismatch. Does not invent Actual from progress.
 * Uses commercial + BOQ totals only.
 */
export async function collectBoqVsContractMismatch(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'boq')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.BOQ_READ)) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.CONTRACTS_READ)) return [];

  const { listActiveBoqsWithTotalsForOrg } = await import('@/modules/boq/data/boq.repository');
  const { reconcileContractBoq } = await import('@/modules/boq/domain/reconciliation');
  const { loadProjectCommercialData } = await import(
    '@/modules/financials/data/commercial.repository'
  );
  const { computeNetApprovedChanges } = await import('@/modules/commercial');
  const { money } = await import('@/shared/money');

  const boqs = await listActiveBoqsWithTotalsForOrg(
    ctx.context.db,
    ctx.context.organizationId,
  );
  const items: CommandCenterItem[] = [];
  for (const row of boqs) {
    if (items.length >= PER_SOURCE_CAP) break;
    const commercial = await loadProjectCommercialData(
      ctx.context.db,
      ctx.context.organizationId,
      row.projectId,
    );
    if (!commercial) continue;

    const approvedChanges = computeNetApprovedChanges(
      commercial.position.approvedAdditions,
      commercial.position.approvedReductions,
    );

    const recon = reconcileContractBoq({
      originalContract: commercial.position.originalContractValue,
      originalBoq: money(row.originalBoqTotal, row.currency),
      currentContract: commercial.position.currentContractValue,
      currentBoq: money(row.currentBoqTotal, row.currency),
      approvedChanges,
      allocatedApprovedChanges: money(row.allocatedApprovedChanges, row.currency),
    });
    if (recon.status === 'matched') continue;

    const [project] = await ctx.context.db
      .select({ name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.id, row.projectId),
          eq(projects.organizationId, ctx.context.organizationId),
        ),
      )
      .limit(1);

    const copy = boqVsContractMismatchCopy(ctx.copyScope, { status: recon.status });
    items.push(
      withItemDefaults({
        sourceType: 'boq_vs_contract_mismatch',
        sourceId: row.boqId,
        what: copy.what,
        why: copy.why,
        where: project?.name ?? fallbackWhere(ctx.copyScope, 'boq'),
        href: `/projects/${row.projectId}?tab=boq`,
        meta: { projectId: row.projectId, status: recon.status },
      }),
    );
  }

  return items;
}

async function loadProjectNames(
  ctx: CollectContext,
  projectIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(projectIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const rows = await ctx.context.db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.organizationId, ctx.context.organizationId), inArray(projects.id, ids)));
  for (const row of rows) map.set(row.id, row.name);
  return map;
}

function mapForecastSeverity(severity: string): CommandCenterSeverity {
  if (severity === 'critical') return 'critical';
  if (severity === 'warning') return 'high';
  return 'low';
}

export async function collectVendorBillsApproaching(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.AP_READ)) return [];

  const payables = await getOrganizationApPayables(ctx.context);
  const horizon = addDays(ctx.today, VENDOR_BILL_APPROACHING_DAYS);
  const items: CommandCenterItem[] = [];

  for (const bill of payables.bills) {
    if (items.length >= PER_SOURCE_CAP) break;
    const outstanding = fromNumericString(bill.outstanding, bill.currency);
    if (!outstanding || isZeroMoney(outstanding) || !isPositiveMoney(outstanding)) continue;
    if (!bill.dueDate) continue;
    if (bill.dueDate < ctx.today) continue;
    if (bill.dueDate > horizon) continue;

    const daysLeft = daysBetween(ctx.today, bill.dueDate);
    const copy = vendorBillApproachingCopy(ctx.copyScope, {
      reference: bill.reference,
      dueDate: bill.dueDate,
      outstanding: bill.outstanding,
      currency: bill.currency,
    });
    items.push(
      withItemDefaults({
        sourceType: 'vendor_bill_approaching',
        sourceId: bill.billId,
        what: copy.what,
        why: copy.why,
        where: bill.vendorName ?? fallbackWhere(ctx.copyScope, 'vendorBills'),
        href: `/procurement/ap/${bill.billId}`,
        urgencyBump: Math.min(99, Math.max(0, (VENDOR_BILL_APPROACHING_DAYS - daysLeft) * 10)),
        meta: { dueDate: bill.dueDate, outstanding: bill.outstanding },
      }),
    );
  }

  return items;
}

export async function collectOcrNeedsReview(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!isOcrReviewUiAllowed()) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.DOCUMENTS_READ)) return [];

  const jobs = await listOcrCandidates(ctx.context, { status: ['needs_review'] });
  return jobs.slice(0, OCR_CAP).map((job) => {
    const filename = job.sourceDocument.filename ?? null;
    const copy = ocrNeedsReviewCopy(ctx.copyScope, filename);
    return withItemDefaults({
      sourceType: 'ocr_needs_review',
      sourceId: job.id,
      what: copy.what,
      why: copy.why,
      where: filename ?? fallbackWhere(ctx.copyScope, 'ocr'),
      href: '/documents/ocr-review',
      meta: { status: job.status },
    });
  });
}

export async function collectOcrFailed(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!isOcrReviewUiAllowed()) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.DOCUMENTS_READ)) return [];

  const jobs = await listOcrCandidates(ctx.context, { status: ['failed'] });
  return jobs.slice(0, OCR_CAP).map((job) => {
    const filename = job.sourceDocument.filename ?? null;
    const copy = ocrFailedCopy(ctx.copyScope, filename);
    return withItemDefaults({
      sourceType: 'ocr_failed',
      sourceId: job.id,
      what: copy.what,
      why: copy.why,
      where: filename ?? fallbackWhere(ctx.copyScope, 'ocr'),
      href: '/documents/ocr-review',
      meta: { status: job.status },
    });
  });
}

export async function collectForecastWarnings(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECT_FINANCIALS_READ)) return [];
  if (ctx.sharedOrganizationRollup === null) return [];

  const warnings = await getOrganizationEarlyWarnings(
    ctx.context,
    ctx.sharedOrganizationRollup ? { rollup: ctx.sharedOrganizationRollup } : undefined,
  );
  const actionable = warnings.filter((warning) => warning.kind !== 'actual_over_budget');
  const names = await loadProjectNames(
    ctx,
    actionable.map((warning) => warning.projectId),
  );
  const items: CommandCenterItem[] = [];

  for (const warning of actionable) {
    if (items.length >= PER_SOURCE_CAP) break;
    const copy = forecastWarningCopy(ctx.copyScope, warning.kind);
    items.push(
      withItemDefaults({
        sourceType: 'forecast_warning',
        sourceId: `${warning.kind}:${warning.projectId}`,
        what: copy.what,
        why: copy.why,
        where: names.get(warning.projectId) ?? fallbackWhere(ctx.copyScope, 'project'),
        href: warning.href,
        severity: mapForecastSeverity(warning.severity),
        meta: { kind: warning.kind, projectId: warning.projectId, warningClass: warning.warningClass },
      }),
    );
  }

  return items;
}

export async function collectOpenPunch(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'field_ops')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.FIELD_OPS_READ)) return [];

  const [openRows, inProgressRows] = await Promise.all([
    listPunchListItemsForOrg(ctx.context, { status: 'open' }),
    listPunchListItemsForOrg(ctx.context, { status: 'in_progress' }),
  ]);
  const rows = [...openRows, ...inProgressRows].slice(0, PER_SOURCE_CAP);
  const names = await loadProjectNames(
    ctx,
    rows.map((row) => row.projectId),
  );
  return rows.map((row) => {
    const copy = punchOpenCopy(ctx.copyScope, row.title);
    const severity: CommandCenterSeverity | undefined =
      row.priority === 'critical' ? 'critical' : row.priority === 'high' ? 'high' : undefined;
    return withItemDefaults({
      sourceType: 'punch_open',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: names.get(row.projectId) ?? fallbackWhere(ctx.copyScope, 'fieldOps'),
      href: `/field-ops/punch/${row.id}`,
      severity,
      meta: { projectId: row.projectId, status: row.status, priority: row.priority },
    });
  });
}

export async function collectOpenSafety(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'safety')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.SAFETY_READ)) return [];

  const rows = (await listSafetyRecordsForOrg(ctx.context, { status: 'open' })).slice(
    0,
    PER_SOURCE_CAP,
  );
  const names = await loadProjectNames(
    ctx,
    rows.map((row) => row.projectId).filter((id): id is string => Boolean(id)),
  );
  return rows.map((row) => {
    const copy = safetyOpenCopy(ctx.copyScope, row.title);
    const severity: CommandCenterSeverity =
      row.severity === 'critical' ? 'critical' : row.severity === 'high' ? 'high' : 'medium';
    return withItemDefaults({
      sourceType: 'safety_open',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: (row.projectId ? names.get(row.projectId) : null) ?? fallbackWhere(ctx.copyScope, 'safety'),
      href: `/safety/${row.id}`,
      severity,
      meta: { projectId: row.projectId, recordSeverity: row.severity },
    });
  });
}

export async function collectOpenInspections(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'field_ops')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.FIELD_OPS_READ)) return [];

  const [scheduled, inProgress] = await Promise.all([
    listInspectionsForOrg(ctx.context, { status: 'scheduled' }),
    listInspectionsForOrg(ctx.context, { status: 'in_progress' }),
  ]);
  const overdue = [...scheduled, ...inProgress]
    .filter((row) => row.scheduledOn != null && row.scheduledOn < ctx.today)
    .slice(0, PER_SOURCE_CAP);
  const names = await loadProjectNames(
    ctx,
    overdue.map((row) => row.projectId),
  );
  return overdue.map((row) => {
    const copy = inspectionOpenCopy(ctx.copyScope, row.title, row.scheduledOn);
    const days = row.scheduledOn ? daysBetween(businessDate(row.scheduledOn), ctx.today) : 0;
    return withItemDefaults({
      sourceType: 'inspection_open',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: names.get(row.projectId) ?? fallbackWhere(ctx.copyScope, 'fieldOps'),
      href: `/field-ops/inspections/${row.id}`,
      urgencyBump: Math.min(99, Math.max(0, days)),
      meta: { projectId: row.projectId, scheduledOn: row.scheduledOn, status: row.status },
    });
  });
}

export async function collectRecurringDraftIssues(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasAnyPermission(ctx.context, ANY_DRAFT_ACCESS_PERMISSIONS)) return [];

  const drafts = await listRecurringDraftsForOrg(ctx.context, { status: 'active' });
  const stuck = drafts
    .filter((draft) => draft.nextRunDate < ctx.today)
    .slice(0, PER_SOURCE_CAP);
  return stuck.map((draft) => {
    const copy = recurringDraftIssueCopy(ctx.copyScope, draft.title, draft.nextRunDate);
    return withItemDefaults({
      sourceType: 'recurring_draft_issue',
      sourceId: draft.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'recurring'),
      href: `/recurring-drafts/${draft.id}`,
      meta: { nextRunDate: draft.nextRunDate, draftKind: draft.draftKind },
    });
  });
}

export async function collectMissingTimesheets(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!moduleOn(ctx.modules, 'workforce')) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.WORKFORCE_READ)) return [];

  const sheets = await listTimesheetsForOrg(ctx.context, { status: 'draft' });
  const missing = sheets
    .filter((sheet) => sheet.periodEnd < ctx.today)
    .slice(0, PER_SOURCE_CAP);
  return missing.map((sheet) => {
    const copy = timesheetMissingCopy(ctx.copyScope, sheet.periodEnd);
    return withItemDefaults({
      sourceType: 'timesheet_missing',
      sourceId: sheet.id,
      what: copy.what,
      why: copy.why,
      where: sheet.employeeName || fallbackWhere(ctx.copyScope, 'timesheets'),
      href: '/workforce/time',
      meta: { periodStart: sheet.periodStart, periodEnd: sheet.periodEnd },
    });
  });
}

export async function collectBillingPlanDraftCycles(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) return [];
  if (!moduleOn(ctx.modules, 'billing')) return [];

  try {
    const { listDraftCyclesAwaitingIssue } = await import(
      '@/modules/billing-plan/data/forecast.repository'
    );
    const rows = await listDraftCyclesAwaitingIssue(
      ctx.context.db,
      ctx.context.organizationId,
      PER_SOURCE_CAP,
    );
    return rows.map((row) => {
      const copy = billingPlanCycleDraftCopy(ctx.copyScope, {
        title: row.title,
        cycleNumber: row.cycleNumber,
      });
      return withItemDefaults({
        sourceType: 'billing_plan_cycle_draft',
        sourceId: row.cycleId,
        what: copy.what,
        why: copy.why,
        where: row.projectName || fallbackWhere(ctx.copyScope, 'billing'),
        href: `/projects/${row.projectId}?tab=billingPlan`,
        meta: { accountDate: row.accountDate, status: row.status },
      });
    });
  } catch {
    // Migration 0065 may be absent in older DBs — skip silently.
    return [];
  }
}

export async function collectBillingPlanMilestonesDue(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) return [];
  if (!moduleOn(ctx.modules, 'billing')) return [];

  try {
    const { listMilestoneLinesDue } = await import(
      '@/modules/billing-plan/data/forecast.repository'
    );
    const rows = await listMilestoneLinesDue(
      ctx.context.db,
      ctx.context.organizationId,
      ctx.today,
      7,
      PER_SOURCE_CAP,
    );
    return rows.map((row) => {
      const copy = billingPlanMilestoneDueCopy(ctx.copyScope, {
        label: row.label,
        targetDate: row.targetDate,
      });
      const days = daysBetween(row.targetDate as BusinessDate, ctx.today);
      return withItemDefaults({
        sourceType: 'billing_plan_milestone_due',
        sourceId: row.lineId,
        what: copy.what,
        why: copy.why,
        where: row.projectName || fallbackWhere(ctx.copyScope, 'billing'),
        href: `/projects/${row.projectId}?tab=billingPlan`,
        urgencyBump: Math.min(99, Math.max(0, days >= 0 ? days : 0)),
        meta: { targetDate: row.targetDate, planId: row.planId },
      });
    });
  } catch {
    return [];
  }
}

export async function collectBillingPlanRetentionReleaseDue(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.BILLING_READ)) return [];
  if (!moduleOn(ctx.modules, 'billing')) return [];

  try {
    const { listBillingPlanRetentionReleaseDue } = await import(
      '@/modules/billing-plan/data/forecast.repository'
    );
    const rows = await listBillingPlanRetentionReleaseDue(
      ctx.context.db,
      ctx.context.organizationId,
      PER_SOURCE_CAP,
    );
    return rows.map((row) => {
      const copy = billingPlanRetentionReleaseDueCopy(ctx.copyScope, {
        heldRemaining: row.heldRemaining,
        currency: row.currency,
      });
      return withItemDefaults({
        sourceType: 'billing_plan_retention_release_due',
        sourceId: row.projectId,
        what: copy.what,
        why: copy.why,
        where: row.projectName || fallbackWhere(ctx.copyScope, 'billing'),
        href: `/projects/${row.projectId}?tab=billingPlan`,
        meta: {
          heldRemaining: row.heldRemaining,
          currency: row.currency,
          recordCount: row.recordCount,
        },
      });
    });
  } catch {
    // Migration 0065 / sourceKind may be absent — skip silently.
    return [];
  }
}

/** Run all collectors; individual failures are isolated. One org rollup is shared. */
export async function collectAllSources(ctx: CollectContext): Promise<CommandCenterItem[]> {
  const sharedOrganizationRollup = hasPermission(ctx.context, PERMISSIONS.PROJECT_FINANCIALS_READ)
    ? await getOrganizationProjectRollup(ctx.context)
    : null;
  const sharedCtx: CollectContext = { ...ctx, sharedOrganizationRollup };
  const collectors = [
    collectOverdueAr,
    collectVendorBillsDue,
    collectVendorBillsApproaching,
    collectOpenAttendance,
    collectUnallocatedEmployeeCost,
    collectUnallocatedVendorBills,
    collectProjectOverBudget,
    collectForecastWarnings,
    collectOpenApprovals,
    collectOverduePlanning,
    collectExpiringCompliance,
    collectOverdueMaintenance,
    collectCreditVoidIssues,
    collectMonthCloseIncomplete,
    collectBoqMeasurementAwaitingApproval,
    collectBoqProgressReadyToBill,
    collectBoqVsContractMismatch,
    collectOcrNeedsReview,
    collectOcrFailed,
    collectOpenPunch,
    collectOpenSafety,
    collectOpenInspections,
    collectRecurringDraftIssues,
    collectMissingTimesheets,
    collectCloseoutBlockers,
    collectWarrantyExpiring,
    collectCashFlowRisk,
    collectAutomationFollowups,
    collectFailedCommunications,
    collectBillingPlanDraftCycles,
    collectBillingPlanMilestonesDue,
    collectBillingPlanRetentionReleaseDue,
    collectMissingAttendanceToday,
    collectExpensesDueToday,
    collectExpensesNeedingAllocation,
    collectPayrollDueToday,
    collectMonthlyWorkforceReportReady,
    // ── Universal Work Management (sequential savepoint isolation) ──────────
    collectUwmTaskSources,
  ];

  const settled = await Promise.allSettled(collectors.map((fn) => fn(sharedCtx)));
  const items: CommandCenterItem[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') items.push(...result.value);
  }
  return items;
}
