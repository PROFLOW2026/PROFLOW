import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { taskAssignees, tasks } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import {
  archiveOrgProjectTaskTemplate,
  createOrgProjectTaskTemplate,
  setOrgProjectTaskTemplateEnabled,
  updateOrgProjectTaskTemplate,
} from '@/modules/tasks/application/manage-org-project-task-templates';
import { instantiateOrgProjectTaskTemplates } from '@/modules/tasks/application/instantiate-org-project-task-templates';
import { createTask } from '@/modules/tasks';
import { createEmployee } from '@/modules/workforce/application/employees';
import { findWorkspaceIdsByProject } from '@/modules/workspaces/data/workspaces.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('org project task templates', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  async function withOwnerContext<T>(
    orgId: string,
    userId: string,
    fn: (context: OrgContext) => Promise<T>,
  ): Promise<T> {
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'en' });
      return fn(context);
    });
  }

  it('A: no templates → create project → zero generated tasks', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const { projectId } = await createProject(context, { name: 'Empty Template Project' });

      const rows = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.organizationId, orgA.organization.id), eq(tasks.projectId, projectId)));

      expect(rows).toHaveLength(0);
    });
  });

  it('B: one active unassigned template → one unassigned task', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      await createOrgProjectTaskTemplate(context, {
        title: 'Open project file',
        description: 'Initial setup',
      });

      const { projectId } = await createProject(context, { name: 'Unassigned Template Project' });

      const projectTasks = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));

      expect(projectTasks).toHaveLength(1);
      expect(projectTasks[0]?.title).toBe('Open project file');
      expect(projectTasks[0]?.generatedFromOrgProjectTaskTemplateId).toBeTruthy();

      const assignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, projectTasks[0]!.id));
      expect(assignees).toHaveLength(0);
    });
  });

  it('C: one active assigned template → task assigned to configured employee', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employee = await createEmployee(context, { name: 'Site Engineer', rateUnit: 'monthly' });

      await createOrgProjectTaskTemplate(context, {
        title: 'Plan review',
        defaultAssigneeEmployeeIds: [employee.id],
      });

      const { projectId } = await createProject(context, { name: 'Assigned Template Project' });

      const [task] = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));

      const assignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, task!.id));

      expect(assignees).toHaveLength(1);
      expect(assignees[0]?.employeeId).toBe(employee.id);
    });
  });

  it('D: multiple templates → exact number generated', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      await createOrgProjectTaskTemplate(context, { title: 'Task 1' });
      await createOrgProjectTaskTemplate(context, { title: 'Task 2' });
      await createOrgProjectTaskTemplate(context, { title: 'Task 3' });

      const { projectId } = await createProject(context, { name: 'Multi Template Project' });

      const projectTasks = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));

      expect(projectTasks).toHaveLength(3);
    });
  });

  it('E: disabled template → not generated', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      await createOrgProjectTaskTemplate(context, { title: 'Enabled task' });
      const disabled = await createOrgProjectTaskTemplate(context, { title: 'Disabled task' });
      await setOrgProjectTaskTemplateEnabled(context, disabled.templateId, false);

      const { projectId } = await createProject(context, { name: 'Disabled Template Project' });

      const projectTasks = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));

      expect(projectTasks).toHaveLength(1);
      expect(projectTasks[0]?.title).toBe('Enabled task');
    });
  });

  it('F: retry/idempotency → same template not generated twice', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      await createOrgProjectTaskTemplate(context, { title: 'Idempotent task' });

      const { projectId } = await createProject(context, { name: 'Idempotent Project' });
      await instantiateOrgProjectTaskTemplates(context, projectId, 'Idempotent Project');
      await instantiateOrgProjectTaskTemplates(context, projectId, 'Idempotent Project');

      const projectTasks = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));

      expect(projectTasks).toHaveLength(1);
    });
  });

  it('G: template edit → future projects use new value; existing unchanged by default', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const created = await createOrgProjectTaskTemplate(context, {
        title: 'Original title',
        description: 'Original description',
      });

      const firstProjectId = (await createProject(context, { name: 'Before Edit Project' })).projectId;

      await updateOrgProjectTaskTemplate(context, created.templateId, {
        title: 'Updated title',
        description: 'Updated description',
        applyScope: 'future_only',
      });

      const secondProjectId = (await createProject(context, { name: 'After Edit Project' })).projectId;

      const [oldTask] = await context.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, firstProjectId),
            eq(tasks.generatedFromOrgProjectTaskTemplateId, created.templateId),
          ),
        );
      const [newTask] = await context.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, secondProjectId),
            eq(tasks.generatedFromOrgProjectTaskTemplateId, created.templateId),
          ),
        );

      expect(oldTask?.title).toBe('Original title');
      expect(newTask?.title).toBe('Updated title');
    });
  });

  it('H: explicit retroactive assignee change updates only open generated tasks', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employeeA = await createEmployee(context, { name: 'Engineer A', rateUnit: 'monthly' });
      const employeeB = await createEmployee(context, { name: 'Engineer B', rateUnit: 'monthly' });

      const created = await createOrgProjectTaskTemplate(context, {
        title: 'Review plans',
        defaultAssigneeEmployeeIds: [employeeA.id],
      });

      const projectOneId = (await createProject(context, { name: 'Retro Project 1' })).projectId;
      const projectTwoId = (await createProject(context, { name: 'Retro Project 2' })).projectId;

      const workspaceIds = await findWorkspaceIdsByProject(context.db, projectOneId);
      const workspaceId = workspaceIds[0]!;
      await createTask(context, {
        workspaceId,
        projectId: projectOneId,
        title: 'Review plans',
        source: 'manual',
      });

      const [generatedOnProjectOne] = await context.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, projectOneId),
            eq(tasks.generatedFromOrgProjectTaskTemplateId, created.templateId),
          ),
        );

      await context.db
        .update(tasks)
        .set({ status: 'done', completionDate: '2026-01-01' })
        .where(eq(tasks.id, generatedOnProjectOne!.id));

      await updateOrgProjectTaskTemplate(context, created.templateId, {
        title: 'Review plans',
        defaultAssigneeEmployeeIds: [employeeB.id],
        applyScope: 'existing_tasks',
      });

      const completedAssignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, generatedOnProjectOne!.id));
      expect(completedAssignees.some((a) => a.employeeId === employeeA.id)).toBe(true);
      expect(completedAssignees.some((a) => a.employeeId === employeeB.id)).toBe(false);

      const [openGenerated] = await context.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, projectTwoId),
            eq(tasks.generatedFromOrgProjectTaskTemplateId, created.templateId),
            eq(tasks.status, 'todo'),
          ),
        );
      const openAssignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, openGenerated!.id));
      expect(openAssignees.some((a) => a.employeeId === employeeB.id)).toBe(true);

      const manualTasks = await context.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, projectOneId),
            eq(tasks.title, 'Review plans'),
            eq(tasks.source, 'manual'),
          ),
        );
      expect(manualTasks).toHaveLength(1);
    });
  });

  it('I: invalid configured employee → project still created; task unassigned', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employee = await createEmployee(context, {
        name: 'Leaving Engineer',
        rateUnit: 'monthly',
      });

      await createOrgProjectTaskTemplate(context, {
        title: 'Safety check',
        defaultAssigneeEmployeeIds: [employee.id],
      });

      const { employees: employeesTable } = await import('@drizzle/schema');
      await context.db
        .update(employeesTable)
        .set({ status: 'inactive' })
        .where(eq(employeesTable.id, employee.id));

      const { projectId } = await createProject(context, { name: 'Invalid Assignee Project' });

      const [task] = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));
      expect(task).toBeTruthy();

      const assignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, task!.id));
      expect(assignees).toHaveLength(0);
    });
  });

  it('J: cross-org isolation → other org template cannot be used', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const templateId = await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const created = await createOrgProjectTaskTemplate(context, { title: 'Org A only' });
      return created.templateId;
    });

    await expect(
      withOwnerContext(orgB.organization.id, userB.id, async (context) =>
        updateOrgProjectTaskTemplate(context, templateId, { title: 'Hijacked' }),
      ),
    ).rejects.toThrow();

    await withOwnerContext(orgB.organization.id, userB.id, async (context) => {
      const { projectId } = await createProject(context, { name: 'Org B Project' });
      const rows = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgB.organization.id)));
      expect(rows).toHaveLength(0);
    });
  });

  it('L: jobs do not receive project task templates', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      await createOrgProjectTaskTemplate(context, { title: 'Project only task' });

      const { projectId } = await createProject(context, {
        name: 'Job Not Project',
        workKind: 'job',
      });

      const rows = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));
      expect(rows).toHaveLength(0);
    });
  });

  it('K/L: template with multiple default assignees creates one task with N assignees', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employeeA = await createEmployee(context, { name: 'Engineer A', rateUnit: 'monthly' });
      const employeeB = await createEmployee(context, { name: 'Engineer B', rateUnit: 'monthly' });
      const employeeC = await createEmployee(context, { name: 'Engineer C', rateUnit: 'monthly' });

      await createOrgProjectTaskTemplate(context, {
        title: 'Joint coordination',
        defaultAssigneeEmployeeIds: [employeeA.id, employeeB.id, employeeC.id],
      });

      const { projectId } = await createProject(context, { name: 'Multi Assignee Template Project' });

      const projectTasks = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));

      expect(projectTasks).toHaveLength(1);

      const assignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, projectTasks[0]!.id));

      expect(assignees).toHaveLength(3);
      const employeeIds = assignees.map((row) => row.employeeId).sort();
      expect(employeeIds).toEqual([employeeA.id, employeeB.id, employeeC.id].sort());
    });
  });

  it('N: retroactive multi-assignee update adds/removes assignees on open generated tasks only', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employeeA = await createEmployee(context, { name: 'Engineer A', rateUnit: 'monthly' });
      const employeeB = await createEmployee(context, { name: 'Engineer B', rateUnit: 'monthly' });
      const employeeC = await createEmployee(context, { name: 'Engineer C', rateUnit: 'monthly' });

      const created = await createOrgProjectTaskTemplate(context, {
        title: 'Shared review',
        defaultAssigneeEmployeeIds: [employeeA.id, employeeB.id],
      });

      const projectId = (await createProject(context, { name: 'Retro Multi Project' })).projectId;

      await updateOrgProjectTaskTemplate(context, created.templateId, {
        title: 'Shared review',
        defaultAssigneeEmployeeIds: [employeeB.id, employeeC.id],
        applyScope: 'existing_tasks',
      });

      const [generatedTask] = await context.db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.projectId, projectId),
            eq(tasks.generatedFromOrgProjectTaskTemplateId, created.templateId),
          ),
        );

      const assignees = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, generatedTask!.id));

      expect(assignees).toHaveLength(2);
      expect(assignees.some((row) => row.employeeId === employeeA.id)).toBe(false);
      expect(assignees.some((row) => row.employeeId === employeeB.id)).toBe(true);
      expect(assignees.some((row) => row.employeeId === employeeC.id)).toBe(true);
    });
  });

  it('archived template stops future generation without deleting history', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const created = await createOrgProjectTaskTemplate(context, { title: 'Archive me' });

      await createProject(context, { name: 'Before Archive' });
      await archiveOrgProjectTaskTemplate(context, created.templateId);

      const { projectId } = await createProject(context, { name: 'After Archive' });
      const rows = await context.db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.organizationId, orgA.organization.id)));
      expect(rows).toHaveLength(0);

      const historical = await context.db
        .select()
        .from(tasks)
        .where(eq(tasks.generatedFromOrgProjectTaskTemplateId, created.templateId));
      expect(historical.length).toBeGreaterThan(0);
    });
  });
});
