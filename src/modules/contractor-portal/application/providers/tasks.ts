import {
  listContractorPortalTasks,
  type ContractorPortalTask,
} from '@/modules/collaboration/application/contractor-tasks';
import { EXTERNAL_CAPABILITIES as CAP, type ExternalContext } from '@/shared/external';
import { buildPortalHref, portalRoute } from '../../domain/routes';
import type { PortalSectionItem, PortalSectionProvider, PortalSectionScope } from '../../domain/sections';
import { BADGE, portalToday, projectSet, singleProjectId, targetsByOrganization } from './shared';

const TASK_CAPABILITY = { anyOf: [CAP.TASK_WORK, CAP.TASK_REPORT] } as const;
const TASK_LIMIT = 200;

async function loadOpenTasks(context: ExternalContext, scope: PortalSectionScope): Promise<ContractorPortalTask[]> {
  const allowed = projectSet(scope.targets);
  const tasks: ContractorPortalTask[] = [];
  for (const [organizationId, targets] of targetsByOrganization(scope.targets)) {
    const rows = await listContractorPortalTasks(context, {
      organizationId,
      projectId: singleProjectId(targets),
      openOnly: true,
      limit: TASK_LIMIT,
    });
    tasks.push(...rows.filter((task) => allowed.has(task.projectId)));
  }
  return tasks.sort((a, b) => (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31'));
}

function awaitingVerification(task: ContractorPortalTask): boolean {
  return task.status === 'completion_submitted' || task.status === 'resubmitted';
}

function taskItem(task: ContractorPortalTask, today: string): PortalSectionItem {
  const dueToday = task.dueDate === today;
  return {
    id: task.taskId,
    projectId: task.projectId,
    title: task.title,
    subtitle: task.locationName,
    dueAt: task.dueDate,
    statusKey: task.overdue
      ? BADGE.overdue
      : awaitingVerification(task)
        ? BADGE.awaitingVerification
        : task.availableCommands.length > 0
          ? BADGE.actionRequired
          : dueToday
            ? BADGE.today
            : BADGE.open,
    tone: task.overdue ? 'danger' : task.availableCommands.length > 0 ? 'attention' : 'neutral',
    href: buildPortalHref(portalRoute('project.task').path, { projectId: task.projectId, taskId: task.taskId }),
  };
}

/** Track G: open tasks assigned to the contractor company / user. */
export const openTasksProvider: PortalSectionProvider = {
  id: 'collaboration.tasks',
  section: 'tasks',
  capability: TASK_CAPABILITY,
  async load(context, scope) {
    const today = portalToday(scope);
    const tasks = await loadOpenTasks(context, scope);
    return {
      count: tasks.length,
      attentionCount: tasks.filter((task) => task.availableCommands.length > 0).length,
      items: tasks.slice(0, scope.limit).map((task) => taskItem(task, today)),
    };
  },
};

export const overdueTasksProvider: PortalSectionProvider = {
  id: 'collaboration.overdue-tasks',
  section: 'overdueTasks',
  capability: TASK_CAPABILITY,
  async load(context, scope) {
    const today = portalToday(scope);
    const overdue = (await loadOpenTasks(context, scope)).filter((task) => task.overdue);
    return {
      count: overdue.length,
      attentionCount: overdue.length,
      items: overdue.slice(0, scope.limit).map((task) => taskItem(task, today)),
    };
  },
};

export const todayTasksProvider: PortalSectionProvider = {
  id: 'collaboration.today',
  section: 'today',
  capability: TASK_CAPABILITY,
  async load(context, scope) {
    const today = portalToday(scope);
    const due = (await loadOpenTasks(context, scope)).filter((task) => task.dueDate === today);
    return {
      count: due.length,
      attentionCount: due.filter((task) => task.availableCommands.length > 0).length,
      items: due.slice(0, scope.limit).map((task) => taskItem(task, today)),
    };
  },
};
