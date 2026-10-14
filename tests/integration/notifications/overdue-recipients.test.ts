import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { notifications } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { createTask, updateTask } from '@/modules/tasks';
import { runNotificationScan } from '@/modules/notifications/application/scan-conditions';
import { acceptInvitation, createInvitation, resolveOrgContext } from '@/modules/tenancy';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, createTwoTenantScenario } from '../../setup/fixtures';

describe('task overdue notification recipients', () => {
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

  it('notifies assignees only, not unrelated TASKS_UPDATE holders', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);

    const worker = await createTestUser(database, 'tasks-update-worker@example.test');
    const invitation = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return createInvitation(context, { email: worker.email, roleKey: 'manager' });
    });
    await database.asService((db) =>
      acceptInvitation(db, {
        token: invitation.token,
        userId: worker.id,
        userEmail: worker.email,
      }),
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const { projectId } = await createProject(context, { name: 'Overdue Recipients Project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Overdue Recipients Project');

      const task = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Late task',
        dueDate: '2020-01-01',
      });
      await updateTask(context, task.id, { ownerOrgMemberId: context.membershipId });

      await runNotificationScan(context, { maxMs: 15_000, perScannerCap: 10 });
    });

    const rows = await database.asService((db) =>
      db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, orgA.organization.id),
            eq(notifications.type, 'task_overdue'),
          ),
        ),
    );

    const recipientIds = rows.map((row) => row.recipientUserId);
    expect(recipientIds.length).toBeGreaterThan(0);
    expect(recipientIds).not.toContain(worker.id);
  });
});
