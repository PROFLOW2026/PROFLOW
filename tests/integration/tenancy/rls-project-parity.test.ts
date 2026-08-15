import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  employees,
  organizationMemberships,
  organizationSettings,
  organizations,
  profiles,
  projectAccessGrants,
  projectBudgetLines,
  projectBudgets,
  projects,
  roleAssignments,
  rolePermissions,
  roles,
} from '@drizzle/schema';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { seedSystemData } from '@drizzle/seed/system';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';

describe('0051 project RLS parity', () => {
  let database: TestDatabase;
  let orgId: string;
  let otherOrgId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let projectAId: string;
  let projectBId: string;
  let ownerMembershipId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    otherOrgId = randomUUID();
    ownerId = randomUUID();
    otherOwnerId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();
    ownerMembershipId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);
      await db.insert(profiles).values([
        { id: ownerId, email: 'owner-parity@example.test', displayName: 'Owner' },
        { id: otherOwnerId, email: 'other-parity@example.test', displayName: 'Other' },
      ]);
      await db.insert(organizations).values([
        {
          id: orgId,
          name: 'Parity Org',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
        {
          id: otherOrgId,
          name: 'Other Org',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
      ]);
      const otherMembershipId = randomUUID();
      await db.insert(organizationMemberships).values([
        { id: ownerMembershipId, organizationId: orgId, userId: ownerId, status: 'active' },
        {
          id: otherMembershipId,
          organizationId: otherOrgId,
          userId: otherOwnerId,
          status: 'active',
        },
      ]);
      const rolesA = await provisionOrganizationRoles(db, orgId);
      const rolesB = await provisionOrganizationRoles(db, otherOrgId);
      await assignRole(db, {
        organizationId: orgId,
        membershipId: ownerMembershipId,
        userId: ownerId,
        roleId: rolesA.owner,
      });
      await assignRole(db, {
        organizationId: otherOrgId,
        membershipId: otherMembershipId,
        userId: otherOwnerId,
        roleId: rolesB.owner,
      });
      await db.insert(organizationSettings).values({
        organizationId: orgId,
        key: 'project_access_mode',
        value: 'selected',
      });
      await db.insert(projects).values([
        { id: projectAId, organizationId: orgId, name: 'Project A', status: 'active', currency: 'ILS' },
        { id: projectBId, organizationId: orgId, name: 'Project B', status: 'active', currency: 'ILS' },
      ]);
    });
  });

  async function createScopedMember(email: string, permissionKeys: string[], projectIds: string[]) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(profiles).values({
        id: userId,
        email,
        displayName: email.split('@')[0]!,
      });
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });
      await db.insert(roles).values({
        id: roleId,
        organizationId: orgId,
        key: `scoped-${userId.slice(0, 8)}`,
        name: 'Scoped',
        rank: 50,
        isProtected: false,
      });
      if (permissionKeys.length > 0) {
        await db.insert(rolePermissions).values(
          permissionKeys.map((permissionKey) => ({
            organizationId: orgId,
            roleId,
            permissionKey,
          })),
        );
      }
      await db.insert(roleAssignments).values({
        organizationId: orgId,
        membershipId,
        userId,
        roleId,
      });
      if (projectIds.length > 0) {
        await db.insert(projectAccessGrants).values(
          projectIds.map((projectId) => ({
            organizationId: orgId,
            userId,
            projectId,
            accessLevel: 'read' as const,
          })),
        );
      }
    });
    return { userId, membershipId, roleId };
  }

  async function visibleIds(userId: string, table: string, column = 'id'): Promise<string[]> {
    return database.asUser(userId, async (tx) => {
      const rows = resultRows<{ id: string }>(
        await tx.execute(sql.raw(`select ${column} as id from ${table}`)),
      );
      return rows.map((row) => row.id).sort();
    });
  }

  it('denies domain-permission users without project access and members without the domain permission', async () => {
    const employeeId = randomUUID();
    const assignmentA = randomUUID();
    const assignmentB = randomUUID();
    const budgetA = randomUUID();
    const budgetB = randomUUID();
    const lineA = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Crew',
        status: 'active',
      });
      await db.execute(sql`
        insert into employee_project_assignments (
          id, organization_id, project_id, employee_id, start_date, status
        ) values
          (${assignmentA}::uuid, ${orgId}::uuid, ${projectAId}::uuid, ${employeeId}::uuid, '2026-01-01', 'active'),
          (${assignmentB}::uuid, ${orgId}::uuid, ${projectBId}::uuid, ${employeeId}::uuid, '2026-01-01', 'active')
      `);
      await db.insert(projectBudgets).values([
        {
          id: budgetA,
          organizationId: orgId,
          projectId: projectAId,
          name: 'Budget A',
          status: 'active',
          currency: 'ILS',
        },
        {
          id: budgetB,
          organizationId: orgId,
          projectId: projectBId,
          name: 'Budget B',
          status: 'active',
          currency: 'ILS',
        },
      ]);
      await db.insert(projectBudgetLines).values({
        id: lineA,
        organizationId: orgId,
        budgetId: budgetA,
        revisionNumber: 1,
        lineType: 'total',
        label: 'Total',
        budgetAmount: '100',
      });
    });

    const domainNoProject = await createScopedMember(
      'domain-no-project@example.test',
      ['workforce.read', 'workforce.manage', 'budgets.read', 'budgets.manage'],
      [],
    );
    const projectNoDomain = await createScopedMember(
      'project-no-domain@example.test',
      [],
      [projectAId],
    );
    const allowed = await createScopedMember(
      'allowed@example.test',
      ['workforce.read', 'workforce.manage', 'budgets.read', 'budgets.manage'],
      [projectAId],
    );

    expect(await visibleIds(domainNoProject.userId, 'employee_project_assignments')).toEqual([]);
    expect(await visibleIds(domainNoProject.userId, 'project_budgets')).toEqual([]);
    expect(await visibleIds(projectNoDomain.userId, 'employee_project_assignments')).toEqual([]);
    expect(await visibleIds(projectNoDomain.userId, 'project_budgets')).toEqual([]);
    expect(await visibleIds(allowed.userId, 'employee_project_assignments')).toEqual(
      [assignmentA].sort(),
    );
    expect(await visibleIds(allowed.userId, 'project_budgets')).toEqual([budgetA]);
    expect(await visibleIds(allowed.userId, 'project_budget_lines')).toEqual([lineA]);
    expect(await visibleIds(otherOwnerId, 'project_budgets')).toEqual([]);
  });

  it('keeps service_role able to read restricted-project rows', async () => {
    const budgetA = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(projectBudgets).values({
        id: budgetA,
        organizationId: orgId,
        projectId: projectAId,
        name: 'Service Budget',
        status: 'active',
        currency: 'ILS',
      });
      const rows = resultRows<{ id: string }>(
        await db.execute(sql`select id from project_budgets where id = ${budgetA}::uuid`),
      );
      expect(rows.map((row) => row.id)).toEqual([budgetA]);
    });
  });

  it('blocks role_assignments writes without roles.manage even when the project is granted', async () => {
    const member = await createScopedMember(
      'no-roles-manage@example.test',
      ['projects.read', 'workforce.manage'],
      [projectAId],
    );

    await database.asUser(member.userId, async (tx) => {
      await expect(
        tx.insert(roleAssignments).values({
          organizationId: orgId,
          membershipId: member.membershipId,
          userId: member.userId,
          roleId: member.roleId,
          projectId: projectAId,
        }),
      ).rejects.toThrow();
    });

    await database.asUser(member.userId, async (tx) => {
      await tx.execute(sql`
          update role_assignments
          set project_id = ${projectAId}::uuid
          where user_id = ${member.userId}::uuid
        `);
    });

    await database.asUser(member.userId, async (tx) => {
      await tx.execute(sql`
          delete from role_assignments
          where user_id = ${member.userId}::uuid
        `);
    });

    const remaining = await database.asService(async (db) =>
      resultRows<{ count: string }>(
        await db.execute(sql`
          select count(*)::text as count
          from role_assignments
          where user_id = ${member.userId}::uuid
        `),
      ),
    );
    expect(Number(remaining[0]?.count ?? 0)).toBe(1);
  });

  it('does not leak restricted-project budget lines through a direct child query', async () => {
    const budgetA = randomUUID();
    const budgetB = randomUUID();
    const lineA = randomUUID();
    const lineB = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(projectBudgets).values([
        {
          id: budgetA,
          organizationId: orgId,
          projectId: projectAId,
          name: 'A',
          status: 'active',
          currency: 'ILS',
        },
        {
          id: budgetB,
          organizationId: orgId,
          projectId: projectBId,
          name: 'B',
          status: 'active',
          currency: 'ILS',
        },
      ]);
      await db.insert(projectBudgetLines).values([
        {
          id: lineA,
          organizationId: orgId,
          budgetId: budgetA,
          revisionNumber: 1,
          lineType: 'total',
          label: 'A',
          budgetAmount: '10',
        },
        {
          id: lineB,
          organizationId: orgId,
          budgetId: budgetB,
          revisionNumber: 1,
          lineType: 'total',
          label: 'B',
          budgetAmount: '20',
        },
      ]);
    });

    const allowed = await createScopedMember(
      'child-query@example.test',
      ['budgets.read', 'budgets.manage'],
      [projectAId],
    );
    expect(await visibleIds(allowed.userId, 'project_budget_lines')).toEqual([lineA]);
  });
});
