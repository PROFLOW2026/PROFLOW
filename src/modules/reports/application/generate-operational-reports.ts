import { listPendingApprovals } from '@/modules/approvals';
import { assertCanAccessProject, findProjectById } from '@/modules/projects';
import { getPortfolio, type PortfolioProjectRow } from '@/modules/tasks/application/get-portfolio';
import { getTeamWorkload } from '@/modules/tasks/application/get-team-workload';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { localizeCode } from '@/shared/i18n/code-display';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  getReportsCopy,
  reportDirection,
  reportTitle,
  resolveReportLocale,
} from '../domain/copy';
import type { ReportKind, ReportPayload, ReportRow, ReportSection } from '../domain/types';
import {
  getApprovalQueueStatusReport,
  getMilestoneStatusReport,
  getOverdueTasksReport,
  getProjectTaskStatusReport,
  getStaleProjectsReport,
} from './task-reports';

type BuildCtx = {
  locale: string;
  copy: ReturnType<typeof getReportsCopy>;
  generatedAt: Date;
  companyName: string;
};

const DETAIL_CAP = 40;
const OVERDUE_QUERY_LIMIT = 100;
const APPROVAL_LIST_LIMIT = 50;
const PORTFOLIO_PAGE = 200;
const PORTFOLIO_MAX_PAGES = 25;
const STALE_QUERY_LIMIT = 100;

function envelope(input: {
  kind: ReportKind;
  locale: string;
  generatedAt: Date;
  identity: ReportPayload['identity'];
  sections: readonly ReportSection[];
  notices: readonly string[];
}): ReportPayload {
  return {
    kind: input.kind,
    title: reportTitle(getReportsCopy(input.locale), input.kind),
    generatedAt: input.generatedAt.toISOString(),
    locale: resolveReportLocale(input.locale),
    dir: reportDirection(input.locale),
    identity: input.identity,
    notices: input.notices,
    sections: input.sections,
    omitted: {},
  };
}

function orgIdentity(companyName: string, extra?: string | null): ReportPayload['identity'] {
  return {
    companyName,
    projectId: null,
    projectName: null,
    projectNumber: null,
    clientName: null,
    extra: extra ?? null,
  };
}

function deepLink(copy: ReturnType<typeof getReportsCopy>, path: string): string {
  return `${copy.phrases.open}: ${path}`;
}

