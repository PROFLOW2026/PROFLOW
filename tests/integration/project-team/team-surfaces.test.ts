import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import {
  PROJECT_CAPABILITIES as C,
  addProjectMember,
  hasActiveProjectMembership,
  listMyProjectMemberships,
  listMyProjectMembershipsOrEmpty,
  listProjectTeam,
  loadProjectTeamPage,
  setProjectMemberStatus,
} from '@/modules/project-team';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, createProjectAs, orgContextFor } from '@tests/setup/dg-fixtures';
import type { TestUser } from '@tests/setup/fixtures';
import { provisionTwoTenants } from '../projects/setup';

/**
 * Server actions + RSC guard run against PGlite: the session is replaced by a runner that opens
 * an RLS-bound transaction for the "signed-in" user, exactly like `withOrgContext` does.
 */
const session = vi.hoisted(() => ({
  run: null as null | ((fn: (context: OrgContext) => Promise<unknown>) => Promise<unknown>),
}));

vi.mock('@/shared/auth/session', () => ({
  withOrgContext: (fn: (context: OrgContext) => Promise<unknown>) => {
    if (!session.run) throw new Error('No signed-in test user');
    return session.run(fn);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl');
  const messages = JSON.parse(
    readFileSync(path.resolve(process.cwd(), 'src/locales/en/projectTeam.json'), 'utf8'),
  ) as Record<string, unknown>;
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: 'en', messages: { projectTeam: messages }, namespace: namespace as 'projectTeam' }),
  };
});

const actions = await import('@/modules/project-team/ui/actions');
const { requireProjectCapabilityPage } = await import('@/modules/project-team/server');

