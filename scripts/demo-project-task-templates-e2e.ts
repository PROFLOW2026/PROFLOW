/**
 * Demo E2E: org project task templates for mthsystems@gmail.com
 * Creates permanent template config + 3 demo projects. Idempotent on templates.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/demo-project-task-templates-e2e.ts
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

async function verifyMigrationSchema(): Promise<Record<string, unknown>> {
  const postgres = (await import('postgres')).default;
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL missing');
  const sqlClient = postgres(connectionString, { prepare: false, max: 1 });

  try {
    const [table] = await sqlClient<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = 'org_project_task_templates'
      ) as exists
    `;

    const [column] = await sqlClient<{ exists: boolean }[]>`
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'tasks'
          and column_name = 'generated_from_org_project_task_template_id'
      ) as exists
    `;

    const fks = await sqlClient<{ conname: string; confdeltype: string }[]>`
      select c.conname, c.confdeltype
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      where t.relname in ('org_project_task_templates', 'tasks')
        and c.contype = 'f'
        and c.conname in (
          'org_project_task_templates_default_assignee_employee_org_fk',
          'tasks_generated_org_project_task_template_org_fk'
        )
    `;

    const indexes = await sqlClient<{ indexname: string }[]>`
      select indexname from pg_indexes
      where schemaname = 'public'
        and indexname in (
          'org_project_task_templates_id_organization_id_uq',
          'tasks_project_org_project_task_template_unique',
          'tasks_org_project_task_template_idx'
        )
    `;

    const grants = await sqlClient<{ grantee: string; privilege_type: string }[]>`
      select grantee, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'org_project_task_templates'
        and grantee in ('authenticated', 'service_role')
    `;

    const journal = await sqlClient<{ tag: string }[]>`
      select tag from drizzle.__drizzle_migrations
      where tag = '0149_org_project_task_templates'
      limit 1
    `.catch(() => [] as { tag: string }[]);

    const authGrants = grants
      .filter((g) => g.grantee === 'authenticated')
      .map((g) => g.privilege_type);

    return {
      tableExists: table?.exists ?? false,
      provenanceColumnExists: column?.exists ?? false,
      compositeFks: Object.fromEntries(fks.map((f) => [f.conname, f.confdeltype])),
      indexes: indexes.map((i) => i.indexname),
      authenticatedGrants: authGrants,
      journal0149: journal.length > 0 ? 'YES' : 'CHECK_DRIZZLE_JOURNAL_TABLE',
      deleteGrantRemoved: !authGrants.includes('DELETE'),
    };
  } finally {
    await sqlClient.end();
  }
}

const TEMPLATE_SPECS = [
  { title: 'פתיחת תיק פרויקט', description: 'יצירת תיק פרויקט ראשוני', assigneeIndex: null },
  { title: 'איסוף מסמכי לקוח', description: 'איסוף חוזים ותוכניות', assigneeIndex: 0 },
  { title: 'בדיקת תוכניות', description: 'סקירת תוכניות אדריכלות', assigneeIndex: 1 },
  { title: 'תיאום קבלנים', description: 'תיאום ראשוני עם קבלנים', assigneeIndex: 2 },
  { title: 'הזמנת חומרים', description: 'הזמנת חומרים לפתיחת עבודה', assigneeIndex: 3 },
  { title: 'פתיחת מסמכי הנהלה', description: 'הקמת תיק הנהלת חשבונות', assigneeIndex: 4 },
  { title: 'סיור אתר ראשון', description: 'סיור אתר עם הלקוח', assigneeIndex: 5 },
  { title: 'הגדרת לוח זמנים', description: 'טיוטת לוח זמנים ראשוני', assigneeIndex: null },
  { title: 'הקמת לוח משימות', description: 'הקמת לוח עבודה בפרויקט', assigneeIndex: null },
  { title: 'דיווח פתיחה ללקוח', description: 'מייל פתיחה ללקוח', assigneeIndex: null },
] as const;

async function main(): Promise<void> {
  const schemaCheck = await verifyMigrationSchema();
  console.log('SCHEMA CHECK =', JSON.stringify(schemaCheck, null, 2));

  const target = await resolveDemoTarget();
  console.log('DEMO TARGET =', target);

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { orgProjectTaskTemplates, employees, projects, tasks, taskAssignees } =
    await import('@drizzle/schema');

  const report: Record<string, unknown> = {
    demoAccount: DEMO_USER_EMAIL,
    organizationId: target.organizationId,
    organizationName: target.organizationName,
    schemaCheck,
  };

  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: target.organizationId,
      locale: 'he-IL',
    });

    const activeEmployees = await tx
      .select({ id: employees.id, name: employees.name, userId: employees.userId })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, target.organizationId),
          eq(employees.status, 'active'),
          isNull(employees.archivedAt),
        ),
      )
      .orderBy(employees.name);

    report.availableEmployeeCount = activeEmployees.length;

    if (activeEmployees.length < 6) {
      report.error = `Need 6 employees, found ${activeEmployees.length}`;
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }

    const assigneeEmployees = activeEmployees.slice(0, 6);
    report.distinctAssignees = assigneeEmployees.map((e) => ({ id: e.id, name: e.name }));

    const { createOrgProjectTaskTemplate, listOrgProjectTaskTemplatesForSettings } =
      await import('../src/modules/tasks/application/manage-org-project-task-templates.ts');

    const existing = await tx
      .select()
      .from(orgProjectTaskTemplates)
      .where(
        and(
          eq(orgProjectTaskTemplates.organizationId, target.organizationId),
          sql`${orgProjectTaskTemplates.description} LIKE ${'%' + SEED_MARKER + '%'}`,
          eq(orgProjectTaskTemplates.isArchived, false),
        ),
      );

    if (existing.length < 10) {
      for (const spec of TEMPLATE_SPECS) {
        const already = existing.find((row) => row.title === spec.title);
        if (already) continue;

        const employeeId =
          spec.assigneeIndex === null ? null : assigneeEmployees[spec.assigneeIndex]!.id;

        await createOrgProjectTaskTemplate(context, {
          title: spec.title,
          description: `${spec.description} [${SEED_MARKER}]`,
          defaultAssigneeEmployeeId: employeeId,
        });
      }
    }

    const templates = await listOrgProjectTaskTemplatesForSettings(context, {
      includeArchived: false,
    });
    const seedTemplates = templates.filter((t) => t.description?.includes(SEED_MARKER));
    const activeSeedTemplates = seedTemplates.filter((t) => t.isEnabled);

    report.templateCount = activeSeedTemplates.length;
    report.assignedTemplateCount = activeSeedTemplates.filter(
      (t) => t.defaultAssigneeEmployeeId,
    ).length;
    report.unassignedTemplateCount = activeSeedTemplates.filter(
      (t) => !t.defaultAssigneeEmployeeId,
    ).length;

    const { createProject } = await import('../src/modules/projects/index.ts');

    const projectNames = [
      `${PROJECT_NAME_PREFIX} — 1`,
      `${PROJECT_NAME_PREFIX} — 2`,
      `${PROJECT_NAME_PREFIX} — 3`,
    ];

    const createdProjects: { id: string; name: string }[] = [];

    for (const name of projectNames) {
      const [existingProject] = await tx
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(
          and(eq(projects.organizationId, target.organizationId), eq(projects.name, name)),
        )
        .limit(1);

      if (existingProject) {
        createdProjects.push(existingProject);
        continue;
      }

      const result = await createProject(context, { name, workKind: 'project' });
      createdProjects.push({ id: result.projectId, name });
    }

    report.demoProjects = createdProjects;

    const projectTaskCounts: Record<string, number> = {};
    const projectDetails: Record<string, unknown> = {};

    for (const project of createdProjects) {
      const projectTasks = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, target.organizationId),
            eq(tasks.projectId, project.id),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
          ),
        );

      projectTaskCounts[project.id] = projectTasks.length;

      const assigneeRows = await tx
        .select({
          taskId: taskAssignees.taskId,
          employeeId: taskAssignees.employeeId,
        })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.organizationId, target.organizationId),
            inArray(
              taskAssignees.taskId,
              projectTasks.map((t) => t.id),
            ),
          ),
        );

      const assignedEmployeeIds = [
        ...new Set(assigneeRows.map((r) => r.employeeId).filter(Boolean)),
      ];

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

      const duplicates = duplicateCheck.filter((row) => row.cnt > 1);

      projectDetails[project.name] = {
        taskCount: projectTasks.length,
        assignedTaskCount: assigneeRows.length,
        distinctAssignees: assignedEmployeeIds.length,
        duplicates: duplicates.length,
        provenancePresent: projectTasks.every((t) => t.generatedFromOrgProjectTaskTemplateId),
        unassignedCount: projectTasks.length - assigneeRows.length,
      };
    }

    report.projectTaskCounts = projectTaskCounts;
    report.projectDetails = projectDetails;

    const { getTaskDetail } = await import('../src/modules/tasks/index.ts');
    const sampleProject = createdProjects[0]!;
    const [sampleTask] = await tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, sampleProject.id),
          sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
        ),
      )
      .limit(1);

    if (sampleTask) {
      const detail = await getTaskDetail(context, sampleTask.id);
      report.taskDetailSample = {
        taskId: sampleTask.id,
        title: detail?.title,
        activityCount: detail?.recentActivity?.length ?? 0,
        assigneeCount: detail?.assignees?.length ?? 0,
        provenanceTemplateId: sampleTask.generatedFromOrgProjectTaskTemplateId,
      };
    }

    const employeeVisibility: Record<string, unknown>[] = [];
    for (const emp of assigneeEmployees) {
      const [assignedTask] = await tx
        .select({ taskId: tasks.id, projectId: tasks.projectId })
        .from(tasks)
        .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
        .where(
          and(
            eq(taskAssignees.employeeId, emp.id),
            eq(tasks.projectId, sampleProject.id),
            sql`${tasks.generatedFromOrgProjectTaskTemplateId} IS NOT NULL`,
          ),
        )
        .limit(1);

      if (!emp.userId) {
        employeeVisibility.push({
          employee: emp.name,
          linkedUser: false,
          note: 'No linked user — employee-app login visibility not applicable',
          taskAssignedInDb: Boolean(assignedTask),
        });
        continue;
      }

      try {
        await withUserContext(emp.userId, async (empTx) => {
          const empContext = await resolveOrgContext(empTx, {
            userId: emp.userId!,
            organizationId: target.organizationId,
            locale: 'he-IL',
          });

          const { listAccessibleTasks } = await import('../src/modules/tasks/index.ts');
          const accessible = assignedTask
            ? await listAccessibleTasks(empContext, {
                projectId: sampleProject.id,
                limit: 100,
              })
            : [];

          const canSeeTask = assignedTask
            ? accessible.some((t) => t.id === assignedTask.taskId)
            : false;

          employeeVisibility.push({
            employee: emp.name,
            linkedUser: true,
            userId: emp.userId,
            taskAssignedInDb: Boolean(assignedTask),
            canSeeAssignedTask: canSeeTask,
          });
        });
      } catch (error) {
        employeeVisibility.push({
          employee: emp.name,
          linkedUser: true,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    report.employeeVisibility = employeeVisibility;

    const otherOrgWithZeroTemplates = await tx.execute(sql`
      select o.id, o.name,
        (select count(*)::int from org_project_task_templates t where t.organization_id = o.id and t.is_archived = false) as template_count
      from organizations o
      where o.id <> ${target.organizationId}
      order by template_count asc
      limit 5
    `);

    report.zeroTemplateOrgSample = otherOrgWithZeroTemplates;
  });

  console.log('\n=== E2E REPORT ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
