/**
 * App RBAC parity with 0174 RLS — project-scoped roles without org-wide union leak.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  contracts,
  organizationMemberships,
  organizationSettings,
  organizations,
  profiles,
  projectAccessGrants,
  projects,
  roleAssignments,
  rolePermissions,
  roles,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { listProjectContracts } from '@/modules/projects/application/manage-contracts';
import {
  loadEffectivePermissions,
  loadEffectivePermissionsForProject,
  scopeOrgContextToProject,
} from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';

describe('project RBAC — app layer matches project-scoped SQL (EXEC)', () => {
  let database: TestDatabase;
  let orgId: string;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(organizations).values({
        id: orgId,
        name: 'RBAC Parity Org',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      await db.insert(organizationSettings).values({
        organizationId: orgId,
        key: 'project_access_mode',
        value: { mode: 'selected' },
      });

      for (const [id, name] of [
        [projectAId, 'Project A'],
        [projectBId, 'Project B'],
      ] as const) {
        await db.insert(projects).values({
          id,
          organizationId: orgId,
          name,
          status: 'active',
          currency: 'ILS',
        });
        await db.insert(contracts).values({
          id: randomUUID(),
          organizationId: orgId,
          projectId: id,
          name: `${name} contract`,
          status: 'active',
          currency: 'ILS',
        });
      }
    });
  });

  async function seedMember(input: {
    permissionKeys: readonly string[];
    roleProjectId: string | null;
    grantProjectIds: readonly string[];
  }) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(profiles).values({
        id: userId,
        email: `user-${userId.slice(0, 8)}@example.test`,
        displayName: 'Member',
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
        key: `role_${userId.slice(0, 8)}`,
        name: 'Custom',
        rank: 50,
        isProtected: false,
      });
      for (const permissionKey of input.permissionKeys) {
        await db.insert(rolePermissions).values({
          organizationId: orgId,
          roleId,
          permissionKey,
        });
      }
      await db.insert(roleAssignments).values({
        organizationId: orgId,
        membershipId,
        userId,
        roleId,
        projectId: input.roleProjectId,
      });
      for (const projectId of input.grantProjectIds) {
        await db.insert(projectAccessGrants).values({
          organizationId: orgId,
          userId,
          projectId,
          accessLevel: 'read',
        });
      }
    });

    return userId;
  }

  it('project-scoped vs org-wide RBAC (5 gates)', async () => {
    const projectScopedUser = await seedMember({
      permissionKeys: ['contracts.read', 'projects.read'],
      roleProjectId: projectAId,
      grantProjectIds: [projectAId],
    });

    await database.asUser(projectScopedUser, async (tx) => {
      const base = await resolveOrgContext(tx, {
        userId: projectScopedUser,
        organizationId: orgId,
        locale: 'en',
      });

      // 1 — Project A permitted actions (contracts) without org-wide role.
      const orgOnly = await loadEffectivePermissions(tx, orgId, projectScopedUser);
      expect(orgOnly.permissions.has('contracts.read')).toBe(false);

      const forA = await loadEffectivePermissionsForProject(
        tx,
        orgId,
        projectScopedUser,
        projectAId,
      );
      expect(forA.permissions.has('contracts.read')).toBe(true);

      const scopedA = await scopeOrgContextToProject(base, projectAId);
      expect(hasPermission(scopedA, PERMISSIONS.CONTRACTS_READ)).toBe(true);
      const contractsOnA = await listProjectContracts(scopedA, { projectId: projectAId });
      expect(contractsOnA.length).toBe(1);

      // 2 — Project B remains inaccessible (no grant, no project role on B).
      await expect(scopeOrgContextToProject(base, projectBId)).rejects.toThrow();

      // 4 — Financial separation: contracts.read does not imply financials.
      expect(hasPermission(scopedA, PERMISSIONS.PROJECT_FINANCIALS_READ)).toBe(false);
      await expect(getProjectFinancials(scopedA, projectAId)).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });

    const orgWideUser = await seedMember({
      permissionKeys: ['contracts.read', 'projects.read'],
      roleProjectId: null,
      grantProjectIds: [projectAId],
    });

    await database.asUser(orgWideUser, async (tx) => {
      const base = await resolveOrgContext(tx, {
        userId: orgWideUser,
        organizationId: orgId,
        locale: 'en',
      });

      // 3 — Org-wide authorized access preserved on granted project.
      expect(base.permissions.has('contracts.read')).toBe(true);
      const scopedA = await scopeOrgContextToProject(base, projectAId);
      const contractsOnA = await listProjectContracts(scopedA, { projectId: projectAId });
      expect(contractsOnA.length).toBe(1);
    });

    const revokedUser = await seedMember({
      permissionKeys: ['contracts.read', 'projects.read'],
      roleProjectId: projectAId,
      grantProjectIds: [],
    });

    await database.asUser(revokedUser, async (tx) => {
      const base = await resolveOrgContext(tx, {
        userId: revokedUser,
        organizationId: orgId,
        locale: 'en',
      });

      // 5 — Revoked project access denied even with project-scoped role row.
      await expect(scopeOrgContextToProject(base, projectAId)).rejects.toThrow();
    });
  });
});