describe('project team surfaces (actions, page data, my memberships, page guard)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    session.run = null;
  });

  function signIn(user: TestUser, organizationId: string): void {
    session.run = (fn) =>
      database.asUser(user.id, async (tx) => fn(await orgContextFor(tx, user.id, organizationId)));
  }

  async function as<T>(user: TestUser, organizationId: string, fn: (context: OrgContext) => Promise<T>): Promise<T> {
    return database.asUser(user.id, async (tx) => fn(await orgContextFor(tx, user.id, organizationId)));
  }

  async function scenario() {
    const { orgA, orgB, userA: owner, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const p1 = await createProjectAs(database, owner.id, orgId, 'Tower One');
    const p2 = await createProjectAs(database, owner.id, orgId, 'Tower Two');
    const pmOps = await addOrgMember(database, orgId, 'pm-ops');
    const accountant = await addOrgMember(database, orgId, 'acct');
    const teamLead = await addOrgMember(database, orgId, 'teamlead');
    const site = await addOrgMember(database, orgId, 'site');
    const newcomer = await addOrgMember(database, orgId, 'newcomer');
    const outsider = await addOrgMember(database, orgId, 'outsider');

    await as(owner, orgId, async (context) => {
      await addProjectMember(context, { projectId: p1, userId: pmOps.id, templateKey: 'project_manager_operational', title: 'PM' });
      await addProjectMember(context, { projectId: p2, userId: pmOps.id, templateKey: 'viewer' });
      await addProjectMember(context, { projectId: p1, userId: accountant.id, templateKey: 'project_accountant' });
      await addProjectMember(context, { projectId: p1, userId: site.id, templateKey: 'site_manager' });
      await addProjectMember(context, {
        projectId: p1,
        userId: teamLead.id,
        capabilities: [C.PROJECT_TEAM_MANAGE, C.TASKS_MANAGE],
      });
    });
    return { orgId, orgB, userB, owner, p1, p2, pmOps, accountant, teamLead, site, newcomer, outsider };
  }

  describe('listMyProjectMemberships', () => {
    it('lists only the active memberships of the signed-in user, with access flags', async () => {
      const { orgId, owner, p1, p2, pmOps, accountant, site, outsider, teamLead } = await scenario();

      const mine = await as(pmOps, orgId, listMyProjectMemberships);
      expect(mine.map((row) => row.projectName).sort()).toEqual(['Tower One', 'Tower Two']);
      expect(mine.find((row) => row.projectId === p1)).toMatchObject({
        title: 'PM',
        templateKey: 'project_manager_operational',
        hasFinancialAccess: false,
        canManageTeam: false,
      });
      const [leadRow] = await as(teamLead, orgId, listMyProjectMemberships);
      expect(leadRow).toMatchObject({ projectId: p1, canManageTeam: true, hasFinancialAccess: false });

      const accountantRows = await as(accountant, orgId, listMyProjectMemberships);
      expect(accountantRows).toHaveLength(1);
      expect(accountantRows[0]!.hasFinancialAccess).toBe(true);

      expect(await as(outsider, orgId, listMyProjectMemberships)).toEqual([]);
      expect(await as(outsider, orgId, hasActiveProjectMembership)).toBe(false);
      expect(await as(site, orgId, hasActiveProjectMembership)).toBe(true);

      // Deactivated memberships and archived projects disappear from "my projects".
      await as(owner, orgId, async (context) => {
        const team = await listProjectTeam(context, p1);
        const member = team.find((row) => row.userId === site.id)!;
        await setProjectMemberStatus(context, { projectId: p1, memberId: member.id, active: false });
      });
      expect(await as(site, orgId, listMyProjectMemberships)).toEqual([]);
      expect(await as(site, orgId, listMyProjectMembershipsOrEmpty)).toEqual([]);

      await database.asService((db) => db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, p2)));
      const afterArchive = await as(pmOps, orgId, listMyProjectMemberships);
      expect(afterArchive.map((row) => row.projectId)).toEqual([p1]);
    });

    it('never shows another tenant memberships', async () => {
      const { orgB, userB } = await scenario();
      expect(await as(userB, orgB.organization.id, listMyProjectMemberships)).toEqual([]);
    });
  });

  describe('loadProjectTeamPage', () => {
    it('gives a team manager the candidates (org members not yet on the team) and their own capabilities', async () => {
      const { orgId, p1, teamLead, newcomer, outsider, pmOps, owner } = await scenario();
      const data = await as(teamLead, orgId, (context) => loadProjectTeamPage(context, p1));
      expect(data.viewer.canManage).toBe(true);
      expect(data.viewer.isOrgAdmin).toBe(false);
      expect(data.viewer.capabilities).toContain(C.PROJECT_TEAM_MANAGE);
      expect(data.viewer.capabilities).not.toContain(C.CLAIM_VIEW);
      const candidateIds = data.candidates.map((candidate) => candidate.userId);
      expect(candidateIds).toEqual(expect.arrayContaining([newcomer.id, outsider.id, owner.id]));
      expect(candidateIds).not.toContain(pmOps.id);
      expect(data.members).toHaveLength(4);
      expect(data.templates.length).toBeGreaterThan(0);
    });

    it('is read-only for members without project_team.manage and closed to non-members', async () => {
      const { orgId, p1, p2, site, outsider } = await scenario();
      const data = await as(site, orgId, (context) => loadProjectTeamPage(context, p1));
      expect(data.viewer.canManage).toBe(false);
      expect(data.candidates).toEqual([]);

      await expect(as(outsider, orgId, (context) => loadProjectTeamPage(context, p1))).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      await expect(as(site, orgId, (context) => loadProjectTeamPage(context, p2))).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
  });

  describe('server actions', () => {
    it('adds a member and surfaces anti-escalation with the blocking capabilities', async () => {
      const { orgId, p1, teamLead, newcomer, outsider } = await scenario();
      signIn(teamLead, orgId);

      const refused = await actions.addProjectMemberAction({
        projectId: p1,
        userId: newcomer.id,
        capabilities: [C.CLAIM_CERTIFY],
      });
      expect(refused.ok).toBe(false);
      expect(refused.blockedCapabilities).toEqual(expect.arrayContaining([C.CLAIM_CERTIFY]));
      expect(refused.error).toContain('Certify progress claims');

      const ok = await actions.addProjectMemberAction({
        projectId: p1,
        userId: newcomer.id,
        title: 'Foreman',
        capabilities: [C.TASKS_MANAGE],
      });
      expect(ok).toEqual({ ok: true });

      const duplicate = await actions.addProjectMemberAction({
        projectId: p1,
        userId: newcomer.id,
        capabilities: [C.TASKS_VIEW],
      });
      expect(duplicate.ok).toBe(false);
      expect(duplicate.error).toMatch(/already on the project team/);

      signIn(outsider, orgId);
      const denied = await actions.addProjectMemberAction({
        projectId: p1,
        userId: outsider.id,
        capabilities: [C.TASKS_VIEW],
      });
      expect(denied.ok).toBe(false);
      expect(denied.error).toMatch(/not allowed to manage/);
    });

    it('refuses to strip or deactivate authority the actor lacks, and allows in-authority edits', async () => {
      const { orgId, p1, owner, teamLead, accountant, site } = await scenario();
      const team = await as(owner, orgId, (context) => listProjectTeam(context, p1));
      const accountantMember = team.find((member) => member.userId === accountant.id)!;
      const siteMember = team.find((member) => member.userId === site.id)!;
      signIn(teamLead, orgId);

      const strip = await actions.setProjectMemberCapabilitiesAction({
        projectId: p1,
        memberId: accountantMember.id,
        capabilities: [C.PROJECT_VIEW],
      });
      expect(strip.ok).toBe(false);
      expect(strip.error).toMatch(/cannot remove capabilities/i);
      expect(strip.blockedCapabilities?.length).toBeGreaterThan(0);

      const deactivate = await actions.setProjectMemberStatusAction({
        projectId: p1,
        memberId: accountantMember.id,
        active: false,
      });
      expect(deactivate.ok).toBe(false);
      expect(deactivate.error).toMatch(/cannot deactivate/i);

      // The team lead holds tasks.manage + project.view; the site manager keeps the rest untouched.
      signIn(owner, orgId);
      const ownerEdit = await actions.setProjectMemberCapabilitiesAction({
        projectId: p1,
        memberId: siteMember.id,
        capabilities: [...siteMember.capabilities, C.DOCUMENTS_SHARE],
        title: 'Senior site manager',
      });
      expect(ownerEdit).toEqual({ ok: true });
      const after = await as(owner, orgId, (context) => listProjectTeam(context, p1));
      const updated = after.find((member) => member.id === siteMember.id)!;
      expect(updated.capabilities).toContain(C.DOCUMENTS_SHARE);
      expect(updated.title).toBe('Senior site manager');

      const off = await actions.setProjectMemberStatusAction({ projectId: p1, memberId: siteMember.id, active: false });
      expect(off).toEqual({ ok: true });
      const on = await actions.setProjectMemberStatusAction({ projectId: p1, memberId: siteMember.id, active: true });
      expect(on).toEqual({ ok: true });
    });

    it('rejects an empty capability set', async () => {
      const { orgId, p1, owner, site } = await scenario();
      const team = await as(owner, orgId, (context) => listProjectTeam(context, p1));
      signIn(owner, orgId);
      const result = await actions.setProjectMemberCapabilitiesAction({
        projectId: p1,
        memberId: team.find((member) => member.userId === site.id)!.id,
        capabilities: [],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/at least one capability/);
    });
  });

  describe('requireProjectCapabilityPage', () => {
    it('lets members with the capability in and renders notFound for everyone else', async () => {
      const { orgId, orgB, userB, p1, p2, site, outsider, owner } = await scenario();

      signIn(site, orgId);
      const access = await requireProjectCapabilityPage(p1, C.DAILY_LOG_MANAGE);
      expect(access.projectName).toBe('Tower One');
      expect(access.has(C.CLAIM_VIEW)).toBe(false);
      await expect(requireProjectCapabilityPage(p1, C.CLAIM_VIEW)).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(
        requireProjectCapabilityPage(p1, [C.CLAIM_VIEW, C.DEFECTS_MANAGE], { mode: 'any' }),
      ).resolves.toBeTruthy();
      await expect(requireProjectCapabilityPage(p2, C.PROJECT_VIEW)).rejects.toThrow('NEXT_NOT_FOUND');
      await expect(requireProjectCapabilityPage('not-a-uuid', C.PROJECT_VIEW)).rejects.toThrow('NEXT_NOT_FOUND');

      signIn(outsider, orgId);
      await expect(requireProjectCapabilityPage(p1, C.PROJECT_VIEW)).rejects.toThrow('NEXT_NOT_FOUND');

      signIn(owner, orgId);
      const ownerAccess = await requireProjectCapabilityPage(p2, C.PROJECT_BUDGET_MANAGE);
      expect(ownerAccess.has(C.CLAIM_CERTIFY)).toBe(true);

      // Org B admin holds project_team.admin in B, but A's project does not exist there.
      signIn(userB, orgB.organization.id);
      await expect(requireProjectCapabilityPage(p1, C.PROJECT_VIEW)).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });
});
