/**
 * Demo E2E: manual multi-assignee project task on leokid consultancy org.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/demo-project-tasks-multi-assignee-e2e.ts
 */
import { config } from 'dotenv';
import { and, eq } from 'drizzle-orm';
import {
  CONSULTANCY_DEMO_ORG_ID,
  PRIMARY_USER_EMAIL,
} from './consultancy-demo/constants.ts';

config({ path: '.env.local' });

const DEMO_PROJECT_ID = 'b8bf7f51-c19b-44b9-b0a9-61fc1dc2b3f8';
const DEMO_PIN = '747975';
const TASK_TITLE = 'בדיקת משימה מרובת עובדים';
const ASSIGNEE_USERNAMES = ['OFEK-URI', 'OFEK-ROEI', 'OFEK-MICHAL'] as const;

async function resolveUserId(email: string): Promise<string> {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  const sqlClient = postgres(cs!, { prepare: false, max: 1 });
  try {
    const [row] = await sqlClient<{ id: string }[]>`
      select id from profiles where lower(email) = lower(${email}) limit 1
    `;
    if (!row) throw new Error(`No profile for ${email}`);
    return row.id;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const ownerUserId = await resolveUserId(PRIMARY_USER_EMAIL);
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { enrichOrgContextWithEmployeeApp } = await import(
    '../src/modules/employee-app/application/enrich-context.ts'
  );
  const { employeeLogin } = await import(
    '../src/modules/employee-app/application/employee-login.ts'
  );
  const { createTask, getTaskDetail, syncTaskAssignees } = await import('../src/modules/tasks/index.ts');
  const { mapTasksToCardDataForOrg } = await import(
    '../src/modules/tasks/application/map-tasks-for-ui.ts'
  );
  const { listEmployeePmTasks, getEmployeePmTaskDetail } = await import(
    '../src/modules/employee-app/application/employee-pm-tasks.ts'
  );
  const { resolveAccessibleProjectIdsForUser } = await import(
    '../src/modules/employee-app/application/project-scope.ts'
  );
  const { findWorkspaceIdsByProject } = await import(
    '../src/modules/workspaces/data/workspaces.repository.ts'
  );
  const {
    employeeAppAccounts,
    tasks,
    taskAssignees,
  } = await import('@drizzle/schema');

  const report: Record<string, unknown> = {
    organizationId: CONSULTANCY_DEMO_ORG_ID,
    projectId: DEMO_PROJECT_ID,
    taskTitle: TASK_TITLE,
  };

  let taskId: string | null = null;
  const employeeAccounts: Array<{ username: string; userId: string; employeeId: string }> = [];

  await withUserContext(ownerUserId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: ownerUserId,
      organizationId: CONSULTANCY_DEMO_ORG_ID,
      locale: 'en',
    });

    for (const username of ASSIGNEE_USERNAMES) {
      const [account] = await tx
        .select({
          userId: employeeAppAccounts.userId,
          employeeId: employeeAppAccounts.employeeId,
        })
        .from(employeeAppAccounts)
        .where(
          and(
            eq(employeeAppAccounts.organizationId, CONSULTANCY_DEMO_ORG_ID),
            eq(employeeAppAccounts.username, username),
          ),
        )
        .limit(1);
      if (!account?.employeeId || !account.userId) throw new Error(`Missing employee account ${username}`);
      employeeAccounts.push({ username, userId: account.userId, employeeId: account.employeeId });
    }

    const assigneeEmployeeIds = employeeAccounts.map((row) => row.employeeId);

    const [existing] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, CONSULTANCY_DEMO_ORG_ID),
          eq(tasks.projectId, DEMO_PROJECT_ID),
          eq(tasks.title, TASK_TITLE),
        ),
      )
      .limit(1);

    const workspaceIds = await findWorkspaceIdsByProject(tx, DEMO_PROJECT_ID);
    const workspaceId = workspaceIds[0];
    if (!workspaceId) throw new Error('Missing workspace for demo project');

    if (existing) {
      taskId = existing.id;
      await syncTaskAssignees(context, taskId, {
        assigneeKeys: assigneeEmployeeIds.map((id) => `e:${id}`),
      });
      report.taskCreated = false;
      report.taskReused = true;
    } else {
      const task = await createTask(context, {
        workspaceId,
        projectId: DEMO_PROJECT_ID,
        title: TASK_TITLE,
        description: 'Demo manual multi-assignee task',
        assigneeKeys: assigneeEmployeeIds.map((id) => `e:${id}`),
      });
      taskId = task.id;
      report.taskCreated = true;
    }

    const assigneeRows = await tx
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, taskId!));
    report.assigneeCount = assigneeRows.length;
    report.assigneeEmployeeIds = assigneeRows.map((row) => row.employeeId);

    const [taskRow] = await tx.select().from(tasks).where(eq(tasks.id, taskId!)).limit(1);
    const cards = await mapTasksToCardDataForOrg(context, [taskRow!]);
    report.assigneeNames = cards[0]?.assignees.map((row) => row.displayName) ?? [];

    const detail = await getTaskDetail(context, taskId!);
    report.ownerOpenDetail = detail != null ? 'PASS' : 'FAIL';
    report.ownerEditReady = detail != null ? 'PASS' : 'FAIL';

    const duplicateCount = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, CONSULTANCY_DEMO_ORG_ID),
          eq(tasks.projectId, DEMO_PROJECT_ID),
          eq(tasks.title, TASK_TITLE),
        ),
      );
    report.duplicateTaskCount = duplicateCount.length;
    report.singleCanonicalTask = duplicateCount.length === 1 ? 'PASS' : 'FAIL';
  });

  report.employeeChecks = {};
  for (const account of employeeAccounts) {
    const row: Record<string, unknown> = { username: account.username };

    try {
      await employeeLogin({ username: account.username, pin: DEMO_PIN });
      row.login = 'PASS';
    } catch (error) {
      row.login = 'FAIL';
      row.error = error instanceof Error ? error.message : String(error);
      (report.employeeChecks as Record<string, unknown>)[account.username] = row;
      continue;
    }

    await withUserContext(account.userId, async (tx) => {
      const base = await resolveOrgContext(tx, {
        userId: account.userId,
        organizationId: CONSULTANCY_DEMO_ORG_ID,
        locale: 'he-IL',
      });
      const ctx = await enrichOrgContextWithEmployeeApp(base);

      const accessible = await resolveAccessibleProjectIdsForUser(ctx);
      row.projectAccessible =
        accessible === null || accessible.includes(DEMO_PROJECT_ID) ? 'PASS' : 'FAIL';

      const pmTasks = await listEmployeePmTasks(ctx, { projectId: DEMO_PROJECT_ID });
      row.seesSharedTask = pmTasks.some((task) => task.id === taskId) ? 'PASS' : 'FAIL';

      if (taskId) {
        const detail = await getEmployeePmTaskDetail(ctx, taskId);
        row.openDetail = detail != null ? 'PASS' : 'FAIL';
        row.sharedAssigneeCount = detail?.assignees?.length ?? 0;
      }
    });

    (report.employeeChecks as Record<string, unknown>)[account.username] = row;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
