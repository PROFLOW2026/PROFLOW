import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { invitations } from '@drizzle/schema';
import {
  acceptInvitation,
  createInvitation,
  resolveOrgContext,
} from '@/modules/tenancy';
import { loadEffectivePermissions, setRolePermissionToggle } from '@/modules/rbac';
import { DomainRuleError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, createTwoTenantScenario } from '../../setup/fixtures';

/**
 * HIGH-3: a manager granted invitations.manage must not be able to invite a
 * finance role and inherit billing, profit, tax and audit permissions.
 */
describe('invitation privilege escalation', () => {
  let database: TestDatabase;
  let scenario: Awaited<ReturnType<typeof createTwoTenantScenario>>;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  beforeEach(async () => {
    await database.reset();
    scenario = await createTwoTenantScenario(database);
  });

  it('blocks a manager with invitations.manage from inviting the finance role', async () => {
    const managerEmail = 'manager@example.test';
    const financeEmail = 'finance-escalation@example.test';

    const managerInvite = await database.asUser(scenario.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: scenario.userA.id,
        organizationId: scenario.orgA.organization.id,
        locale: 'en',
      });
      return createInvitation(context, { email: managerEmail, roleKey: 'manager' });
    });

    const managerUser = await createTestUser(database, managerEmail);
    await database.asService((db) =>
      acceptInvitation(db, {
        token: managerInvite.token,
        userId: managerUser.id,
        userEmail: managerUser.email,
      }),
    );

    await database.asUser(scenario.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: scenario.userA.id,
        organizationId: scenario.orgA.organization.id,
        locale: 'en',
      });
      await setRolePermissionToggle(context, {
        roleKey: 'manager',
        permission: PERMISSIONS.INVITATIONS_MANAGE,
        enabled: true,
      });
    });

    await expect(
      database.asUser(managerUser.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: managerUser.id,
          organizationId: scenario.orgA.organization.id,
          locale: 'en',
        });
        return createInvitation(context, { email: financeEmail, roleKey: 'finance' });
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);

    const financeUser = await createTestUser(database, financeEmail);
    const pending = await database.asService(async (db) =>
      db
        .select({ id: invitations.id })
        .from(invitations)
        .where(eq(invitations.email, financeEmail)),
    );
    expect(pending).toHaveLength(0);

    await expect(
      database.asService((db) =>
        loadEffectivePermissions(db, scenario.orgA.organization.id, financeUser.id),
      ),
    ).resolves.toSatisfy((result) => result.permissions.size === 0 && result.roleKeys.length === 0);
  });

  it('still lets the same manager invite a worker', async () => {
    const managerEmail = 'manager-worker@example.test';
    const workerEmail = 'worker@example.test';

    const managerInvite = await database.asUser(scenario.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: scenario.userA.id,
        organizationId: scenario.orgA.organization.id,
        locale: 'en',
      });
      return createInvitation(context, { email: managerEmail, roleKey: 'manager' });
    });

    const managerUser = await createTestUser(database, managerEmail);
    await database.asService((db) =>
      acceptInvitation(db, {
        token: managerInvite.token,
        userId: managerUser.id,
        userEmail: managerUser.email,
      }),
    );

    await database.asUser(scenario.userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: scenario.userA.id,
        organizationId: scenario.orgA.organization.id,
        locale: 'en',
      });
      await setRolePermissionToggle(context, {
        roleKey: 'manager',
        permission: PERMISSIONS.INVITATIONS_MANAGE,
        enabled: true,
      });
    });

    const workerInvite = await database.asUser(managerUser.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: managerUser.id,
        organizationId: scenario.orgA.organization.id,
        locale: 'en',
      });
      return createInvitation(context, { email: workerEmail, roleKey: 'worker' });
    });

    expect(workerInvite.email).toBe(workerEmail);
  });
});
