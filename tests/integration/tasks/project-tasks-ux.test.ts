import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { employeeProjectAssignments, taskAssignees } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { createTask, syncTaskAssignees } from '@/modules/tasks';
import { mapTasksToCardDataForOrg } from '@/modules/tasks/application/map-tasks-for-ui';
import { createEmployee } from '@/modules/workforce/application/employees';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('project tasks UX', () => {
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

  it('A/B/F/H: manual project task with three assignees is one canonical task', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employeeA = await createEmployee(context, { name: 'Assignee A', rateUnit: 'monthly' });
      const employeeB = await createEmployee(context, { name: 'Assignee B', rateUnit: 'monthly' });
      const employeeC = await createEmployee(context, { name: 'Assignee C', rateUnit: 'monthly' });

      const { projectId } = await createProject(context, { name: 'Manual Multi Assignee Project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Manual Multi Assignee Project');
      const workspaceId = workspace.id;

      const task = await createTask(context, {
        workspaceId,
        projectId,
        title: 'Manual multi assignee task',
        description: 'Shared responsibility',
        assigneeKeys: [`e:${employeeA.id}`, `e:${employeeB.id}`, `e:${employeeC.id}`],
      });

      const assigneeRows = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, task.id));
      expect(assigneeRows).toHaveLength(3);

      const cards = await mapTasksToCardDataForOrg(context, [task]);
      expect(cards[0]?.assignees).toHaveLength(3);
      expect(cards[0]?.assignees.every((row) => Boolean(row.displayName))).toBe(true);
    });
  });

  it('G: removing one assignee preserves the others', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employeeA = await createEmployee(context, { name: 'Keep A', rateUnit: 'monthly' });
      const employeeB = await createEmployee(context, { name: 'Remove B', rateUnit: 'monthly' });
      const employeeC = await createEmployee(context, { name: 'Keep C', rateUnit: 'monthly' });

      const { projectId } = await createProject(context, { name: 'Assignee Sync Project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Assignee Sync Project');

      const task = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Sync assignees',
        assigneeKeys: [`e:${employeeA.id}`, `e:${employeeB.id}`, `e:${employeeC.id}`],
      });

      await syncTaskAssignees(context, task.id, {
        assigneeKeys: [`e:${employeeA.id}`, `e:${employeeC.id}`],
      });

      const assigneeRows = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, task.id));

      expect(assigneeRows).toHaveLength(2);
      expect(assigneeRows.some((row) => row.employeeId === employeeB.id)).toBe(false);
    });
  });

  it('D/E/I: zero and one assignee supported; project access granted for assignees', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwnerContext(orgA.organization.id, userA.id, async (context) => {
      const employee = await createEmployee(context, { name: 'Single Assignee', rateUnit: 'monthly' });
      const { projectId } = await createProject(context, { name: 'Assignee Access Project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Assignee Access Project');

      const unassigned = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Unassigned task',
      });

      const unassignedRows = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, unassigned.id));
      expect(unassignedRows).toHaveLength(0);

      const assigned = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Single assignee task',
        assigneeKeys: [`e:${employee.id}`],
      });

      const assignedRows = await context.db
        .select()
        .from(taskAssignees)
        .where(eq(taskAssignees.taskId, assigned.id));
      expect(assignedRows).toHaveLength(1);

      const projectAccess = await context.db
        .select()
        .from(employeeProjectAssignments)
        .where(
          and(
            eq(employeeProjectAssignments.projectId, projectId),
            eq(employeeProjectAssignments.employeeId, employee.id),
          ),
        );
      expect(projectAccess.length).toBeGreaterThan(0);
    });
  });
});
