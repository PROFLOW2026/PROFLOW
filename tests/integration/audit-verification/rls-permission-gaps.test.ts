/**
 * EXEC proof for SEC-001 / SEC-002 / SEC-003 — RLS aligned with app permission gates (0174).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  auditEvents,
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
import { loadEffectivePermissions, loadEffectivePermissionsForProject } from '@/modules/rbac';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';

describe('audit SEC-001/SEC-002 RLS permission gaps (EXEC)', () => {
  let database: TestDatabase;
  let orgId: string;
  let projectId: string;
  let contractId: string;
  let actorUserId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    projectId = randomUUID();
    contractId = randomUUID();
    actorUserId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: actorUserId,
        email: 'actor@example.test',
        displayName: 'Actor',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'RLS Gap Org',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      await db.insert(projects).values({
        id: projectId,
        organizationId: orgId,
        name: 'RLS Project',
        status: 'active',
        currency: 'ILS',
      });

      await db.insert(contracts).values({
        id: contractId,
        organizationId: orgId,
        projectId,
        name: 'Main contract',
        status: 'active',
        currency: 'ILS',
      });

      await db.insert(auditEvents).values({
        organizationId: orgId,
        actorUserId,
        action: 'project.updated',
        entityType: 'project',
        entityId: projectId,
        before: { name: 'Old' },
        after: { name: 'RLS Project' },
      });
    });
  });

  async function createLimitedMember(
    permissionKeys: readonly string[],
    grantProject: boolean,
    roleProjectId: string | null = null,
  ) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(profiles).values({
        id: userId,
        email: `limited-${userId.slice(0, 8)}@example.test`,
        displayName: 'Limited',
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
        key: `lim_${userId.slice(0, 8)}`,
        name: 'Limited',
        rank: 50,
        isProtected: false,
      });
      for (const permissionKey of permissionKeys) {
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
        projectId: roleProjectId,
      });
      if (grantProject) {
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

  it('SEC-001: org member without audit.read cannot raw SELECT audit_events rows (0174)', async () => {
    const userId = await createLimitedMember(['projects.read'], true);

    const rows = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM audit_events WHERE organization_id = ${orgId}::uuid`),
      ),
    );

    expect(rows.length).toBe(0);
  });

  it('SEC-002: project member without contracts.read cannot raw SELECT contract row (0174)', async () => {
    const userId = await createLimitedMember(['projects.read'], true);

    const rows = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM contracts WHERE organization_id = ${orgId}::uuid AND id = ${contractId}::uuid`,
        ),
      ),
    );

    expect(rows.length).toBe(0);
  });

  it('SEC-002b: project-scoped contracts.read can SELECT own project contract only (0174)', async () => {
    const otherProjectId = randomUUID();
    const otherContractId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(organizationSettings).values({
        organizationId: orgId,
        key: 'project_access_mode',
        value: { mode: 'selected' },
      });
      await db.insert(projects).values({
        id: otherProjectId,
        organizationId: orgId,
        name: 'Other project',
        status: 'active',
        currency: 'ILS',
      });
      await db.insert(contracts).values({
        id: otherContractId,
        organizationId: orgId,
        projectId: otherProjectId,
        name: 'Other contract',
        status: 'active',
        currency: 'ILS',
      });
    });

    const userId = await createLimitedMember(['contracts.read'], true, projectId);

    const ownRows = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM contracts WHERE organization_id = ${orgId}::uuid AND id = ${contractId}::uuid`,
        ),
      ),
    );
    expect(ownRows.length).toBe(1);

    const otherRows = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM contracts WHERE organization_id = ${orgId}::uuid AND id = ${otherContractId}::uuid`,
        ),
      ),
    );
    expect(otherRows.length).toBe(0);
  });

  it('SEC-003: role_assignments.project_id — SQL has_org_permission vs app union (0051 RLS)', async () => {
    const otherProjectId = randomUUID();
    const otherContractId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(organizationSettings).values({
        organizationId: orgId,
        key: 'project_access_mode',
        value: { mode: 'selected' },
      });
      await db.insert(projects).values({
        id: otherProjectId,
        organizationId: orgId,
        name: 'Other project',
        status: 'active',
        currency: 'ILS',
      });
      await db.insert(contracts).values({
        id: otherContractId,
        organizationId: orgId,
        projectId: otherProjectId,
        name: 'Other contract',
        status: 'active',
        currency: 'ILS',
      });
    });

    const userId = await createLimitedMember(['contracts.read'], false, projectId);

    const appPerms = await database.asUser(userId, async (tx) =>
      loadEffectivePermissions(tx, orgId, userId),
    );
    expect(appPerms.permissions.has('contracts.read')).toBe(false);

    const appProjectPerms = await database.asUser(userId, async (tx) =>
      loadEffectivePermissionsForProject(tx, orgId, userId, projectId),
    );
    expect(appProjectPerms.permissions.has('contracts.read')).toBe(true);

    const sqlPerm = await database.asUser(userId, async (tx) =>
      resultRows<{ ok: boolean }>(
        await tx.execute(
          sql`SELECT app.has_org_permission(${orgId}::uuid, 'contracts.read') AS ok`,
        ),
      ),
    );
    expect(sqlPerm[0]?.ok).toBe(false);

    const sqlProjectPerm = await database.asUser(userId, async (tx) =>
      resultRows<{ ok: boolean }>(
        await tx.execute(
          sql`SELECT app.has_project_permission(${orgId}::uuid, ${projectId}::uuid, 'contracts.read') AS ok`,
        ),
      ),
    );
    expect(sqlProjectPerm[0]?.ok).toBe(true);

    const rows = await database.asUser(userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM contracts WHERE organization_id = ${orgId}::uuid AND id = ${otherContractId}::uuid`,
        ),
      ),
    );
    expect(rows.length).toBe(0);
  });

  it('SEC-006: default project_access_mode is selected when setting is absent', async () => {
    const userId = await createLimitedMember(['projects.read'], false);

    const mode = await database.asUser(userId, async (tx) =>
      resultRows<{ mode: string }>(
        await tx.execute(sql`SELECT app.project_access_mode(${orgId}::uuid) AS mode`),
      ),
    );
    expect(mode[0]?.mode).toBe('selected');

    const canAccess = await database.asUser(userId, async (tx) =>
      resultRows<{ ok: boolean }>(
        await tx.execute(
          sql`SELECT app.can_access_project(${orgId}::uuid, ${projectId}::uuid) AS ok`,
        ),
      ),
    );
    expect(canAccess[0]?.ok).toBe(false);
  });
});
