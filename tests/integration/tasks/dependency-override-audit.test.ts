import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { auditEvents, organizations } from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { addDependency, createTask, updateTask } from '@/modules/tasks';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import { AUDIT_ACTIONS } from '@/shared/audit';
import { DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('dependency gate override audit', () => {
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

  it('records audit when a manager overrides a block policy with a reason', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asService(async (db) => {
      await db
        .update(organizations)
        .set({ moduleConfig: { tasks: { dependencyPolicy: 'block' } } })
        .where(eq(organizations.id, orgA.organization.id));
    });

    const { successorId } = await withContext(orgA.organization.id, userA.id, async (context) => {
      const { projectId } = await createProject(context, { name: 'Deps' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Deps');
      const predecessor = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Predecessor',
      });
      const successor = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Successor',
      });
      await addDependency(context, successor.id, predecessor.id, 'finish_to_start');
      return { successorId: successor.id };
    });

    await expect(
      withContext(orgA.organization.id, userA.id, async (context) => {
        await updateTask(context, successorId, { status: 'done' });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    await withContext(orgA.organization.id, userA.id, async (context) => {
      await updateTask(context, successorId, {
        status: 'done',
        dependencyOverrideReason: 'Emergency handover on site',
      });
    });

    const auditRows = await database.asService(async (db) =>
      db
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, orgA.organization.id),
            eq(auditEvents.entityId, successorId),
            eq(auditEvents.action, AUDIT_ACTIONS.TASK_DEPENDENCY_GATE_OVERRIDDEN),
          ),
        ),
    );

    expect(auditRows.length).toBe(1);
  });
});
