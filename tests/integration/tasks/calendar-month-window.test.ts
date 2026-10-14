import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createProject } from '@/modules/projects';
import { createTask } from '@/modules/tasks';
import { countAccessibleWorkLensTasks } from '@/modules/tasks/application/work-lens-task-count';
import { listAccessibleWorkLensTasksPage } from '@/modules/tasks/application/work-lens-task-list';
import { resolveCalendarMonthDueWindow } from '@/modules/tasks/domain/calendar-month-window';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('calendar month window listing', () => {
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

  async function withOwner(orgId: string, userId: string, fn: (ctx: OrgContext) => Promise<void>) {
    await database.asUser(userId, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'en' });
      await fn(ctx);
    });
  }

  it('returns all October tasks when 600 exist org-wide but only 20 in October', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await withOwner(orgA.organization.id, userA.id, async (context) => {
      const { projectId } = await createProject(context, { name: 'Calendar cap project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Calendar cap project');

      for (let i = 0; i < 580; i++) {
        await createTask(context, {
          workspaceId: workspace.id,
          projectId,
          title: `Other month ${i}`,
          dueDate: '2026-11-01',
        });
      }
      for (let i = 0; i < 20; i++) {
        await createTask(context, {
          workspaceId: workspace.id,
          projectId,
          title: `October ${i}`,
          dueDate: '2026-10-15',
        });
      }

      const window = resolveCalendarMonthDueWindow(
        { month: '2026-10' },
        businessDate('2026-10-01'),
      );
      const params = { dueFrom: window.dueFrom, dueTo: window.dueTo };
      const page = await listAccessibleWorkLensTasksPage(context, params, {
        today: businessDate('2026-10-01'),
        limit: 500,
      });
      const total = await countAccessibleWorkLensTasks(context, params);

      expect(total).toBe(20);
      expect(page.tasks.filter((task) => task.dueDate?.startsWith('2026-10'))).toHaveLength(20);
    });
  });
});
