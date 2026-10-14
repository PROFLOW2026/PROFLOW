import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createProject } from '@/modules/projects';
import { createTask, updateTask } from '@/modules/tasks';
import { listUnscheduledTasksPage } from '@/modules/tasks/application/list-unscheduled-tasks';
import { resolveOrgContext } from '@/modules/tenancy';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { applyPreparedMigrations } from '../../setup/pending-journal-migrations';
import { createTwoTenantScenario } from '../../setup/fixtures';

describe('calendar unscheduled pool (P10 §11 row 8)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, ['0191_project_cover_image']);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('lists open tasks without due dates and drops them after scheduling', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const { projectId } = await createProject(context, { name: 'Unscheduled Pool' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Unscheduled Pool');

      const open = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'No due date',
      });
      const done = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Done without due',
      });
      await updateTask(context, done.id, { status: 'done' });

      const before = await listUnscheduledTasksPage(context, {}, { offset: 0 });
      expect(before.tasks.map((task) => task.title)).toEqual(['No due date']);

      await updateTask(context, open.id, { dueDate: '2026-03-12' });

      const after = await listUnscheduledTasksPage(context, {}, { offset: 0 });
      expect(after.tasks).toHaveLength(0);
    });
  });
});
