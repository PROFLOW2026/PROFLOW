/**
 * Employee-side visibility E2E for demo org project task templates.
 * Maps login-capable employees and verifies canonical employee-app access.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/demo-employee-visibility-e2e.ts
 */
import { config } from 'dotenv';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

config({ path: '.env.local' });

const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';
const SEED_MARKER = 'DEMO-PTT-SEED-v1';
const PROJECT_NAME_PREFIX = 'דמו תבניות משימות 2026-09-29';

interface DemoTarget {
  userId: string;
  organizationId: string;
  organizationName: string;
}

async function resolveDemoTarget(): Promise<DemoTarget> {
  const postgres = (await import('postgres')).default;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');

  const sqlClient = postgres(connectionString, { prepare: false, max: 1 });
  try {
    const profiles = await sqlClient<{ id: string; email: string }[]>`
      select id, email from public.profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    const profile = profiles[0];
    if (!profile) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);

    const memberships = await sqlClient<{ org_id: string; org_name: string }[]>`
      select o.id as org_id, o.name as org_name
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = ${profile.id}
      order by o.name
    `;

    const demoCandidates = memberships.filter((row) => row.org_name !== EXCLUDED_ORG_NAME);
    if (demoCandidates.length === 0) throw new Error('No demo org');

    const prefs = await sqlClient<{ active_organization_id: string | null }[]>`
      select active_organization_id from public.user_preferences where user_id = ${profile.id} limit 1
    `;
    const activeOrgId = prefs[0]?.active_organization_id ?? null;
    const selected =
      demoCandidates.find((row) => row.org_id === activeOrgId) ??
      (demoCandidates.length === 1 ? demoCandidates[0]! : null);

    if (!selected) {
      throw new Error(
        `Ambiguous demo org: ${demoCandidates.map((r) => r.org_name).join(', ')}`,
      );
    }

    return {
      userId: profile.id,
      organizationId: selected.org_id,
      organizationName: selected.org_name,
    };
  } finally {
    await sqlClient.end();
  }
}

async function main(): Promise<void> {
  const target = await resolveDemoTarget();
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { enrichOrgContextWithEmployeeApp } = await import(
    '../src/modules/employee-app/application/enrich-context.ts'
  );
  const {
    employees,
    employeeAppAccounts,
    employeePermissionGrants,
    orgProjectTaskTemplates,
    projects,
    tasks,
    taskAssignees,
    taskActivity,
  } = await import('@drizzle/schema');
  const { isActiveEmployeeAppAccount } = await import(
    '../src/modules/employee-app/application/load-employee-app-context.ts'
  );
  const { PERMISSIONS } = await import('../src/shared/permissions/catalog.ts');
  const { employeePermissionScope } = await import(
    '../src/modules/employee-app/application/load-employee-app-context.ts'
  );
  const {
    resolveAccessibleProjectIdsForUser,
    resolveAccessibleProjectIdsForEmployeePermission,
  } = await import('../src/modules/employee-app/application/project-scope.ts');
  const {
    listEmployeePmTasks,
    getEmployeePmTaskDetail,
    getEmployeeProjectTaskOverview,
    assertEmployeePmTaskReadAccess,
  } = await import('../src/modules/employee-app/application/employee-pm-tasks.ts');
  const { employeeLogin } = await import(
    '../src/modules/employee-app/application/employee-login.ts'
  );
  const { openTemporaryPinSealed } = await import(
    '../src/modules/employee-app/domain/temporary-pin-seal.ts'
  );

  const report: Record<string, unknown> = {
    demoAccount: DEMO_USER_EMAIL,
    organizationId: target.organizationId,
    organizationName: target.organizationName,
  };

  await withUserContext(target.userId, async (tx) => {
    const ownerContext = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: target.organizationId,
      locale: 'he-IL',
    });

    const demoProjects = await tx
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, target.organizationId),
          sql`${projects.name} LIKE ${PROJECT_NAME_PREFIX + '%'}`,
          isNull(projects.archivedAt),
        ),
      )
      .orderBy(projects.name);

    report.demoProjects = demoProjects;

    const sampleProjectId = demoProjects[0]?.id ?? null;

    const allEmployees = await tx
      .select({
        id: employees.id,
        name: employees.name,
        userId: employees.userId,
        status: employees.status,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, target.organizationId),
          eq(employees.status, 'active'),
          isNull(employees.archivedAt),
        ),
      )
      .orderBy(employees.name);

    const accounts = await tx
      .select()
      .from(employeeAppAccounts)
      .where(eq(employeeAppAccounts.organizationId, target.organizationId));

    const employeeAccountMap = new Map(accounts.map((a) => [a.employeeId, a]));

    const loginCapable: Array<{
      employeeId: string;
      employeeName: string;
      userId: string;
      username: string;
      status: string;
      pinMustChange: boolean;
      hasSealedPin: boolean;
      tasksReadScope: string | null;
      projectsReadScope: string | null;
    }> = [];

    for (const emp of allEmployees) {
      const account = employeeAccountMap.get(emp.id);
      if (!account) continue;
      if (!isActiveEmployeeAppAccount(account)) continue;

      const grants = await tx
        .select()
        .from(employeePermissionGrants)
        .where(
          and(
            eq(employeePermissionGrants.organizationId, target.organizationId),
            eq(employeePermissionGrants.employeeId, emp.id),
            eq(employeePermissionGrants.granted, true),
          ),
        );

      const grantMap = new Map(grants.map((g) => [g.permissionKey, g]));

      loginCapable.push({
        employeeId: emp.id,
        employeeName: emp.name,
        userId: account.userId,
        username: account.username,
        status: account.status,
        pinMustChange: account.pinMustChange,
        hasSealedPin: Boolean(account.temporaryPinSealed),
        tasksReadScope: grantMap.get(PERMISSIONS.TASKS_READ)?.scope ?? null,
        projectsReadScope: grantMap.get(PERMISSIONS.PROJECTS_READ)?.scope ?? null,
      });
    }

    report.loginCapableDemoEmployees = loginCapable.length;
    report.loginCapableEmployeeDetails = loginCapable;

    const seedTemplates = await tx
      .select()
      .from(orgProjectTaskTemplates)
      .where(
        and(
          eq(orgProjectTaskTemplates.organizationId, target.organizationId),
          sql`${orgProjectTaskTemplates.description} LIKE ${'%' + SEED_MARKER + '%'}`,
          eq(orgProjectTaskTemplates.isArchived, false),
          eq(orgProjectTaskTemplates.isEnabled, true),
        ),
      )
      .orderBy(orgProjectTaskTemplates.position);

    report.templateCount = seedTemplates.length;
    report.assignedTemplateCount = seedTemplates.filter((t) => t.defaultAssigneeEmployeeId).length;
    report.currentAssignees = seedTemplates
      .filter((t) => t.defaultAssigneeEmployeeId)
      .map((t) => ({
        templateTitle: t.title,
        employeeId: t.defaultAssigneeEmployeeId,
        employeeName: allEmployees.find((e) => e.id === t.defaultAssigneeEmployeeId)?.name ?? null,
        hasLoginAccount: loginCapable.some((e) => e.employeeId === t.defaultAssigneeEmployeeId),
      }));

    const loginCapableIds = new Set(loginCapable.map((e) => e.employeeId));
    const assignedTemplates = seedTemplates.filter((t) => t.defaultAssigneeEmployeeId);
    const assignedWithoutLogin = assignedTemplates.filter(
      (t) => !loginCapableIds.has(t.defaultAssigneeEmployeeId!),
    );

    const { updateOrgProjectTaskTemplate } = await import(
      '../src/modules/tasks/application/manage-org-project-task-templates.ts'
    );

    if (assignedWithoutLogin.length > 0 && loginCapable.length >= 6) {
      const swapPool = loginCapable.filter(
        (e) => !assignedTemplates.some((t) => t.defaultAssigneeEmployeeId === e.employeeId),
      );
      const needed = assignedWithoutLogin.length;
      if (swapPool.length >= needed) {
        for (let i = 0; i < needed; i++) {
          const template = assignedWithoutLogin[i]!;
          const newAssignee = swapPool[i]!;
          await updateOrgProjectTaskTemplate(ownerContext, template.id, {
            title: template.title,
            description: template.description,
            defaultAssigneeEmployeeId: newAssignee.employeeId,
          });
        }
        report.assigneeSwapPerformed = true;
        report.assigneeSwaps = assignedWithoutLogin.slice(0, needed).map((t, i) => ({
          templateTitle: t.title,
          fromEmployeeId: t.defaultAssigneeEmployeeId,
          toEmployeeId: swapPool[i]!.employeeId,
          toEmployeeName: swapPool[i]!.employeeName,
        }));
      } else {
        report.assigneeSwapPerformed = false;
        report.assigneeSwapNote = `Need ${needed} login-capable swaps, only ${swapPool.length} available without overlap`;
      }
    } else {
      report.assigneeSwapPerformed = false;
    }

    const refreshedTemplates = await tx
      .select()
      .from(orgProjectTaskTemplates)
      .where(
        and(
          eq(orgProjectTaskTemplates.organizationId, target.organizationId),
          sql`${orgProjectTaskTemplates.description} LIKE ${'%' + SEED_MARKER + '%'}`,
          eq(orgProjectTaskTemplates.isArchived, false),
          eq(orgProjectTaskTemplates.isEnabled, true),
        ),
      );

    report.finalAssignees = refreshedTemplates
      .filter((t) => t.defaultAssigneeEmployeeId)
      .map((t) => ({
        templateTitle: t.title,
        employeeId: t.defaultAssigneeEmployeeId,
        employeeName: allEmployees.find((e) => e.id === t.defaultAssigneeEmployeeId)?.name ?? null,
        loginCapable: loginCapable.some((e) => e.employeeId === t.defaultAssigneeEmployeeId),
      }));

    const realLoginTests: Record<string, unknown>[] = [];
    const canonicalTests: Record<string, unknown>[] = [];

    for (const emp of loginCapable) {
      let loginAttempt: Record<string, unknown> = {
        employeeName: emp.employeeName,
        username: emp.username,
        loginAttempted: false,
      };

      if (emp.hasSealedPin) {
        const [accountRow] = await tx
          .select({ temporaryPinSealed: employeeAppAccounts.temporaryPinSealed })
          .from(employeeAppAccounts)
          .where(
            and(
              eq(employeeAppAccounts.organizationId, target.organizationId),
              eq(employeeAppAccounts.employeeId, emp.employeeId),
            ),
          )
          .limit(1);

        if (accountRow?.temporaryPinSealed) {
          try {
            const pin = openTemporaryPinSealed(accountRow.temporaryPinSealed);
            loginAttempt.loginAttempted = true;
            const result = await employeeLogin({ username: emp.username, pin });
            loginAttempt.loginSuccess = true;
            loginAttempt.pinMustChange = result.pinMustChange;
          } catch (error) {
            loginAttempt.loginAttempted = true;
            loginAttempt.loginSuccess = false;
            loginAttempt.loginError = error instanceof Error ? error.message : String(error);
          }
        }
      } else {
        loginAttempt.loginNote = 'No sealed temp PIN available — canonical access layer only';
      }

      realLoginTests.push(loginAttempt);

      if (!sampleProjectId) continue;

      const [assignedTask] = await tx
        .select({
          taskId: tasks.id,
          title: tasks.title,
          projectId: tasks.projectId,
          templateId: tasks.generatedFromOrgProjectTaskTemplateId,
        })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .where(
          and(
            eq(taskAssignees.employeeId, emp.employeeId),
            eq(tasks.projectId, sampleProjectId),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
          ),
        )
        .limit(1);

      const [projectAssignment] = await tx.execute(sql`
        select id from employee_project_assignments
        where organization_id = ${target.organizationId}
          and employee_id = ${emp.employeeId}
          and project_id = ${sampleProjectId}
          and status = 'active'
        limit 1
      `);

      await withUserContext(emp.userId, async (empTx) => {
        const base = await resolveOrgContext(empTx, {
          userId: emp.userId,
          organizationId: target.organizationId,
          locale: 'he-IL',
        });
        const empContext = await enrichOrgContextWithEmployeeApp(base);

        const isEmployeeApp = empContext.roleKeys.includes('employee') && Boolean(empContext.employeeApp);
        const tasksScope = employeePermissionScope(empContext, PERMISSIONS.TASKS_READ);
        const projectsScope = employeePermissionScope(empContext, PERMISSIONS.PROJECTS_READ);

        const accessibleProjects = await resolveAccessibleProjectIdsForUser(empContext);
        const accessibleTaskProjects = await resolveAccessibleProjectIdsForEmployeePermission(
          empContext,
          PERMISSIONS.TASKS_READ,
        );

        const canSeeProject =
          accessibleProjects === null || accessibleProjects.includes(sampleProjectId);

        let pmTasks: Awaited<ReturnType<typeof listEmployeePmTasks>> = [];
        let canSeeAssignedTask = false;
        let taskDetail: Awaited<ReturnType<typeof getEmployeePmTaskDetail>> | null = null;
        let projectOverview: Awaited<ReturnType<typeof getEmployeeProjectTaskOverview>> | null =
          null;
        let activityCount = 0;
        let detailError: string | null = null;

        try {
          pmTasks = await listEmployeePmTasks(empContext, { projectId: sampleProjectId });
        } catch (error) {
          detailError = error instanceof Error ? error.message : String(error);
        }

        if (assignedTask) {
          canSeeAssignedTask = pmTasks.some((t) => t.id === assignedTask.taskId);
          if (!canSeeAssignedTask && tasksScope === 'self_only') {
            canSeeAssignedTask = pmTasks.some((t) => t.id === assignedTask.taskId);
          }

          try {
            await assertEmployeePmTaskReadAccess(empContext, assignedTask.taskId);
            projectOverview = await getEmployeeProjectTaskOverview(empContext, sampleProjectId);
            taskDetail = await getEmployeePmTaskDetail(empContext, assignedTask.taskId);

            const activityRows = await empTx
              .select({ id: taskActivity.id })
              .from(taskActivity)
              .where(eq(taskActivity.taskId, assignedTask.taskId));
            activityCount = activityRows.length;
          } catch (error) {
            detailError = error instanceof Error ? error.message : String(error);
          }
        }

        canonicalTests.push({
          employeeName: emp.employeeName,
          employeeId: emp.employeeId,
          isEmployeeAppUser: isEmployeeApp,
          roleKeys: empContext.roleKeys,
          tasksReadScope: tasksScope,
          projectsReadScope: projectsScope,
          hasProjectAssignment: Array.isArray(projectAssignment) && projectAssignment.length > 0,
          assignedTaskInDb: assignedTask
            ? { taskId: assignedTask.taskId, title: assignedTask.title }
            : null,
          accessibleProjectsMode: accessibleProjects === null ? 'all' : 'list',
          accessibleProjectsIncludesDemo: canSeeProject,
          accessibleTaskProjectIds: accessibleTaskProjects,
          canSeeProject,
          pmTaskCountForProject: pmTasks.length,
          canSeeAssignedTask,
          taskOpenSuccess: Boolean(taskDetail),
          taskTitleMatches: taskDetail?.title === assignedTask?.title,
          projectContextCorrect: taskDetail?.projectId === sampleProjectId,
          commentCount: taskDetail?.comments.length ?? 0,
          activityCount,
          projectOverviewTotalTasks: projectOverview?.totalTasks ?? null,
          detailError,
        });
      });
    }

    const assignedEmployeeIds = [
      ...new Set(
        refreshedTemplates
          .map((t) => t.defaultAssigneeEmployeeId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const nonLoginAssignees = assignedEmployeeIds.filter((id) => !loginCapableIds.has(id));

    for (const employeeId of nonLoginAssignees) {
      const emp = allEmployees.find((e) => e.id === employeeId);
      if (!emp || !sampleProjectId) continue;

      const [assignedTask] = await tx
        .select({ taskId: tasks.id, title: tasks.title })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .where(
          and(
            eq(taskAssignees.employeeId, employeeId),
            eq(tasks.projectId, sampleProjectId),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
          ),
        )
        .limit(1);

      canonicalTests.push({
        employeeName: emp.name,
        employeeId,
        verificationMode: 'canonical_only_no_login_account',
        assignedTaskInDb: assignedTask ?? null,
        note: 'No employee_app_account — login E2E not applicable; DB assignment verified only',
      });
    }

    report.realEmployeeLoginsTested = realLoginTests.filter((t) => t.loginAttempted).length;
    report.realLoginTests = realLoginTests;
    report.canonicalAccessTests = canonicalTests;

    const loginCapableWithAssignedTask = canonicalTests.filter(
      (t) =>
        t.isEmployeeAppUser &&
        t.assignedTaskInDb &&
        loginCapable.some((e) => e.employeeId === t.employeeId),
    );

    report.summary = {
      employeeProjectVisibilityPass: loginCapableWithAssignedTask.every((t) => t.canSeeProject),
      employeeAssignedTaskVisibilityPass: loginCapableWithAssignedTask.every(
        (t) => t.canSeeAssignedTask,
      ),
      taskOpenPass: loginCapableWithAssignedTask.every((t) => t.taskOpenSuccess),
      commentsHistoryAccessible: loginCapableWithAssignedTask.every(
        (t) => (t.activityCount as number) > 0,
      ),
    };
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
