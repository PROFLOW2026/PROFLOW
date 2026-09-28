/**
 * Final E2E after migration 0150: backfill verify, template multi-assignee,
 * employee login, assignee edit, Hebrew task create notification path.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/demo-project-tasks-final-e2e.ts
 */
import { config } from 'dotenv';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  CONSULTANCY_DEMO_ORG_ID,
  PRIMARY_USER_EMAIL,
} from './consultancy-demo/constants.ts';

config({ path: '.env.local' });

const SEED_MARKER = 'DEMO-PTT-SEED-v1';
const DEMO_PIN = '747975';
const MULTI_TEMPLATE_TITLE = 'תיאום קבלנים';
const NEW_PROJECT_NAME = 'דמו תבניות משימות multi-assignee 2026-09-29';
const MANUAL_TASK_TITLE = 'בדיקת משימה מרובת עובדים';
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

async function columnExists(table: string, column: string): Promise<boolean> {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  const sqlClient = postgres(cs!, { prepare: false, max: 1 });
  try {
    const rows = await sqlClient<{ exists: boolean }[]>`
      select exists(
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = ${table}
          and column_name = ${column}
      ) as exists
    `;
    return rows[0]?.exists ?? false;
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

async function main(): Promise<void> {
  const ownerUserId = await resolveUserId(PRIMARY_USER_EMAIL);
  const report: Record<string, unknown> = {};

  report.migration0150Applied = (await columnExists('org_project_task_template_assignees', 'template_id'))
    ? 'PASS'
    : 'FAIL';
  report.legacyColumnRemoved = !(await columnExists('org_project_task_templates', 'default_assignee_employee_id'))
    ? 'PASS'
    : 'FAIL';

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { enrichOrgContextWithEmployeeApp } = await import(
    '../src/modules/employee-app/application/enrich-context.ts'
  );
  const { employeeLogin } = await import(
    '../src/modules/employee-app/application/employee-login.ts'
  );
  const { listOrgProjectTaskTemplatesForSettings, updateOrgProjectTaskTemplate } = await import(
    '../src/modules/tasks/application/manage-org-project-task-templates.ts'
  );
  const { createProject } = await import('../src/modules/projects/index.ts');
  const { createTask, getTaskDetail, syncTaskAssignees } = await import('../src/modules/tasks/index.ts');
  const { mapTasksToCardDataForOrg } = await import(
    '../src/modules/tasks/application/map-tasks-for-ui.ts'
  );
  const { notificationCopy } = await import('../src/modules/notifications/domain/copy.ts');
  const { notificationsCopyTranslator } = await import(
    '../src/shared/i18n/sync-namespace-translator.ts'
  );
  const {
    listEmployeePmTasks,
    getEmployeePmTaskDetail,
  } = await import('../src/modules/employee-app/application/employee-pm-tasks.ts');
  const { resolveAccessibleProjectIdsForUser } = await import(
    '../src/modules/employee-app/application/project-scope.ts'
  );
  const { findWorkspaceIdsByProject } = await import(
    '../src/modules/workspaces/data/workspaces.repository.ts'
  );
  const {
    employeeAppAccounts,
    employees,
    orgProjectTaskTemplateAssignees,
    projects,
    tasks,
    taskAssignees,
  } = await import('@drizzle/schema');

  let multiTemplateTaskId: string | null = null;
  let newProjectId: string | null = null;
  const employeeAccounts: Array<{ username: string; userId: string; employeeId: string; name: string }> =
    [];

  await withUserContext(ownerUserId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: ownerUserId,
      organizationId: CONSULTANCY_DEMO_ORG_ID,
      locale: 'he-IL',
    });

    // Backfill verify
    const templates = await listOrgProjectTaskTemplatesForSettings(context, { includeArchived: false });
    const seedTemplates = templates.filter((t) => t.description?.includes(SEED_MARKER));
    report.permanentTemplateCount = seedTemplates.length;
    report.assignedTemplateCount = seedTemplates.filter(
      (t) => t.defaultAssigneeEmployeeIds.length > 0,
    ).length;
    report.unassignedTemplateCount = seedTemplates.filter(
      (t) => t.defaultAssigneeEmployeeIds.length === 0,
    ).length;

    const junctionRows = await tx
      .select()
      .from(orgProjectTaskTemplateAssignees)
      .where(eq(orgProjectTaskTemplateAssignees.organizationId, CONSULTANCY_DEMO_ORG_ID));
    report.templateAssigneeJunctionCount = junctionRows.length;
    report.backfillPreservedSix =
      report.assignedTemplateCount === 6 && (report.templateAssigneeJunctionCount as number) >= 6
        ? 'PASS'
        : 'FAIL';

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
      if (!account?.employeeId || !account.userId) throw new Error(`Missing account ${username}`);
      const [employee] = await tx
        .select({ name: employees.name })
        .from(employees)
        .where(eq(employees.id, account.employeeId))
        .limit(1);
      employeeAccounts.push({
        username,
        userId: account.userId,
        employeeId: account.employeeId,
        name: employee?.name ?? username,
      });
    }

    const multiTemplate = seedTemplates.find((t) => t.title === MULTI_TEMPLATE_TITLE);
    if (!multiTemplate) throw new Error(`Template not found: ${MULTI_TEMPLATE_TITLE}`);

    await updateOrgProjectTaskTemplate(context, multiTemplate.id, {
      title: multiTemplate.title,
      description: multiTemplate.description,
      defaultAssigneeEmployeeIds: employeeAccounts.map((a) => a.employeeId),
      applyScope: 'future_only',
    });
    report.multiAssigneeTemplate = MULTI_TEMPLATE_TITLE;
    report.multiAssigneeTemplateAssignees = employeeAccounts.map((a) => a.name);

    const [existingProject] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, CONSULTANCY_DEMO_ORG_ID),
          eq(projects.name, NEW_PROJECT_NAME),
          isNull(projects.archivedAt),
        ),
      )
      .limit(1);

    if (existingProject) {
      newProjectId = existingProject.id;
      report.newDemoProjectCreated = false;
    } else {
      const created = await createProject(context, { name: NEW_PROJECT_NAME, workKind: 'project' });
      newProjectId = created.projectId;
      report.newDemoProjectCreated = true;
    }
    report.newDemoProject = NEW_PROJECT_NAME;
    report.newDemoProjectId = newProjectId;

    const generatedTasks = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, CONSULTANCY_DEMO_ORG_ID),
          eq(tasks.projectId, newProjectId!),
          sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
          isNull(tasks.archivedAt),
        ),
      );
    report.generatedTaskCount = generatedTasks.length;

    const dupes = await tx
      .select({
        templateId: tasks.generatedFromOrgProjectTaskTemplateId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, newProjectId!),
          sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
        ),
      )
      .groupBy(tasks.generatedFromOrgProjectTaskTemplateId);
    report.duplicateGeneratedTasks = dupes.filter((r) => r.cnt > 1).length;

    const multiGenerated = generatedTasks.find(
      (t) => t.generatedFromOrgProjectTaskTemplateId === multiTemplate.id,
    );
    if (!multiGenerated) throw new Error('Multi-assignee generated task missing');
    multiTemplateTaskId = multiGenerated.id;

    const multiAssignees = await tx
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, multiTemplateTaskId));
    report.multiAssigneeGeneratedTaskCount = 1;
    report.multiAssigneeGeneratedTaskAssignees = multiAssignees.length;
    report.multiAssigneeProvenance = multiGenerated.generatedFromOrgProjectTaskTemplateId;

    const cards = await mapTasksToCardDataForOrg(context, [multiGenerated]);
    report.multiAssigneeTaskNamesInTable = cards[0]?.assignees.map((a) => a.displayName) ?? [];

    // Hebrew notification copy (no throw)
    const heCopy = notificationCopy(
      notificationsCopyTranslator('he-IL'),
      'task_assigned_to_you',
      { reference: 'משימת בדיקה' },
    );
    report.hebrewAssignmentNotification =
      heCopy.body.length > 0 && /[\u0590-\u05FF]/.test(heCopy.body) ? 'PASS' : 'FAIL';

    // Hebrew locale task create with assignee (notification path)
    const workspaceIds = await findWorkspaceIdsByProject(tx, newProjectId!);
    try {
      await createTask(context, {
        workspaceId: workspaceIds[0]!,
        projectId: newProjectId!,
        title: 'משימת בדיקה he-IL',
        assigneeKeys: [`e:${employeeAccounts[0]!.employeeId}`],
      });
      report.hebrewTaskCreate = 'PASS';
    } catch (error) {
      report.hebrewTaskCreate = 'FAIL';
      report.hebrewTaskCreateError = error instanceof Error ? error.message : String(error);
    }

    // Assignee edit on shared multi-assignee task
    const allIds = employeeAccounts.map((a) => a.employeeId);
    await syncTaskAssignees(context, multiTemplateTaskId, {
      assigneeKeys: allIds.slice(0, 2).map((id) => `e:${id}`),
    });
    const afterRemove = await tx
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, multiTemplateTaskId));
    report.ownerRemoveOneAssignee = afterRemove.length === 2 ? 'PASS' : 'FAIL';
    report.otherAssigneesPreserved =
      afterRemove.length === 2 &&
      afterRemove.every((row) => allIds.slice(0, 2).includes(row.employeeId!))
        ? 'PASS'
        : 'FAIL';

    await syncTaskAssignees(context, multiTemplateTaskId, {
      assigneeKeys: allIds.map((id) => `e:${id}`),
    });
    const afterRestore = await tx
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, multiTemplateTaskId));
    report.ownerAddAssigneeBack = afterRestore.length === 3 ? 'PASS' : 'FAIL';
    report.noDuplicateAssignment = afterRestore.length === 3 ? 'PASS' : 'FAIL';

    const ownerDetail = await getTaskDetail(context, multiTemplateTaskId);
    report.ownerOpenEdit = ownerDetail != null ? 'PASS' : 'FAIL';
    report.ownerAssigneeNames = ownerDetail?.assignees?.map((a) => a.displayName) ?? [];
  });

  report.employeeChecks = {};
  for (const account of employeeAccounts) {
    const row: Record<string, unknown> = {};
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
      row.project =
        accessible === null || (newProjectId && accessible.includes(newProjectId)) ? 'PASS' : 'FAIL';

      if (newProjectId) {
        const pmTasks = await listEmployeePmTasks(ctx, { projectId: newProjectId });
        row.seesSharedTask =
          multiTemplateTaskId && pmTasks.some((t) => t.id === multiTemplateTaskId) ? 'PASS' : 'FAIL';
      }

      if (multiTemplateTaskId) {
        const detail = await getEmployeePmTaskDetail(ctx, multiTemplateTaskId);
        row.openTask = detail != null ? 'PASS' : 'FAIL';
        row.assigneeCount = detail?.assignees?.length ?? 0;
        row.assigneeNames = detail?.assignees?.map((a) => a.displayName) ?? [];
        row.commentsAvailable = detail?.comments != null ? 'PASS' : 'FAIL';
      }
    });

    (report.employeeChecks as Record<string, unknown>)[account.username] = row;
  }

  // Manual multi-assignee task check
  await withUserContext(ownerUserId, async (tx) => {
    const [manual] = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.organizationId, CONSULTANCY_DEMO_ORG_ID),
          eq(tasks.title, MANUAL_TASK_TITLE),
          isNull(tasks.archivedAt),
        ),
      )
      .limit(1);
    if (manual) {
      const rows = await tx
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, manual.id));
      report.manualMultiAssigneeTask = {
        exists: true,
        assigneeCount: rows.length,
      };
    }
  });

  report.dualSourceOfTruth = 'NO';
  report.push = 'NO';
  report.deploy = 'NO';

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
