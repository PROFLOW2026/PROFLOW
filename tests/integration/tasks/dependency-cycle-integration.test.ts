import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createProject } from '@/modules/projects';
import { addDependency, createTask } from '@/modules/tasks';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('task dependency cycle integration', () => {
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

  it('rejects a four-node cycle when linking the closing edge', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const taskIds = await withContext(orgA.organization.id, userA.id, async (context) => {
      const { projectId } = await createProject(context, { name: 'Cycle' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Cycle');
      const a = await createTask(context, { workspaceId: workspace.id, projectId, title: 'A' });
      const b = await createTask(context, { workspaceId: workspace.id, projectId, title: 'B' });
      const c = await createTask(context, { workspaceId: workspace.id, projectId, title: 'C' });
      const d = await createTask(context, { workspaceId: workspace.id, projectId, title: 'D' });
      await addDependency(context, b.id, a.id, 'finish_to_start');
      await addDependency(context, c.id, b.id, 'finish_to_start');
      await addDependency(context, d.id, c.id, 'finish_to_start');
      return { a: a.id, d: d.id };
    });

    await expect(
      withContext(orgA.organization.id, userA.id, async (context) => {
        await addDependency(context, taskIds.a, taskIds.d, 'finish_to_start');
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
