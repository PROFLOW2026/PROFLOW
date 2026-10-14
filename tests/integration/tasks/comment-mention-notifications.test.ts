import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { organizationMemberships, workspaceMembers } from '@drizzle/schema';
import { listNotifications } from '@/modules/notifications';
import { createProject } from '@/modules/projects';
import { createComment, createTask } from '@/modules/tasks';
import { formatMentionToken } from '@/modules/tasks/domain/comment-mentions';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createEmployee } from '@/modules/workforce/application/employees';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestUser } from '../../setup/fixtures';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { applyPreparedMigrations } from '../../setup/pending-journal-migrations';
import { provisionTwoTenants } from '../../integration/projects/setup';

describe('comment mention notifications', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, ['0188_task_collaboration']);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await applyPreparedMigrations(database, ['0188_task_collaboration']);
  });

  async function addOrgMember(orgId: string, roleKey: string) {
    const user = await createTestUser(
      database,
      `${roleKey}-${randomUUID().slice(0, 8)}@example.test`,
    );
    let membershipId = '';
    await database.asService(async (db) => {
      membershipId = randomUUID();
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId: user.id,
        status: 'active',
      });
      const role = await findRoleByKey(db, orgId, roleKey);
      if (!role) throw new Error(`Role ${roleKey} missing`);
      await assignRole(db, {
        organizationId: orgId,
        membershipId,
        userId: user.id,
        roleId: role.id,
      });
    });
    return { user, membershipId };
  }

  it('mentions only the referenced user, not every assignee', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const mentionTarget = await addOrgMember(orgA.organization.id, 'manager');
    const assigneeUser = await addOrgMember(orgA.organization.id, 'manager');

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const assigneeEmployee = await createEmployee(context, {
        name: 'Assignee with login',
        rateUnit: 'monthly',
        userId: assigneeUser.user.id,
      });

      const { projectId } = await createProject(context, { name: 'Mentions project' });
      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, 'Mentions project');

      await context.db.insert(workspaceMembers).values({
        workspaceId: workspace.id,
        organizationId: orgA.organization.id,
        orgMemberId: mentionTarget.membershipId,
        accessLevel: 'contributor',
      });

      const task = await createTask(context, {
        workspaceId: workspace.id,
        projectId,
        title: 'Mention task',
        assigneeKeys: [`e:${assigneeEmployee.id}`],
      });

      const body = `Ping ${formatMentionToken(mentionTarget.membershipId)}`;
      await createComment(context, task.id, { body });
    });

    const mentionInbox = await database.asUser(mentionTarget.user.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: mentionTarget.user.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listNotifications(ctx);
    });

    const assigneeInbox = await database.asUser(assigneeUser.user.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: assigneeUser.user.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listNotifications(ctx);
    });

    const mentionRows = mentionInbox.items.filter((row) => row.type === 'task_comment_mention');
    const addedRows = assigneeInbox.items.filter((row) => row.type === 'task_comment_added');

    expect(mentionRows.length).toBe(1);
    expect(addedRows.length).toBe(1);
    expect(mentionRows.some((row) => row.type === 'task_comment_mention')).toBe(true);
    expect(mentionInbox.items.every((row) => row.type !== 'task_comment_added')).toBe(true);
  }, 120_000);
});
