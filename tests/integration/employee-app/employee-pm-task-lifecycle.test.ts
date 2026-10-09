import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { organizationMemberships } from '@drizzle/schema';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createProject } from '@/modules/projects';
import { createTask } from '@/modules/tasks';
import {
  decideEmployeePmTaskApproval,
  getEmployeePmTaskDetail,
  listEmployeePmTaskPendingApprovals,
  submitEmployeePmTaskApproval,
  updateEmployeePmTaskStatus,
} from '@/modules/employee-app/application/employee-pm-tasks';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import { grantsMapFromPreset } from '@/modules/employee-app/application/permission-editor';
import { createEmployee } from '@/modules/workforce/application/employees';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';
import { createTestUser } from '../../setup/fixtures';

function employeeContext(
  base: OrgContext,
  employeeId: string,
  userId: string,
  grants: Array<{
    permissionKey: (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
    scope: 'self_only' | 'assigned_only' | 'all_organization';
  }>,
): OrgContext {
  const grantMap = grantsMapFromPreset('custom');
  for (const grant of grants) {
    grantMap.set(grant.permissionKey, {
      permissionKey: grant.permissionKey,
      scope: grant.scope,
      granted: true,
    });
  }
  return {
    ...base,
    userId,
    permissions: resolveEmployeeAppEffectivePermissions(grantMap),
    employeeApp: {
      employeeId,
      grants: grantMap,
      allowedDocumentCategories: null,
      account: {
        id: `acc-${employeeId}`,
        organizationId: base.organizationId,
        employeeId,
        userId,
        status: 'active',
        username: `emp-${employeeId.slice(0, 6)}`,
        usernameNormalized: `emp-${employeeId.slice(0, 6)}`,
        authEmail: `${employeeId}@employee.local`,
        pinMustChange: false,
        temporaryPinExpiresAt: null,
        firstLoginAt: null,
        lastLoginAt: null,
        accessStartsAt: null,
        accessEndsAt: null,
        disabledAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    },
  };
}

describe('employee PM task lifecycle', () => {
  let database: TestDatabase;

  async function addOrgMember(orgId: string, roleKey: string) {
    const user = await createTestUser(
      database,
      `${roleKey}-${randomUUID().slice(0, 8)}@example.test`,
    );
    await database.asService(async (db) => {
      const membershipId = randomUUID();
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
    return user;
  }

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('scopes read/update to assignees and runs submit → review → done', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);
    const managerUser = await addOrgMember(orgA.organization.id, 'manager');

    let taskId = '';
    let requestId = '';
    let assigneeId = '';
    let managerEmployeeId = '';

    await database.asUser(userA.id, async (tx) => {
      const ownerContext = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const assignee = await createEmployee(ownerContext, { name: 'Assignee', rateUnit: 'monthly' });
      const other = await createEmployee(ownerContext, { name: 'Other', rateUnit: 'monthly' });
      const manager = await createEmployee(ownerContext, {
        name: 'Manager',
        rateUnit: 'monthly',
        userId: managerUser.id,
      });
      assigneeId = assignee.id;
      managerEmployeeId = manager.id;

      const { projectId } = await createProject(ownerContext, { name: 'Lifecycle Project' });
      const { workspace } = await lazyCreateProjectWorkspace(
        ownerContext,
        projectId,
        'Lifecycle Project',
      );

      const task = await createTask(ownerContext, {
        workspaceId: workspace.id,
        projectId,
        title: 'Approval task',
        approvalRequired: true,
        assigneeKeys: [`e:${assignee.id}`],
      });
      taskId = task.id;

      const assigneeCtx = employeeContext(ownerContext, assignee.id, userA.id, [
        { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
        { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
        { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'self_only' },
      ]);

      const outsiderCtx = employeeContext(ownerContext, other.id, userA.id, [
        { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
      ]);

      await expect(getEmployeePmTaskDetail(assigneeCtx, task.id)).resolves.toMatchObject({
        id: task.id,
        approvalRequired: true,
      });
      await expect(getEmployeePmTaskDetail(outsiderCtx, task.id)).rejects.toBeInstanceOf(
        NotFoundError,
      );

      await updateEmployeePmTaskStatus(assigneeCtx, task.id, 'in_progress');

      const submit = await submitEmployeePmTaskApproval(assigneeCtx, task.id);
      expect(submit.requestId).toBeTruthy();
      requestId = submit.requestId!;

      const pendingForManager = await listEmployeePmTaskPendingApprovals(ownerContext, task.id);
      expect(pendingForManager).toHaveLength(1);

      const assigneeApproverCtx = employeeContext(ownerContext, assignee.id, userA.id, [
        { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
        { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
        { permissionKey: PERMISSIONS.TASKS_APPROVE, scope: 'self_only' },
      ]);

      await expect(
        decideEmployeePmTaskApproval(
          assigneeApproverCtx,
          task.id,
          pendingForManager[0]!.id,
          'approved',
        ),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });

    await database.asUser(managerUser.id, async (tx) => {
      const managerBase = await resolveOrgContext(tx, {
        userId: managerUser.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const managerCtx = employeeContext(managerBase, managerEmployeeId, managerUser.id, [
        { permissionKey: PERMISSIONS.TASKS_READ, scope: 'all_organization' },
        { permissionKey: PERMISSIONS.TASKS_APPROVE, scope: 'all_organization' },
      ]);

      await decideEmployeePmTaskApproval(managerCtx, taskId, requestId, 'approved');
    });

    await database.asUser(userA.id, async (tx) => {
      const ownerContext = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const assigneeCtx = employeeContext(ownerContext, assigneeId, userA.id, [
        { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
        { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
      ]);
      await expect(updateEmployeePmTaskStatus(assigneeCtx, taskId, 'done')).resolves.toBeUndefined();
    });
  });

  it('blocks done when approval is still required', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const ownerContext = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const assignee = await createEmployee(ownerContext, { name: 'Assignee B', rateUnit: 'monthly' });
      const { projectId } = await createProject(ownerContext, { name: 'Gate Project' });
      const { workspace } = await lazyCreateProjectWorkspace(ownerContext, projectId, 'Gate Project');

      const task = await createTask(ownerContext, {
        workspaceId: workspace.id,
        projectId,
        title: 'Gated task',
        approvalRequired: true,
        assigneeKeys: [`e:${assignee.id}`],
      });

      const assigneeCtx = employeeContext(ownerContext, assignee.id, userA.id, [
        { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
        { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
      ]);

      await expect(updateEmployeePmTaskStatus(assigneeCtx, task.id, 'done')).rejects.toBeInstanceOf(
        DomainRuleError,
      );
    });
  });
});
