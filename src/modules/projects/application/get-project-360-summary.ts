import { and, eq, inArray, isNull } from 'drizzle-orm';
import { projects, tasks } from '@drizzle/schema';
import { captureCurrentMarginSnapshot } from '@/modules/financials/application/capture-margin-snapshot';
import type { MarginTrendPoint } from '@/modules/financials/domain/margin-trend';
import { computeUnbilledBacklog } from '@/modules/financials/domain/management-analytics';
import { resolveForecastCostBasis } from '@/modules/financials/domain/resolve-forecast-cost-basis';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { loadProjectProgressView } from './project-progress-mode';
import { DEFAULT_PROJECT_PROFITABILITY_MODE } from '@/modules/tenancy/domain/project-profitability-mode';
import {
  findWorkspaceIdsByActor,
  getWorkspaceScope,
  listWorkspacesForOrg,
} from '@/modules/workspaces';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import type { MoneyValue } from '@/shared/money';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectOverviewPayload } from './get-project-overview-payload';
import { listProjectMilestones } from './milestones';
import { buildScheduleSummary, parseProgressPercent } from '../domain/scheduling';
import type { ProgressStatus, ProjectStatus } from '../domain/types';

const OPEN_TASK_STATUSES = new Set(['todo', 'in_progress', 'in_review', 'blocked']);

export interface Project360Commercial {
  readonly currentContractValue: MoneyValue;
  readonly approvedAdditions: MoneyValue;
  readonly approvedReductions: MoneyValue;
  readonly pendingChanges: MoneyValue;
}

export interface Project360Billing {
  readonly billed: MoneyValue;
  readonly remainingToBill: MoneyValue | null;
  readonly collected: MoneyValue;
  readonly outstanding: MoneyValue;
}

export interface Project360Cost {
  readonly actual: MoneyValue;
  readonly openCommitments: MoneyValue;
  /** ETC already excludes open commitments. Do not add them again. */
  readonly expectedRemainingCost: MoneyValue;
  readonly forecastFinalCost: MoneyValue;
}

export interface Project360Profit {
  readonly actualProfit: MoneyValue;
  readonly forecastProfit: MoneyValue;
  readonly marginPercent: string | null;
}

export interface Project360Money {
  readonly priceNotSet: boolean;
  readonly commercial: Project360Commercial | null;
  readonly billing: Project360Billing | null;
  readonly cost: Project360Cost;
  readonly profit: Project360Profit | null;
}

export interface Project360NextMilestone {
  readonly name: string;
  readonly targetDate: string | null;
}

export interface Project360Work {
  readonly progressPercent: number | null;
  readonly progressFromTasks: boolean;
  /** Null when the viewer cannot read tasks. */
  readonly overdueTaskCount: number | null;
  /** Null when the viewer cannot read tasks. */
  readonly blockedTaskCount: number | null;
  readonly nextMilestone: Project360NextMilestone | null;
}

export interface Project360Summary {
  /** Null when the viewer lacks project_financials.read. */
  readonly money: Project360Money | null;
  readonly work: Project360Work;
  /** Empty until migration 0130 exists, or when the viewer cannot read financials. */
  readonly marginTrend: readonly MarginTrendPoint[];
}

/**
 * Read-only Project 360 header.
 *
 * Money comes from `getProjectOverviewPayload` → `getProjectFinancials`.
 * Actual and forecast pick the composed field the profit engine already used
 * for the org profitability mode. Profit figures are copied, not recalculated.
 * Remaining to bill uses `computeUnbilledBacklog`.
 * Task progress uses `deriveProjectProgress` only when `progress_source` is `tasks`.
 */
