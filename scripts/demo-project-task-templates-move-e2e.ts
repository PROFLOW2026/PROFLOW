/**
 * Move project-task-template demo E2E from mthsystems contractor org
 * to leokid2026 consultancy org. Cleans previous demo data only.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/demo-project-task-templates-move-e2e.ts
 */
import { config } from 'dotenv';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  CONTRACTOR_DEMO_ORG_ID,
  CONSULTANCY_DEMO_ORG_ID,
  CONSULTANCY_ORG_NAME,
  PRIMARY_USER_EMAIL,
  SECONDARY_USER_EMAIL,
} from './consultancy-demo/constants.ts';

config({ path: '.env.local' });

const SEED_MARKER = 'DEMO-PTT-SEED-v1';
const PROJECT_NAME_PREFIX = 'דמו תבניות משימות 2026-09-29';
const DEMO_PIN = '747975';

const OFEK_USERNAMES = [
  'OFEK-URI',
  'OFEK-YAEL',
  'OFEK-ROEI',
  'OFEK-DANIEL',
  'OFEK-NOA',
  'OFEK-MICHAL',
] as const;

const TEMPLATE_SPECS = [
  { title: 'פתיחת תיק פרויקט', description: 'יצירת תיק פרויקט ראשוני', assigneeUsername: null },
  { title: 'איסוף מסמכי לקוח', description: 'איסוף חוזים ותוכניות', assigneeUsername: 'OFEK-URI' },
  { title: 'בדיקת תוכניות', description: 'סקירת תוכניות אדריכלות', assigneeUsername: 'OFEK-YAEL' },
  { title: 'תיאום קבלנים', description: 'תיאום ראשוני עם קבלנים', assigneeUsername: 'OFEK-ROEI' },
  { title: 'הזמנת חומרים', description: 'הזמנת חומרים לפתיחת עבודה', assigneeUsername: 'OFEK-DANIEL' },
  { title: 'פתיחת מסמכי הנהלה', description: 'הקמת תיק הנהלת חשבונות', assigneeUsername: 'OFEK-NOA' },
  { title: 'סיור אתר ראשון', description: 'סיור אתר עם הלקוח', assigneeUsername: 'OFEK-MICHAL' },
  { title: 'הגדרת לוח זמנים', description: 'טיוטת לוח זמנים ראשוני', assigneeUsername: null },
  { title: 'הקמת לוח משימות', description: 'הקמת לוח עבודה בפרויקט', assigneeUsername: null },
  { title: 'דיווח פתיחה ללקוח', description: 'מייל פתיחה ללקוח', assigneeUsername: null },
] as const;

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
    await sqlClient.end();
  }
}

