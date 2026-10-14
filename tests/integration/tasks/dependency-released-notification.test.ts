import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { employeeProjectAssignments, employees, notifications } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { addDependency, createTask, updateTask } from '@/modules/tasks';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { createEmployee } from '@/modules/workforce/application/employees';
import { resolveOrgContext } from '@/modules/tenancy';
import { todayInTimeZone } from '@/shared/dates';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('dependency released notification', () => {
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

  async function withContext<T>(
    orgId: string,
    userId: string,
    fn: (context: OrgContext) => Promise<T>,
  ): Promise<T> {
    return database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'en' });
      return fn(context);
    });
  }

  it('notifies the successor assignee when the last predecessor is completed', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { predecessorId, successorId } = await withContext(
      orgA.organization.id,
      userA.id,
      async (context) => {
        const { projectId } = await createProject(context, { name: 'Chain' });
        const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Chain');
        const assignee = await createEmployee(context, { name: 'Successor assignee', rateUnit: 'monthly' });
        await context.db.insert(employeeProjectAssignments).values({
          organizationId: context.organizationId,
          projectId,
          employeeId: assignee.id,
          startDate: todayInTimeZone(context.organization.timezone),
          status: 'active',
        });
        await context.db
          .update(employees)
          .set({ userId: userA.id })
          .where(eq(employees.id, assignee.id));

        const predecessor = await createTask(context, {
          workspaceId: workspace.id,
          projectId,
          title: 'First',
        });
        const successor = await createTask(context, {
          workspaceId: workspace.id,
          projectId,
          title: 'Next',
          assigneeKeys: [`e:${assignee.id}`],
        });
        await addDependency(context, successor.id, predecessor.id, 'finish_to_start');
        return { predecessorId: predecessor.id, successorId: successor.id };
      },
    );

    await withContext(orgA.organization.id, userA.id, async (context) => {
      await updateTask(context, predecessorId, { status: 'done' });
    });

    const rows = await database.asService(async (db) =>
      db
        .select({ type: notifications.type, entityId: notifications.entityId })
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, orgA.organization.id),
            eq(notifications.type, 'task_dependency_resolved'),
            eq(notifications.entityId, successorId),
          ),
        ),
    );

    expect(rows.length).toBe(1);
  });
});