export async function getProject360Summary(
  context: OrgContext,
  projectId: string,
): Promise<Project360Summary> {
  const canReadTasks = hasPermission(context, PERMISSIONS.TASKS_READ);
  const today = todayInTimeZone(context.organization.timezone ?? 'Asia/Jerusalem');

  const [overview, progressRow, milestones, taskRows] = await Promise.all([
    getProjectOverviewPayload(context, projectId),
    loadProgressRow(context, projectId),
    listProjectMilestones(context, projectId),
    canReadTasks ? loadProjectTaskRows(context, projectId) : Promise.resolve(null),
  ]);

  const schedule = buildScheduleSummary({
    project: {
      status: (progressRow?.status ?? 'active') as ProjectStatus,
      startDate: progressRow?.startDate ?? null,
      targetEndDate: progressRow?.targetEndDate ?? null,
      actualEndDate: progressRow?.actualEndDate ?? null,
      progressPercent: progressRow?.progressPercent ?? null,
      progressStatus: (progressRow?.progressStatus ?? null) as ProgressStatus | null,
    },
    workPackages: [],
    milestones,
    today,
  });

  const progressFromTasks = progressRow?.progressSource === 'tasks';
  let progressPercent = parseProgressPercent(progressRow?.progressPercent ?? null);
  let overdueTaskCount: number | null = null;
  let blockedTaskCount: number | null = null;

  if (canReadTasks && taskRows) {
    overdueTaskCount = 0;
    blockedTaskCount = 0;
    for (const row of taskRows) {
      if (row.status === 'blocked') blockedTaskCount += 1;
      if (
        OPEN_TASK_STATUSES.has(row.status) &&
        row.dueDate != null &&
        row.dueDate < today
      ) {
        overdueTaskCount += 1;
      }
    }
  }

  if (progressFromTasks) {
    const view = await loadProjectProgressView(context.db, context.organizationId, projectId);
    progressPercent = view?.displayedPercent ?? null;
  }

  const marginTrend = overview.financials
    ? await captureCurrentMarginSnapshot(context, overview.financials)
    : [];

  return {
    money: overview.financials ? assembleMoney(overview.financials) : null,
    marginTrend,
    work: {
      progressPercent,
      progressFromTasks,
      overdueTaskCount,
      blockedTaskCount,
      nextMilestone: schedule.nextMilestone
        ? {
            name: schedule.nextMilestone.name,
            targetDate: schedule.nextMilestone.targetDate,
          }
        : null,
    },
  };
}

function assembleMoney(financials: ProjectFinancials): Project360Money {
  const mode = financials.projectProfitabilityMode ?? DEFAULT_PROJECT_PROFITABILITY_MODE;
  const forecast = resolveForecastCostBasis(mode, financials.cost);
  const actual =
    mode === 'include_general'
      ? financials.cost.fullActualCostToDate
      : financials.cost.actualCostToDate;
  const commercial = financials.commercial;
  const billingAvailable = financials.kpiAvailability?.billing !== 'unavailable';

  return {
    priceNotSet: financials.priceNotSet === true,
    commercial: commercial
      ? {
          currentContractValue: commercial.currentContractValue,
          approvedAdditions: commercial.approvedAdditions,
          approvedReductions: commercial.approvedReductions,
          pendingChanges: commercial.pendingChanges,
        }
      : null,
    billing: billingAvailable
      ? {
          billed: financials.billing.netInvoiced,
          remainingToBill: commercial
            ? computeUnbilledBacklog(
                commercial.currentContractValue,
                financials.billing.netInvoiced,
                financials.billing.invoiced,
              )
            : null,
          collected: financials.billing.netPaid,
          outstanding: financials.billing.netOutstanding,
        }
      : null,
    cost: {
      actual,
      openCommitments: financials.cost.committedOpen,
      expectedRemainingCost: financials.cost.expectedRemainingCost,
      forecastFinalCost: forecast.primaryForecastFinalCost,
    },
    profit: financials.profit
      ? {
          actualProfit: financials.profit.actualProfit,
          forecastProfit: financials.profit.estimatedProfit,
          marginPercent: financials.profit.marginPercent,
        }
      : null,
  };
}

async function loadProgressRow(context: OrgContext, projectId: string) {
  const [row] = await context.db
    .select({
      progressSource: projects.progressSource,
      progressPercent: projects.progressPercent,
      progressStatus: projects.progressStatus,
      status: projects.status,
      startDate: projects.startDate,
      targetEndDate: projects.targetEndDate,
      actualEndDate: projects.actualEndDate,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);
  return row ?? null;
}

async function loadProjectTaskRows(context: OrgContext, projectId: string) {
  const workspaceIds = await accessibleWorkspaceIds(context);
  if (workspaceIds !== 'all' && workspaceIds.length === 0) return [];

  const conditions = [
    eq(tasks.organizationId, context.organizationId),
    eq(tasks.projectId, projectId),
    isNull(tasks.archivedAt),
  ];
  if (workspaceIds !== 'all') {
    conditions.push(inArray(tasks.workspaceId, workspaceIds));
  }

  return context.db
    .select({
      status: tasks.status,
      dueDate: tasks.dueDate,
      contributesToProgress: tasks.contributesToProgress,
      progressWeight: tasks.progressWeight,
      isArchived: tasks.isArchived,
    })
    .from(tasks)
    .where(and(...conditions));
}

async function accessibleWorkspaceIds(context: OrgContext): Promise<string[] | 'all'> {
  if (getWorkspaceScope(context) === 'full') return 'all';

  const [memberIds, orgVisible] = await Promise.all([
    findWorkspaceIdsByActor(context.db, context.organizationId, {
      orgMemberId: context.membershipId,
    }),
    listWorkspacesForOrg(context.db, context.organizationId, { includeArchived: false }),
  ]);
  const orgVisibleIds = orgVisible
    .filter((workspace) => workspace.workspaceVisibility === 'organization')
    .map((workspace) => workspace.id);
  return Array.from(new Set([...orgVisibleIds, ...memberIds]));
}
