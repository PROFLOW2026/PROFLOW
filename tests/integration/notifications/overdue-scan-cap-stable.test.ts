import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq, isNull } from 'drizzle-orm';
import { notifications } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { createTask } from '@/modules/tasks';
import { runNotificationScan } from '@/modules/notifications/application/scan-conditions';
import { listOverdueUwmTasksForScan } from '@/modules/notifications/data/scan-sources.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { todayInTimeZone } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTwoTenantScenario } from '../../setup/fixtures';

describe('overdue scan cap stability', () => {
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

  it('returns the same capped slice on repeated scans and keeps beyond-cap notifications open', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const { projectId } = await createProject(context, { name: 'Cap Stability Project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Cap Stability Project');
      const today = todayInTimeZone(context.organization.timezone);

      for (let day = 1; day <= 5; day += 1) {
        await createTask(context, {
          workspaceId: workspace.id,
          projectId,
          title: `Overdue ${day}`,
          dueDate: `2020-01-${String(day).padStart(2, '0')}`,
        });
      }

      const first = await listOverdueUwmTasksForScan(context.db, context.organizationId, today, 2);
      const second = await listOverdueUwmTasksForScan(context.db, context.organizationId, today, 2);
      expect(first.map((row) => row.id)).toEqual(second.map((row) => row.id));

      await runNotificationScan(context, { maxMs: 15_000, perScannerCap: 2 });
      await runNotificationScan(context, { maxMs: 15_000, perScannerCap: 2 });

      const unresolvedBeyondCap = await context.db
        .select({ entityId: notifications.entityId })
        .from(notifications)
        .where(
          and(
            eq(notifications.organizationId, context.organizationId),
            eq(notifications.type, 'task_overdue'),
            eq(notifications.entityType, 'task'),
            isNull(notifications.resolvedAt),
          ),
        );

      const cappedIds = new Set(first.map((row) => row.id));
      const beyondCapStillOpen = unresolvedBeyondCap.filter((row) => !cappedIds.has(row.entityId ?? ''));
      expect(beyondCapStillOpen).toHaveLength(0);
    });
  });
});
