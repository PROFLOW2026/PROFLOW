import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createProject } from '@/modules/projects';
import { createTask, listAccessibleTasksPage } from '@/modules/tasks';
import { resolveWorkLensCalendarQuery } from '@/modules/tasks/application/work-lens-calendar-filters';
import { businessDate } from '@/shared/dates';
import { resolveOrgContext } from '@/modules/tenancy';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { applyPreparedMigrations } from '../../setup/pending-journal-migrations';
import { createTwoTenantScenario } from '../../setup/fixtures';

describe('work calendar month scope (P10 §11 row 8)', () => {
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

  it('loads only tasks anchored in the visible month grid', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const { projectId } = await createProject(context, { name: 'Calendar Scope' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Calendar Scope');

      await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'March task',
        dueDate: '2026-03-15',
      });
      await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'April grid padding',
        dueDate: '2026-04-02',
      });
      await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'May out of grid',
        dueDate: '2026-05-01',
      });
      await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Start-only March',
        startDate: '2026-03-20',
      });

      const calendarQuery = resolveWorkLensCalendarQuery(
        { month: '2026-03' },
        businessDate('2026-03-10'),
      );
      const page = await listAccessibleTasksPage(context, calendarQuery.listFilters);

      const titles = page.tasks.map((task) => task.title).sort();
      expect(titles).toEqual(['April grid padding', 'March task', 'Start-only March']);
      expect(titles).not.toContain('May out of grid');
    });
  });
});
