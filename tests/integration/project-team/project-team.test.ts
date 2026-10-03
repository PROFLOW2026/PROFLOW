import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  auditEvents,
  domainEvents,
  organizationMemberships,
  organizationSettings,
  projectMemberCapabilities,
  roleAssignments,
  rolePermissions,
} from '@drizzle/schema';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  ALL_PROJECT_CAPABILITIES,
  PROJECT_CAPABILITIES as C,
  addProjectMember,
  hasProjectCapability,
  listProjectTeam,
  loadProjectCapabilities,
  setProjectMemberCapabilities,
  setProjectMemberStatus,
} from '@/modules/project-team';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createTestUser, type TestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';

describe('project team capabilities (Developer / GC foundation)', () => {
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

  async function addOrgMember(orgId: string, label: string, roleKey = 'worker'): Promise<TestUser> {
    const user = await createTestUser(database, `${label}-${randomUUID().slice(0, 6)}@example.test`);
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
      await assignRole(db, { organizationId: orgId, membershipId, userId: user.id, roleId: role.id });
    });
    return user;
  }

  async function contextFor(tx: Parameters<Parameters<TestDatabase['asUser']>[1]>[0], userId: string, orgId: string) {
    return resolveOrgContext(tx, { userId, organizationId: orgId, locale: 'en' });
  }

  async function scenario() {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;

    const [p1, p2] = await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      const first = await createProject(context, { name: 'Tower One' });
      const second = await createProject(context, { name: 'Tower Two' });
      return [first.projectId, second.projectId] as const;
    });

    const pmOps = await addOrgMember(orgId, 'pm-ops');
    const siteManager = await addOrgMember(orgId, 'site');
    const accountant = await addOrgMember(orgId, 'acct');
    const outsider = await addOrgMember(orgId, 'outsider');
    const teamLead = await addOrgMember(orgId, 'teamlead');

    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      await addProjectMember(context, {
        projectId: p1,
        userId: pmOps.id,
        templateKey: 'project_manager_operational',
        title: 'PM',
      });
      await addProjectMember(context, { projectId: p1, userId: siteManager.id, templateKey: 'site_manager' });
      await addProjectMember(context, { projectId: p1, userId: accountant.id, templateKey: 'project_accountant' });
      await addProjectMember(context, {
        projectId: p1,
        userId: teamLead.id,
        capabilities: [C.PROJECT_TEAM_MANAGE, C.TASKS_MANAGE],
      });
    });

    return { orgA, orgB, userA, userB, orgId, p1, p2, pmOps, siteManager, accountant, outsider, teamLead };
  }

  it('gives the Owner every capability on every project (project_team.admin)', async () => {
    const { userA, orgId, p1, p2 } = await scenario();
    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      for (const projectId of [p1, p2]) {
        const held = await loadProjectCapabilities(context, projectId);
        expect(held.size).toBe(ALL_PROJECT_CAPABILITIES.length);
      }
    });
  });

  it('keeps the operational PM and site manager free of every financial capability', async () => {
    const { orgId, p1, pmOps, siteManager } = await scenario();
    for (const user of [pmOps, siteManager]) {
      await database.asUser(user.id, async (tx) => {
        const context = await contextFor(tx, user.id, orgId);
        const held = await loadProjectCapabilities(context, p1);
        expect(held.has(C.PROJECT_VIEW)).toBe(true);
        for (const financial of [
          C.FINANCIAL_VIEW,
          C.CONTRACT_FINANCIAL_VIEW,
          C.CLAIM_VIEW,
          C.CLAIM_CERTIFY,
          C.RETENTION_MANAGE,
          C.PAYMENT_VIEW,
        ]) {
          expect(held.has(financial), `${user.email} must not hold ${financial}`).toBe(false);
        }
      });
    }
  });

  it('does not leak project A membership to project B or to non-members', async () => {
    const { orgId, p1, p2, pmOps, outsider } = await scenario();
    await database.asUser(pmOps.id, async (tx) => {
      const context = await contextFor(tx, pmOps.id, orgId);
      expect(await hasProjectCapability(context, p1, C.PROJECT_MANAGE)).toBe(true);
      expect(await hasProjectCapability(context, p2, C.PROJECT_VIEW)).toBe(false);
      expect(await hasProjectCapability(context, p2, C.PROJECT_MANAGE)).toBe(false);
    });
    await database.asUser(outsider.id, async (tx) => {
      const context = await contextFor(tx, outsider.id, orgId);
      expect((await loadProjectCapabilities(context, p1)).size).toBe(0);
      await expect(listProjectTeam(context, p1)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it('does not publish a project capability as an organization permission', async () => {
    const { orgId, p1, pmOps, siteManager } = await scenario();
    const capabilityKeys = new Set<string>(ALL_PROJECT_CAPABILITIES);

    for (const user of [pmOps, siteManager]) {
      await database.asUser(user.id, async (tx) => {
        const context = await contextFor(tx, user.id, orgId);
        const held = await loadProjectCapabilities(context, p1);
        expect(held.size).toBeGreaterThan(0);
        expect(held.has(C.PROJECT_VIEW)).toBe(true);
        const orgPermissions = [...context.permissions];
        for (const capability of held) {
          expect(orgPermissions, `${user.email} org permissions include project capability ${capability}`).not.toContain(
            capability,
          );
        }
        expect(orgPermissions.some((key) => capabilityKeys.has(key))).toBe(false);
      });

      const granted = await database.asService((db) =>
        db
          .select({ permissionKey: rolePermissions.permissionKey })
          .from(roleAssignments)
          .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
          .where(and(eq(roleAssignments.organizationId, orgId), eq(roleAssignments.userId, user.id))),
      );
      expect(granted.length).toBeGreaterThan(0);
      for (const row of granted) {
        expect(capabilityKeys.has(row.permissionKey), `${row.permissionKey} is a project capability`).toBe(false);
      }
    }
  });

  it('forbids a team manager from granting capabilities they do not hold (app layer)', async () => {
    const { orgId, p1, teamLead, outsider } = await scenario();
    await database.asUser(teamLead.id, async (tx) => {
      const context = await contextFor(tx, teamLead.id, orgId);
      await expect(
        addProjectMember(context, {
          projectId: p1,
          userId: outsider.id,
          capabilities: [C.CLAIM_CERTIFY],
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
      const ok = await addProjectMember(context, {
        projectId: p1,
        userId: outsider.id,
        capabilities: [C.TASKS_MANAGE],
      });
      expect(ok.capabilities).toEqual(expect.arrayContaining([C.TASKS_MANAGE, C.TASKS_VIEW, C.PROJECT_VIEW]));
    });
  });

  it('forbids stripping capabilities the actor does not hold', async () => {
    const { orgId, p1, teamLead, accountant } = await scenario();
    await database.asUser(teamLead.id, async (tx) => {
      const context = await contextFor(tx, teamLead.id, orgId);
      const team = await listProjectTeam(context, p1);
      const accountantMember = team.find((member) => member.userId === accountant.id)!;
      await expect(
        setProjectMemberCapabilities(context, {
          projectId: p1,
          memberId: accountantMember.id,
          capabilities: [C.PROJECT_VIEW],
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(
        setProjectMemberStatus(context, { projectId: p1, memberId: accountantMember.id, active: false }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it('rejects, at the database, a capability insert the actor does not hold (trigger)', async () => {
    const { orgId, p1, teamLead, siteManager } = await scenario();
    const memberId = await database.asService(async (db) => {
      const rows = resultRows<{ id: string }>(
        await db.execute(
          sql`select id from project_members where user_id = ${siteManager.id} and project_id = ${p1}`,
        ),
      );
      return rows[0]!.id;
    });

    await expect(
      database.asUser(teamLead.id, async (tx) => {
        await tx.insert(projectMemberCapabilities).values({
          organizationId: orgId,
          memberId,
          capability: C.CLAIM_CERTIFY,
          grantedByUserId: teamLead.id,
        });
      }),
    ).rejects.toThrow();
  });

  it('refuses to add someone who is not an active organization member (external users stay out)', async () => {
    const { userA, orgId, p1 } = await scenario();
    const stranger = await createTestUser(database, `stranger-${randomUUID().slice(0, 6)}@example.test`);
    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      await expect(
        addProjectMember(context, { projectId: p1, userId: stranger.id, templateKey: 'viewer' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  it('deactivation removes all capabilities; reactivation restores them', async () => {
    const { userA, orgId, p1, siteManager } = await scenario();
    const memberId = await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      const team = await listProjectTeam(context, p1);
      return team.find((member) => member.userId === siteManager.id)!.id;
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      await setProjectMemberStatus(context, { projectId: p1, memberId, active: false });
    });
    await database.asUser(siteManager.id, async (tx) => {
      const context = await contextFor(tx, siteManager.id, orgId);
      expect((await loadProjectCapabilities(context, p1)).size).toBe(0);
    });

    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      await setProjectMemberStatus(context, { projectId: p1, memberId, active: true });
    });
    await database.asUser(siteManager.id, async (tx) => {
      const context = await contextFor(tx, siteManager.id, orgId);
      expect((await loadProjectCapabilities(context, p1)).has(C.TASKS_MANAGE)).toBe(true);
    });
  });

  it('keeps the SQL mirror app.has_project_capability identical to the application resolver', async () => {
    const { orgId, p1, p2, pmOps, accountant } = await scenario();
    for (const user of [pmOps, accountant]) {
      await database.asUser(user.id, async (tx) => {
        const context = await contextFor(tx, user.id, orgId);
        for (const projectId of [p1, p2]) {
          const held = await loadProjectCapabilities(context, projectId);
          for (const capability of ALL_PROJECT_CAPABILITIES) {
            const rows = resultRows<{ ok: boolean }>(
              await tx.execute(
                sql`select app.has_project_capability(${orgId}::uuid, ${projectId}::uuid, ${capability}) as ok`,
              ),
            );
            expect(rows[0]!.ok, `${user.email} ${projectId} ${capability}`).toBe(held.has(capability));
          }
        }
      });
    }
  });

  it('lets a project member open the project in selected-access mode, and nobody else', async () => {
    const { orgId, p1, p2, pmOps, outsider } = await scenario();
    await database.asService(async (db) => {
      await db
        .insert(organizationSettings)
        .values({ organizationId: orgId, key: 'project_access_mode', value: { mode: 'selected' } })
        .onConflictDoNothing();
      await db
        .update(organizationSettings)
        .set({ value: { mode: 'selected' } })
        .where(
          and(eq(organizationSettings.organizationId, orgId), eq(organizationSettings.key, 'project_access_mode')),
        );
    });

    const visible = async (userId: string, projectId: string) =>
      database.asUser(userId, async (tx) => {
        const rows = resultRows<{ ok: boolean }>(
          await tx.execute(sql`select app.can_access_project(${orgId}::uuid, ${projectId}::uuid) as ok`),
        );
        return rows[0]!.ok;
      });

    expect(await visible(pmOps.id, p1)).toBe(true);
    expect(await visible(pmOps.id, p2)).toBe(false);
    expect(await visible(outsider.id, p1)).toBe(false);
  });

  it('isolates tenants: another organization sees no members', async () => {
    const { orgB, userB, orgId, p1 } = await scenario();
    await database.asUser(userB.id, async (tx) => {
      const rows = resultRows<{ n: number }>(
        await tx.execute(sql`select count(*)::int as n from project_members where project_id = ${p1}`),
      );
      expect(rows[0]!.n).toBe(0);
      const context = await contextFor(tx, userB.id, orgB.organization.id);
      // Org B's own admin passes the capability gate but the project does not exist in B:
      // "not found" (no existence oracle), never a leak of A's team.
      await expect(listProjectTeam(context, p1)).rejects.toBeInstanceOf(NotFoundError);
      expect(orgId).not.toBe(orgB.organization.id);
    });
  });

  it('audits membership and capability changes', async () => {
    const { userA, orgId, p1, siteManager } = await scenario();
    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      const team = await listProjectTeam(context, p1);
      const member = team.find((candidate) => candidate.userId === siteManager.id)!;
      await setProjectMemberCapabilities(context, {
        projectId: p1,
        memberId: member.id,
        capabilities: [...member.capabilities, C.DOCUMENTS_SHARE],
      });
    });
    const actions = await database.asService(async (db) =>
      (await db.select({ action: auditEvents.action }).from(auditEvents).where(eq(auditEvents.organizationId, orgId)))
        .map((row) => row.action),
    );
    expect(actions).toContain('project_member.added');
    expect(actions).toContain('project_member.capabilities_changed');

    const events = await database.asService(async (db) =>
      db.select().from(domainEvents).where(eq(domainEvents.organizationId, orgId)),
    );
    const siteMemberEvents = events.filter(
      (event) => (event.payload as { userId?: string }).userId === siteManager.id,
    );
    expect(siteMemberEvents.map((event) => event.eventType).sort()).toEqual([
      'project_team.member.added',
      'project_team.member.capabilities_changed',
    ]);
    for (const event of siteMemberEvents) {
      expect(event.projectId).toBe(p1);
      expect(event.entityType).toBe('project_member');
      expect(event.actorType).toBe('internal');
      expect(event.actorUserId).toBe(userA.id);
      expect(event.payload).toEqual({ projectId: p1, memberId: event.entityId, userId: siteManager.id });
    }
  });

  it('emits deactivated / reactivated domain events', async () => {
    const { userA, orgId, p1, siteManager } = await scenario();
    await database.asUser(userA.id, async (tx) => {
      const context = await contextFor(tx, userA.id, orgId);
      const member = (await listProjectTeam(context, p1)).find((row) => row.userId === siteManager.id)!;
      await setProjectMemberStatus(context, { projectId: p1, memberId: member.id, active: false });
      await setProjectMemberStatus(context, { projectId: p1, memberId: member.id, active: true });
    });
    const types = await database.asService(async (db) =>
      (await db.select().from(domainEvents).where(eq(domainEvents.organizationId, orgId)))
        .filter((event) => (event.payload as { userId?: string }).userId === siteManager.id)
        .map((event) => event.eventType),
    );
    expect(types).toEqual(
      expect.arrayContaining(['project_team.member.deactivated', 'project_team.member.reactivated']),
    );
  });
});
