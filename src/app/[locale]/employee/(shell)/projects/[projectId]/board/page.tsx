import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { employeeCanUpdateTaskGrant } from '@/modules/employee-app/application/task-permission-scope';
import {
  getEmployeeProjectTaskOverview,
  listEmployeePmTasks,
  listEmployeePmCreatableProjects,
  updateEmployeePmTaskStatus,
} from '@/modules/employee-app/application/employee-pm-tasks';
import {
  assigneeDisplaysForTask,
  loadTaskAssigneeDisplayMap,
} from '@/modules/tasks/application/enrich-task-assignees';
import {
  EMPLOYEE_STATUS_BOARD_COLUMNS,
  mapEmployeePmTaskToCardData,
} from '@/modules/employee-app/application/map-employee-pm-task-card';
import { EmployeeProjectBoardShell } from '@/modules/employee-app/ui/employee-project-board-shell';
import type { Bucket, TaskStatus } from '@/modules/tasks/ui/_task-api-stub';

interface PageProps {
  params: Promise<{ projectId: string; locale: string }>;
}

export default async function EmployeeProjectBoardPage({ params }: PageProps) {
  const { projectId } = await params;
  const tTasks = await getTranslations('employeeApp.tasks');

  const data = await withOrgContext(async (context) => {
    const readScope = employeePermissionScope(context, PERMISSIONS.TASKS_READ);
    if (!readScope) return null;

    const overview = await getEmployeeProjectTaskOverview(context, projectId);
    if (!overview) return null;

    const pmTasks = await listEmployeePmTasks(context, { projectId });
    const assigneeMap = await loadTaskAssigneeDisplayMap(
      context.db,
      context.organizationId,
      pmTasks.map((task) => task.id),
    );
    const taskCards = pmTasks.map((task) =>
      mapEmployeePmTaskToCardData(task, {
        projectName: overview.displayName,
        assignees: assigneeDisplaysForTask(task.id, assigneeMap),
      }),
    );

    const tasksByStatus = new Map<string, typeof taskCards>();
    for (const task of taskCards) {
      const arr = tasksByStatus.get(task.status) ?? [];
      arr.push(task);
      tasksByStatus.set(task.status, arr);
    }

    const buckets: Bucket[] = EMPLOYEE_STATUS_BOARD_COLUMNS.map((status, index) => ({
      id: status,
      name: tTasks(`status.${status}`),
      boardId: 'employee-status-board',
      color: null,
      wipLimit: null,
      statusOnEnter: status,
      sortKey: String(index),
      tasks: tasksByStatus.get(status) ?? [],
    }));

    const canUpdate = employeeCanUpdateTaskGrant(context);
    const creatableProjects = await listEmployeePmCreatableProjects(context);
    const canCreate = creatableProjects.some((project) => project.id === projectId);

    return { overview, taskCards, buckets, canUpdate, canCreate };
  });

  if (!data) notFound();

  async function moveTaskAction(taskId: string, status: TaskStatus) {
    'use server';
    await withOrgContext(async (context) => {
      await updateEmployeePmTaskStatus(context, taskId, status);
    });
  }

  async function getTaskDetailAction(_taskId: string) {
    'use server';
    return null;
  }

  return (
    <EmployeeProjectBoardShell
      projectId={projectId}
      projectName={data.overview.displayName}
      buckets={data.buckets}
      initialTasks={data.taskCards}
      canUpdate={data.canUpdate}
      createTaskHref={
        data.canCreate ? `/employee/tasks/new?projectId=${projectId}` : null
      }
      actions={{
        moveTask: moveTaskAction,
        getTaskDetail: getTaskDetailAction,
      }}
    />
  );
}