async function main(): Promise<void> {
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { enrichOrgContextWithEmployeeApp } = await import(
    '../src/modules/employee-app/application/enrich-context.ts'
  );
  const {
    orgProjectTaskTemplates,
    projects,
    tasks,
    taskAssignees,
    taskActivity,
    employeeAppAccounts,
    employees,
  } = await import('@drizzle/schema');

  const mthUserId = await resolveUserId(SECONDARY_USER_EMAIL);
  const leokidUserId = await resolveUserId(PRIMARY_USER_EMAIL);

  const report: Record<string, unknown> = {};

  // ── 1. Clean previous mthsystems demo data ────────────────────────────────
  const cleanup: Record<string, unknown> = {};
  await withUserContext(mthUserId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: mthUserId,
      organizationId: CONTRACTOR_DEMO_ORG_ID,
      locale: 'he-IL',
    });

    const { archiveProject } = await import('../src/modules/projects/index.ts');
    const { archiveOrgProjectTaskTemplate } = await import(
      '../src/modules/tasks/application/manage-org-project-task-templates.ts'
    );

    const oldProjects = await tx
      .select({ id: projects.id, name: projects.name, archivedAt: projects.archivedAt })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, CONTRACTOR_DEMO_ORG_ID),
          sql`${projects.name} LIKE ${PROJECT_NAME_PREFIX + '%'}`,
        ),
      );

    const archivedProjects: string[] = [];
    for (const project of oldProjects) {
      if (project.archivedAt) {
        archivedProjects.push(`${project.name} (already archived)`);
        continue;
      }
      await archiveProject(context, { projectId: project.id });
      archivedProjects.push(project.name);
    }
    cleanup.archivedProjects = archivedProjects;

    const oldTemplates = await tx
      .select({ id: orgProjectTaskTemplates.id, title: orgProjectTaskTemplates.title, isArchived: orgProjectTaskTemplates.isArchived })
      .from(orgProjectTaskTemplates)
      .where(
        and(
          eq(orgProjectTaskTemplates.organizationId, CONTRACTOR_DEMO_ORG_ID),
          sql`${orgProjectTaskTemplates.description} LIKE ${'%' + SEED_MARKER + '%'}`,
        ),
      );

    const archivedTemplates: string[] = [];
    for (const template of oldTemplates) {
      if (template.isArchived) {
        archivedTemplates.push(`${template.title} (already archived)`);
        continue;
      }
      await archiveOrgProjectTaskTemplate(context, template.id);
      archivedTemplates.push(template.title);
    }
    cleanup.archivedTemplates = archivedTemplates;
  });

  report.previousMthsystemsCleanup = cleanup;

  // ── 2. Setup leokid consultancy org ─────────────────────────────────────
  const setup: Record<string, unknown> = {
    account: PRIMARY_USER_EMAIL,
    organizationId: CONSULTANCY_DEMO_ORG_ID,
    organizationName: CONSULTANCY_ORG_NAME,
  };

  let createdProjects: { id: string; name: string }[] = [];
  let accountsByUsername = new Map<
    string,
    { username: string; employeeId: string; userId: string; status: string; employeeName: string }
  >();

  await withUserContext(leokidUserId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: leokidUserId,
      organizationId: CONSULTANCY_DEMO_ORG_ID,
      locale: 'he-IL',
    });

    const accounts = await tx
      .select({
        username: employeeAppAccounts.username,
        employeeId: employeeAppAccounts.employeeId,
        userId: employeeAppAccounts.userId,
        status: employeeAppAccounts.status,
        employeeName: employees.name,
      })
      .from(employeeAppAccounts)
      .innerJoin(employees, eq(employees.id, employeeAppAccounts.employeeId))
      .where(eq(employeeAppAccounts.organizationId, CONSULTANCY_DEMO_ORG_ID));

    accountsByUsername = new Map(accounts.map((a) => [a.username.toUpperCase(), a]));
    setup.confirmedEmployeeAccounts = OFEK_USERNAMES.map((u) => ({
      username: u,
      found: accountsByUsername.has(u),
      employeeName: accountsByUsername.get(u)?.employeeName ?? null,
      status: accountsByUsername.get(u)?.status ?? null,
    }));

    for (const u of OFEK_USERNAMES) {
      if (!accountsByUsername.has(u)) throw new Error(`Missing employee account ${u}`);
    }

    const { createOrgProjectTaskTemplate, listOrgProjectTaskTemplatesForSettings } =
      await import('../src/modules/tasks/application/manage-org-project-task-templates.ts');

    const existingTemplates = await tx
      .select()
      .from(orgProjectTaskTemplates)
      .where(
        and(
          eq(orgProjectTaskTemplates.organizationId, CONSULTANCY_DEMO_ORG_ID),
          sql`${orgProjectTaskTemplates.description} LIKE ${'%' + SEED_MARKER + '%'}`,
          eq(orgProjectTaskTemplates.isArchived, false),
        ),
      );

    if (existingTemplates.length < 10) {
      for (const spec of TEMPLATE_SPECS) {
        const already = existingTemplates.find((row) => row.title === spec.title);
        if (already) continue;

        const assignee = spec.assigneeUsername
          ? accountsByUsername.get(spec.assigneeUsername)?.employeeId ?? null
          : null;

        await createOrgProjectTaskTemplate(context, {
          title: spec.title,
          description: `${spec.description} [${SEED_MARKER}]`,
          defaultAssigneeEmployeeId: assignee,
        });
      }
    }

    const templates = await listOrgProjectTaskTemplatesForSettings(context, { includeArchived: false });
    const seedTemplates = templates.filter((t) => t.description?.includes(SEED_MARKER));
    const activeSeedTemplates = seedTemplates.filter((t) => t.isEnabled);

    setup.templateCount = activeSeedTemplates.length;
    setup.assignedTemplateCount = activeSeedTemplates.filter((t) => t.defaultAssigneeEmployeeId).length;
    setup.unassignedTemplateCount = activeSeedTemplates.filter((t) => !t.defaultAssigneeEmployeeId).length;
    setup.assignees = activeSeedTemplates
      .filter((t) => t.defaultAssigneeEmployeeId)
      .map((t) => {
        const account = accounts.find((a) => a.employeeId === t.defaultAssigneeEmployeeId);
        return { templateTitle: t.title, username: account?.username, employeeName: account?.employeeName };
      });

    const { createProject } = await import('../src/modules/projects/index.ts');
    const projectNames = [
      `${PROJECT_NAME_PREFIX} — 1`,
      `${PROJECT_NAME_PREFIX} — 2`,
      `${PROJECT_NAME_PREFIX} — 3`,
    ];

    for (const name of projectNames) {
      const [existingProject] = await tx
        .select({ id: projects.id, name: projects.name, archivedAt: projects.archivedAt })
        .from(projects)
        .where(
          and(
            eq(projects.organizationId, CONSULTANCY_DEMO_ORG_ID),
            eq(projects.name, name),
            isNull(projects.archivedAt),
          ),
        )
        .limit(1);

      if (existingProject) {
        createdProjects.push({ id: existingProject.id, name });
        continue;
      }

      const result = await createProject(context, { name, workKind: 'project' });
      createdProjects.push({ id: result.projectId, name });
    }
    setup.demoProjects = createdProjects;

    const projectDetails: Record<string, unknown> = {};
    for (const project of createdProjects) {
      const projectTasks = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, CONSULTANCY_DEMO_ORG_ID),
            eq(tasks.projectId, project.id),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
            isNull(tasks.archivedAt),
          ),
        );

      const assigneeRows = await tx
        .select({ taskId: taskAssignees.taskId, employeeId: taskAssignees.employeeId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.organizationId, CONSULTANCY_DEMO_ORG_ID),
            inArray(
              taskAssignees.taskId,
              projectTasks.map((t) => t.id),
            ),
          ),
        );

      const duplicateCheck = await tx
        .select({
          templateId: tasks.generatedFromOrgProjectTaskTemplateId,
          cnt: sql<number>`count(*)::int`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, project.id),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
          ),
        )
        .groupBy(tasks.generatedFromOrgProjectTaskTemplateId);

      projectDetails[project.name] = {
        taskCount: projectTasks.length,
        assignedTaskCount: assigneeRows.length,
        distinctAssignees: [...new Set(assigneeRows.map((r) => r.employeeId))].length,
        duplicates: duplicateCheck.filter((r) => r.cnt > 1).length,
        provenancePresent: projectTasks.every((t) => t.generatedFromOrgProjectTaskTemplateId),
      };
    }
    setup.projectDetails = projectDetails;
  });

  // ── 3. Employee login E2E (after owner transaction commits) ─────────────
  const { employeeLogin } = await import(
    '../src/modules/employee-app/application/employee-login.ts'
  );
  const {
    listEmployeePmTasks,
    getEmployeePmTaskDetail,
    assertEmployeePmTaskReadAccess,
  } = await import('../src/modules/employee-app/application/employee-pm-tasks.ts');
  const { resolveAccessibleProjectIdsForUser } = await import(
    '../src/modules/employee-app/application/project-scope.ts'
  );
  const { employeePermissionScope } = await import(
    '../src/modules/employee-app/application/load-employee-app-context.ts'
  );
  const { PERMISSIONS } = await import('../src/shared/permissions/catalog.ts');

  const sampleProjectId = createdProjects[0]!.id;
  const employeeResults: Record<string, unknown>[] = [];

  for (const username of OFEK_USERNAMES) {
    const account = accountsByUsername.get(username)!;
    const result: Record<string, unknown> = { username, employeeName: account.employeeName };

    try {
      const login = await employeeLogin({ username, pin: DEMO_PIN });
      result.login = 'PASS';
      result.pinMustChange = login.pinMustChange;
    } catch (error) {
      result.login = 'FAIL';
      result.loginError = error instanceof Error ? error.message : String(error);
      employeeResults.push(result);
      continue;
    }

    await withUserContext(account.userId, async (empTx) => {
      const [assignedTask] = await empTx
        .select({
          taskId: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
        })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .where(
          and(
            eq(taskAssignees.employeeId, account.employeeId),
            eq(tasks.projectId, sampleProjectId),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
            isNull(tasks.archivedAt),
          ),
        )
        .limit(1);

      result.assignedTaskInDb = assignedTask ?? null;

      const base = await resolveOrgContext(empTx, {
        userId: account.userId,
        organizationId: CONSULTANCY_DEMO_ORG_ID,
        locale: 'he-IL',
      });
      const empContext = await enrichOrgContextWithEmployeeApp(base);

      result.tasksReadScope = employeePermissionScope(empContext, PERMISSIONS.TASKS_READ);
      result.projectsReadScope = employeePermissionScope(empContext, PERMISSIONS.PROJECTS_READ);

      const accessibleProjects = await resolveAccessibleProjectIdsForUser(empContext);
      result.canSeeProject =
        accessibleProjects === null || accessibleProjects.includes(sampleProjectId);

      const pmTasks = await listEmployeePmTasks(empContext, { projectId: sampleProjectId });
      result.pmTaskCount = pmTasks.length;

      if (assignedTask) {
        result.canSeeAssignedTask = pmTasks.some((t) => t.id === assignedTask.taskId);
        try {
          await assertEmployeePmTaskReadAccess(empContext, assignedTask.taskId);
          const detail = await getEmployeePmTaskDetail(empContext, assignedTask.taskId);
          result.taskOpen = 'PASS';
          result.taskTitleMatches = detail.title === assignedTask.title;
          result.projectContextCorrect = detail.projectId === sampleProjectId;
          result.commentCount = detail.comments.length;

          const activityRows = await empTx
            .select({ id: taskActivity.id, eventType: taskActivity.eventType })
            .from(taskActivity)
            .where(eq(taskActivity.taskId, assignedTask.taskId));
          result.activityCount = activityRows.length;
          result.activityTypes = activityRows.map((r) => r.eventType);
        } catch (error) {
          result.taskOpen = 'FAIL';
          result.taskOpenError = error instanceof Error ? error.message : String(error);
        }
      } else {
        result.canSeeAssignedTask = false;
        result.taskOpen = 'N/A';
      }
    });

    employeeResults.push(result);
  }

  setup.employeeLoginE2E = employeeResults;
  report.correctAccountSetup = setup;

  console.log('\n=== MOVE E2E REPORT ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
