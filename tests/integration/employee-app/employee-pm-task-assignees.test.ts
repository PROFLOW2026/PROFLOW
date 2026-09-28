import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createProject } from '@/modules/projects';
import { createTask } from '@/modules/tasks';
import { getEmployeePmTaskDetail } from '@/modules/employee-app/application/employee-pm-tasks';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import { grantsMapFromPreset } from '@/modules/employee-app/application/permission-editor';
import { createEmployee } from '@/modules/workforce/application/employees';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { provisionTwoTenants } from '../../integration/projects/setup';

function employeeViewContext(base: OrgContext, employeeId: string): OrgContext {
  const grants = grantsMapFromPreset('custom');
  grants.set(PERMISSIONS.TASKS_READ, {
    permissionKey: PERMISSIONS.TASKS_READ,
    scope: 'all_organization',
    granted: true,
  });
  return {
    ...base,
    permissions: resolveEmployeeAppEffectivePermissions(grants),
    employeeApp: {
      employeeId,
      grants,
      allowedDocumentCategories: null,
      account: {
        id: 'acc-test',
        organizationId: base.organizationId,
        employeeId,
        userId: base.userId,
        status: 'active',
        username: 'test-employee',
        usernameNormalized: 'test-employee',
        authEmail: 'test@employee.local',
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

describe('employee PM task assignees', () => {
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

  it('returns canonical assignee names in employee task detail', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    await database.asUser(userA.id, async (tx) => {
      const ownerContext = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const employeeA = await createEmployee(ownerContext, { name: 'Employee Alpha', rateUnit: 'monthly' });
      const employeeB = await createEmployee(ownerContext, { name: 'Employee Beta', rateUnit: 'monthly' });

      const { projectId } = await createProject(ownerContext, { name: 'Assignee Detail Project' });
      const { workspace } = await lazyCreateProjectWorkspace(
        ownerContext,
        projectId,
        'Assignee Detail Project',
      );

      const task = await createTask(ownerContext, {
        workspaceId: workspace.id,
        projectId,
        title: 'Shared task',
        assigneeKeys: [`e:${employeeA.id}`, `e:${employeeB.id}`],
      });

      const employeeContext = employeeViewContext(ownerContext, employeeA.id);
      const detail = await getEmployeePmTaskDetail(employeeContext, task.id);
      expect(detail.assignees).toHaveLength(2);
      expect(detail.assignees.map((row) => row.displayName).sort()).toEqual(
        ['Employee Alpha', 'Employee Beta'].sort(),
      );
    });
  });
});