function approvalDay(value: Date): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    return String(value).slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function fill(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function countBy(values: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

async function loadPortfolio(
  context: OrgContext,
  filters: { readonly stale?: boolean } = {},
): Promise<{
  readonly rows: readonly PortfolioProjectRow[];
  readonly totalCount: number;
  readonly complete: boolean;
}> {
  const first = await getPortfolio(context, {
    ...filters,
    limit: PORTFOLIO_PAGE,
    offset: 0,
  });
  const rows = [...first.rows];
  let offset = rows.length;
  let pages = 1;
  while (offset < first.totalCount && pages < PORTFOLIO_MAX_PAGES) {
    const page = await getPortfolio(context, {
      ...filters,
      limit: PORTFOLIO_PAGE,
      offset,
    });
    if (page.rows.length === 0) break;
    rows.push(...page.rows);
    offset += page.rows.length;
    pages += 1;
  }
  return {
    rows,
    totalCount: first.totalCount,
    complete: rows.length >= first.totalCount,
  };
}

export async function buildProjectTaskStatusReport(
  context: OrgContext,
  projectId: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  await assertCanAccessProject(context, projectId);

  const groups = await getProjectTaskStatusReport(context, projectId);
  const group = groups[0];
  const rows: ReportRow[] = group
    ? [
        { label: ctx.copy.fields.tasksTotal, value: String(group.total) },
        ...Object.entries(group.statusCounts).map(([status, count]) => ({
          label: localizeCode(ctx.locale, status),
          value: String(count),
        })),
      ]
    : [];

  return envelope({
    kind: 'project_task_status',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: {
      companyName: ctx.companyName,
      projectId: project.id,
      projectName: project.name,
      projectNumber: project.documentNumber,
      clientName: null,
    },
    sections: [
      {
        id: 'status',
        heading: ctx.copy.sections.taskStatus,
        rows,
        paragraphs:
          rows.length === 0
            ? [ctx.copy.empty.noProjectTasks]
            : [deepLink(ctx.copy, `/projects/${project.id}/tasks`)],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildOverdueTasksOrgReport(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const tasks = await getOverdueTasksReport(context, { limit: OVERDUE_QUERY_LIMIT });
  const capped = tasks.length >= OVERDUE_QUERY_LIMIT;
  const detail = tasks.slice(0, DETAIL_CAP);

  return envelope({
    kind: 'overdue_tasks_org',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      {
        id: 'kpi',
        heading: ctx.copy.sections.overdueTasks,
        rows: [
          {
            label: capped ? ctx.copy.fields.listed : ctx.copy.fields.overdueTasks,
            value: String(tasks.length),
          },
        ],
      },
      {
        id: 'tasks',
        heading: ctx.copy.sections.overdueTasks,
        rows: detail.map((task) => ({
          label: `${task.projectName ?? '-'} · ${task.title}`,
          value: `${localizeCode(ctx.locale, task.status)} · ${localizeCode(ctx.locale, task.priority)} · ${task.dueDate} · ${task.daysOverdue}`,
          href: `/tasks/${task.taskId}`,
        })),
        paragraphs: [
          ...(tasks.length === 0 ? [ctx.copy.empty.noOverdueTasks] : []),
          ...(capped ? [ctx.copy.notices.listCapped] : []),
          ...(detail.length < tasks.length
            ? [fill(ctx.copy.notices.showingPartial, { shown: detail.length, total: tasks.length })]
            : []),
          deepLink(ctx.copy, '/operations'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildMilestoneStatusReportPayload(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const milestones = await getMilestoneStatusReport(context);
  const byStatus = countBy(milestones.map((milestone) => milestone.status));
  const detail = milestones.slice(0, DETAIL_CAP);

  return envelope({
    kind: 'milestone_status',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      {
        id: 'kpi',
        heading: ctx.copy.sections.milestones,
        rows: [
          { label: ctx.copy.fields.milestonesListed, value: String(milestones.length) },
          ...[...byStatus.entries()].map(([status, count]) => ({
            label: localizeCode(ctx.locale, status),
            value: String(count),
          })),
        ],
      },
      {
        id: 'milestones',
        heading: ctx.copy.sections.milestones,
        rows: detail.map((milestone) => ({
          label: `${milestone.projectName} · ${milestone.name}`,
          value: `${localizeCode(ctx.locale, milestone.status)} · ${milestone.dueDate ?? '-'}`,
          href: `/projects/${milestone.projectId}`,
        })),
        paragraphs: [
          ...(milestones.length === 0 ? [ctx.copy.empty.noMilestones] : []),
          ...(detail.length < milestones.length
            ? [
                fill(ctx.copy.notices.showingPartial, {
                  shown: detail.length,
                  total: milestones.length,
                }),
              ]
            : []),
          deepLink(ctx.copy, '/portfolio'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildTeamWorkloadReportPayload(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const workload = await getTeamWorkload(context);
  const detail = workload.rows.slice(0, DETAIL_CAP);

  return envelope({
    kind: 'team_workload',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      {
        id: 'kpi',
        heading: ctx.copy.sections.teamWorkload,
        rows: [{ label: ctx.copy.fields.employeesListed, value: String(workload.rows.length) }],
      },
      {
        id: 'employees',
        heading: ctx.copy.sections.teamWorkload,
        rows: detail.map((row) => {
          const parts = [
            `${row.openTasks} ${ctx.copy.fields.openTasks}`,
            `${row.overdueTasks} ${ctx.copy.fields.overdueTasks}`,
            `${row.dueThisWeek} ${ctx.copy.fields.dueThisWeek}`,
            `${row.projectCount} ${ctx.copy.fields.projectsAssigned}`,
          ];
          if (workload.showEstimatedEffort && row.totalEstimatedMinutes !== null) {
            parts.push(`${row.totalEstimatedMinutes} ${ctx.copy.fields.estimatedMinutes}`);
          }
          return {
            label: row.name,
            value: parts.join(' · '),
          };
        }),
        paragraphs: [
          ...(workload.rows.length === 0 ? [ctx.copy.empty.noWorkloadRows] : []),
          ...(detail.length < workload.rows.length
            ? [
                fill(ctx.copy.notices.showingPartial, {
                  shown: detail.length,
                  total: workload.rows.length,
                }),
              ]
            : []),
          deepLink(ctx.copy, '/workload'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

function portfolioDetailRows(
  rows: readonly PortfolioProjectRow[],
  ctx: BuildCtx,
): ReportRow[] {
  return rows.slice(0, DETAIL_CAP).map((row) => ({
    label: row.displayName,
    value: [
      localizeCode(ctx.locale, row.status),
      row.currentStage ?? ctx.copy.fields.noStage,
      `${row.openTasks} ${ctx.copy.fields.openTasks}`,
      `${row.overdueTasks} ${ctx.copy.fields.overdueTasks}`,
      `${row.blockedTasks} ${ctx.copy.fields.blockedTasks}`,
    ].join(' · '),
    href: `/projects/${row.projectId}`,
  }));
}

export async function buildPortfolioStatusReport(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const portfolio = await loadPortfolio(context);
  const detail = portfolioDetailRows(portfolio.rows, ctx);
  const kpi: ReportRow[] = [
    { label: ctx.copy.fields.projectsListed, value: String(portfolio.totalCount) },
  ];
  if (portfolio.complete) {
    kpi.push(
      {
        label: ctx.copy.fields.openTasks,
        value: String(portfolio.rows.reduce((sum, row) => sum + row.openTasks, 0)),
      },
      {
        label: ctx.copy.fields.overdueTasks,
        value: String(portfolio.rows.reduce((sum, row) => sum + row.overdueTasks, 0)),
      },
      {
        label: ctx.copy.fields.blockedTasks,
        value: String(portfolio.rows.reduce((sum, row) => sum + row.blockedTasks, 0)),
      },
    );
  }

  return envelope({
    kind: 'portfolio_status',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      { id: 'kpi', heading: ctx.copy.sections.portfolioKpis, rows: kpi },
      {
        id: 'projects',
        heading: ctx.copy.sections.portfolioProjects,
        rows: detail,
        paragraphs: [
          ...(portfolio.rows.length === 0 ? [ctx.copy.empty.noPortfolioProjects] : []),
          ...(!portfolio.complete
            ? [
                fill(ctx.copy.notices.portfolioPartial, {
                  loaded: portfolio.rows.length,
                  total: portfolio.totalCount,
                }),
              ]
            : []),
          ...(detail.length < portfolio.rows.length
            ? [
                fill(ctx.copy.notices.showingPartial, {
                  shown: detail.length,
                  total: portfolio.rows.length,
                }),
              ]
            : []),
          deepLink(ctx.copy, '/portfolio'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildStageDistributionReport(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  if (!hasPermission(context, PERMISSIONS.PORTFOLIO_READ)) {
    return envelope({
      kind: 'stage_distribution',
      locale: ctx.locale,
      generatedAt: ctx.generatedAt,
      identity: orgIdentity(ctx.companyName),
      sections: [
        {
          id: 'denied',
          heading: ctx.copy.sections.stageDistribution,
          paragraphs: [ctx.copy.empty.stageNeedsPortfolio],
        },
      ],
      notices: [ctx.copy.snapshotNote],
    });
  }

  const portfolio = await loadPortfolio(context);
  const stageRows: ReportRow[] = portfolio.complete
    ? [...countBy(portfolio.rows.map((row) => row.currentStage ?? ctx.copy.fields.noStage)).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([stage, count]) => ({ label: stage, value: String(count) }))
    : [];

  return envelope({
    kind: 'stage_distribution',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      {
        id: 'stages',
        heading: ctx.copy.sections.stageDistribution,
        rows: portfolio.complete
          ? [{ label: ctx.copy.fields.projectsListed, value: String(portfolio.totalCount) }, ...stageRows]
          : portfolioDetailRows(portfolio.rows, ctx),
        paragraphs: [
          ...(portfolio.rows.length === 0 ? [ctx.copy.empty.noPortfolioProjects] : []),
          ...(!portfolio.complete
            ? [
                fill(ctx.copy.notices.portfolioPartial, {
                  loaded: portfolio.rows.length,
                  total: portfolio.totalCount,
                }),
              ]
            : []),
          deepLink(ctx.copy, '/portfolio'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildStaleProjectsReport(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const projects = await getStaleProjectsReport(context, 14);
  const capped = projects.length >= STALE_QUERY_LIMIT;
  const detail = projects.slice(0, DETAIL_CAP);

  return envelope({
    kind: 'stale_projects',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      {
        id: 'kpi',
        heading: ctx.copy.sections.staleProjects,
        rows: [
          {
            label: capped ? ctx.copy.fields.listed : ctx.copy.fields.projectsListed,
            value: String(projects.length),
          },
        ],
        paragraphs: [ctx.copy.notices.staleWindow],
      },
      {
        id: 'projects',
        heading: ctx.copy.sections.staleProjects,
        rows: detail.map((project) => ({
          label: project.name,
          value: `${localizeCode(ctx.locale, project.status)} · ${
            project.daysSinceActivity === null ? '-' : String(project.daysSinceActivity)
          }`,
          href: `/projects/${project.projectId}`,
        })),
        paragraphs: [
          ...(projects.length === 0 ? [ctx.copy.empty.noStaleProjects] : []),
          ...(capped ? [ctx.copy.notices.listCapped] : []),
          ...(detail.length < projects.length
            ? [fill(ctx.copy.notices.showingPartial, { shown: detail.length, total: projects.length })]
            : []),
          deepLink(ctx.copy, '/operations'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}

export async function buildApprovalQueueStatusReport(
  context: OrgContext,
  _id: string,
  ctx: BuildCtx,
): Promise<ReportPayload> {
  const [counts, pending] = await Promise.all([
    getApprovalQueueStatusReport(context),
    listPendingApprovals(context, { limit: APPROVAL_LIST_LIMIT }),
  ]);
  const submitted = counts.reduce((sum, row) => sum + row.pendingCount, 0);
  const listCapped = pending.length >= APPROVAL_LIST_LIMIT;

  return envelope({
    kind: 'approval_queue_status',
    locale: ctx.locale,
    generatedAt: ctx.generatedAt,
    identity: orgIdentity(ctx.companyName),
    sections: [
      {
        id: 'kpi',
        heading: ctx.copy.sections.approvalQueue,
        rows: [
          { label: ctx.copy.fields.pendingSubmitted, value: String(submitted) },
          ...counts.map((row) => ({
            label: localizeCode(ctx.locale, row.entityType),
            value: String(row.pendingCount),
          })),
        ],
      },
      {
        id: 'pending',
        heading: ctx.copy.sections.approvalQueue,
        rows: pending.map((item) => ({
          label: localizeCode(ctx.locale, item.entityType),
          value: [item.submitterName ?? '-', approvalDay(item.createdAt)].join(' · '),
          href: item.sourceHref ?? undefined,
        })),
        paragraphs: [
          ...(pending.length === 0 ? [ctx.copy.empty.noPendingApprovals] : []),
          ...(listCapped ? [ctx.copy.notices.approvalListCapped] : []),
          deepLink(ctx.copy, '/approvals'),
        ],
      },
    ],
    notices: [ctx.copy.snapshotNote],
  });
}
