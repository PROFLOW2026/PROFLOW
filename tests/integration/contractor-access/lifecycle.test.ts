import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  auditEvents,
  contractorGrants,
  contractorPrincipals,
  domainEvents,
  externalPrincipalTokens,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import {
  ContractorPasswordPolicyError,
  activateContractorAccount,
  changeContractorPassword,
  getContractorAccessOverview,
  grantContractorAccess,
  inspectContractorToken,
  inviteContractor,
  issueContractorPasswordReset,
  loadExternalContext,
  reissueContractorInvite,
  requestContractorPasswordReset,
  resetContractorPassword,
  revokeContractorGrant,
  revokeContractorSessions,
  setContractorAccountDisabled,
  signInContractor,
  updateContractorGrantCapabilities,
  updateContractorProfile,
} from '@/modules/contractor-access';
import { addProjectMember, PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import { AuthorizationError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES as X, EXTERNAL_GRANT_TEMPLATES } from '@/shared/external';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, createProjectAs, orgContextFor } from '@tests/setup/dg-fixtures';
import { createFakeContractorAuth, loadContractorContext, type FakeContractorAuth } from '@tests/setup/dg-fixtures-external';
import { provisionTwoTenants } from '../projects/setup';

const STRONG = 'Bricks&Mortar2026';

function tokenFrom(path: string): string {
  return new URL(path, 'https://pf.test').searchParams.get('token')!;
}

describe('contractor account lifecycle (Track C)', () => {
  let database: TestDatabase;
  let auth: FakeContractorAuth;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    auth = createFakeContractorAuth();
  });

  async function scenario() {
    const { orgA, userA, orgB, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Mall');
    const { vendorId, agreementId } = await database.asService(async (db) => {
      const [vendor] = await db
        .insert(vendors)
        .values({ organizationId: orgId, name: 'Volt Electric', type: 'subcontractor' })
        .returning({ id: vendors.id });
      const [agreement] = await db
        .insert(subcontractAgreements)
        .values({
          organizationId: orgId,
          vendorId: vendor!.id,
          projectId,
          title: 'Electrical works',
          status: 'active',
          originalAmount: '250000',
          currency: 'ILS',
        })
        .returning({ id: subcontractAgreements.id });
      return { vendorId: vendor!.id, agreementId: agreement!.id };
    });
    const asOwner = <T>(fn: (ctx: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(userA.id, async (tx) => fn(await orgContextFor(tx, userA.id, orgId)));
    return { orgId, orgB, userA, userB, projectId, otherProjectId, vendorId, agreementId, asOwner };
  }

  async function invite(s: Awaited<ReturnType<typeof scenario>>, overrides: Partial<Parameters<typeof inviteContractor>[2]> = {}) {
    return s.asOwner((ctx) =>
      inviteContractor(ctx, { auth }, {
        projectId: s.projectId,
        vendorId: s.vendorId,
        subcontractAgreementId: s.agreementId,
        template: 'site_contractor',
        displayName: 'Dana Cohen',
        username: 'dana.volt',
        locale: 'he-IL',
        ...overrides,
      }),
    );
  }

  const svc = () => ({ db: database.db, auth });

  it('invite -> activate -> sign in -> scoped external context', async () => {
    const s = await scenario();
    const invited = await invite(s);
    expect(invited.username).toBe('dana.volt');
    expect(invited.activationPath).toMatch(/^\/en\/contractor\/activate\?token=/);

    const [principal] = await database.asService((db) =>
      db.select().from(contractorPrincipals).where(eq(contractorPrincipals.id, invited.principalId)),
    );
    expect(principal).toMatchObject({
      principalKind: 'contractor',
      status: 'invited',
      email: 'dana.volt@contractors.pf.internal',
      homeOrganizationId: s.orgId,
    });
    // Only the hash is stored.
    const token = tokenFrom(invited.activationPath);
    const tokens = await database.asService((db) =>
      db.select().from(externalPrincipalTokens).where(eq(externalPrincipalTokens.principalId, invited.principalId)),
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.tokenHash).not.toContain(token);

    // Not usable before activation.
    expect(await signInContractor(svc(), { username: 'dana.volt', password: STRONG, ipHash: null })).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });

    expect(await inspectContractorToken(svc(), token, 'invite')).toMatchObject({ ok: true, username: 'dana.volt' });
    await expect(
      activateContractorAccount(svc(), { token, password: 'short', confirmation: 'short' }),
    ).rejects.toBeInstanceOf(ContractorPasswordPolicyError);
    await expect(
      activateContractorAccount(svc(), { token, password: 'dana.volt-Secret1', confirmation: 'dana.volt-Secret1' }),
    ).rejects.toBeInstanceOf(ContractorPasswordPolicyError);
    expect(await activateContractorAccount(svc(), { token, password: STRONG, confirmation: STRONG })).toMatchObject({
      ok: true,
      principalId: invited.principalId,
    });
    // Single use.
    expect(await activateContractorAccount(svc(), { token, password: STRONG, confirmation: STRONG })).toEqual({
      ok: false,
      reason: 'used',
    });

    const signedIn = await signInContractor(svc(), { username: 'DANA.VOLT', password: STRONG, ipHash: 'ip-1' });
    expect(signedIn).toMatchObject({ ok: true, principalId: invited.principalId });

    const authUserId = principal!.authUserId!;
    const ctx = await loadContractorContext(database, { authUser: { id: authUserId, email: principal!.email } });
    expect(ctx.grants).toHaveLength(1);
    expect(ctx.grants[0]).toMatchObject({
      organizationId: s.orgId,
      vendorId: s.vendorId,
      projectId: s.projectId,
      subcontractAgreementId: s.agreementId,
    });
    expect([...ctx.grants[0]!.capabilities].sort()).toEqual([...EXTERNAL_GRANT_TEMPLATES.site_contractor].sort());
    expect(ctx.grants[0]!.capabilities.has(X.CLAIM_SUBMIT)).toBe(false);
    expect(ctx.locale).toBe('he-IL');

    const events = await database.asService((db) =>
      db.select({ type: domainEvents.eventType }).from(domainEvents).where(eq(domainEvents.organizationId, s.orgId)),
    );
    expect(events.map((e) => e.type).sort()).toEqual(
      ['external.grant.created', 'external.principal.activated', 'external.principal.invited'].sort(),
    );
    const activatedAudit = await database.asService((db) =>
      db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.action, 'external_principal.activated'), eq(auditEvents.entityId, invited.principalId))),
    );
    expect(activatedAudit[0]!.metadata).toMatchObject({ actor: { type: 'external', principalId: invited.principalId } });
  });

  it('rate limits sign-in per username and locks the account after repeated failures', async () => {
    const s = await scenario();
    const invited = await invite(s);
    await activateContractorAccount(svc(), { token: tokenFrom(invited.activationPath), password: STRONG, confirmation: STRONG });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await signInContractor(svc(), { username: 'dana.volt', password: 'Wrong-pass-123', ipHash: 'ip-1' })).toEqual({
        ok: false,
        reason: 'invalid_credentials',
      });
    }
    expect(await signInContractor(svc(), { username: 'dana.volt', password: STRONG, ipHash: 'ip-2' })).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
    // Unknown usernames are throttled the same way (no enumeration via throttling).
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInContractor(svc(), { username: 'ghost.user', password: 'x', ipHash: 'ip-3' });
    }
    expect(await signInContractor(svc(), { username: 'ghost.user', password: 'x', ipHash: 'ip-4' })).toEqual({
      ok: false,
      reason: 'rate_limited',
    });
  });

  it('supports multiple users per vendor, grant edits, revoke, reset, session revoke, disable / enable', async () => {
    const s = await scenario();
    const first = await invite(s);
    const second = await invite(s, { displayName: 'Avi Levi', username: 'avi.volt', template: 'read_only' });
    expect(first.principalId).not.toBe(second.principalId);
    for (const account of [first, second]) {
      await activateContractorAccount(svc(), { token: tokenFrom(account.activationPath), password: STRONG, confirmation: STRONG });
    }

    const overview = await s.asOwner((ctx) => getContractorAccessOverview(ctx, s.projectId));
    expect(overview.accounts.map((a) => a.username).sort()).toEqual(['avi.volt', 'dana.volt']);
    expect(overview.agreements.map((a) => a.title)).toEqual(['Electrical works']);

    const [secondPrincipal] = await database.asService((db) =>
      db.select().from(contractorPrincipals).where(eq(contractorPrincipals.id, second.principalId)),
    );
    const secondUser = { authUser: { id: secondPrincipal!.authUserId!, email: secondPrincipal!.email } };

    // Custom capability selection on the existing grant.
    await s.asOwner((ctx) =>
      updateContractorGrantCapabilities(ctx, {
        projectId: s.projectId,
        grantId: second.grantId,
        template: 'custom',
        capabilities: [X.TASK_WORK, X.DEFECT_WORK],
      }),
    );
    let ctx2 = await loadContractorContext(database, secondUser);
    expect([...ctx2.grants[0]!.capabilities].sort()).toEqual([X.DEFECT_WORK, X.PROJECT_VIEW, X.TASK_WORK].sort());

    // Second grant on another project for the same person (explicit scope), then revoke the first.
    await s.asOwner((ctx) =>
      grantContractorAccess(ctx, {
        principalId: second.principalId,
        projectId: s.otherProjectId,
        vendorId: s.vendorId,
        template: 'read_only',
      }),
    );
    ctx2 = await loadContractorContext(database, secondUser);
    expect(ctx2.grants.map((g) => g.projectId).sort()).toEqual([s.projectId, s.otherProjectId].sort());
    await s.asOwner((ctx) => revokeContractorGrant(ctx, { projectId: s.projectId, grantId: second.grantId, reason: 'done' }));
    ctx2 = await loadContractorContext(database, secondUser);
    expect(ctx2.grants.map((g) => g.projectId)).toEqual([s.otherProjectId]);

    // Forgot password flags the account; the home org issues a reset link.
    await requestContractorPasswordReset(svc(), { username: 'avi.volt', ipHash: null });
    const flagged = await s.asOwner((ctx) => getContractorAccessOverview(ctx, s.otherProjectId));
    expect(flagged.accounts.find((a) => a.principalId === second.principalId)!.passwordResetRequestedAt).not.toBeNull();
    const reset = await s.asOwner((ctx) =>
      issueContractorPasswordReset(ctx, { projectId: s.otherProjectId, principalId: second.principalId }),
    );
    const before = new Date(Date.now() - 10_000);
    const NEW = 'Concrete#Pour2027';
    expect(await resetContractorPassword(svc(), { token: tokenFrom(reset.resetPath), password: NEW, confirmation: NEW })).toMatchObject({
      ok: true,
    });
    expect(await signInContractor(svc(), { username: 'avi.volt', password: STRONG, ipHash: null })).toMatchObject({ ok: false });
    expect(await signInContractor(svc(), { username: 'avi.volt', password: NEW, ipHash: null })).toMatchObject({ ok: true });
    // Sessions from before the reset are rejected.
    expect(
      await loadExternalContext(database.db, { authUserId: secondUser.authUser.id, sessionAuthenticatedAt: before, fallbackLocale: 'en' }),
    ).toEqual({ ok: false, reason: 'session_revoked' });

    // Account page: profile + password change through the RLS-bound context.
    const own = await loadContractorContext(database, secondUser, { sessionAuthenticatedAt: new Date(Date.now() + 5_000) });
    await updateContractorProfile(own, { displayName: 'Avi L.', phone: '052-0000000', locale: 'ar' });
    await expect(
      changeContractorPassword(own, svc(), { currentPassword: 'nope', newPassword: STRONG, confirmation: STRONG }),
    ).rejects.toThrow();
    await changeContractorPassword(own, svc(), { currentPassword: NEW, newPassword: STRONG, confirmation: STRONG });
    const [afterProfile] = await database.asService((db) =>
      db.select().from(contractorPrincipals).where(eq(contractorPrincipals.id, second.principalId)),
    );
    expect(afterProfile).toMatchObject({ displayName: 'Avi L.', phone: '052-0000000', locale: 'ar' });

    // Revoke sessions explicitly.
    await s.asOwner((ctx) => revokeContractorSessions(ctx, { projectId: s.otherProjectId, principalId: second.principalId }));
    expect(
      await loadExternalContext(database.db, {
        authUserId: secondUser.authUser.id,
        sessionAuthenticatedAt: new Date(Date.now() - 5_000),
        fallbackLocale: 'en',
      }),
    ).toEqual({ ok: false, reason: 'session_revoked' });

    // Disable blocks sign-in and the session loader; enable restores.
    await s.asOwner((ctx) =>
      setContractorAccountDisabled(ctx, { auth }, { projectId: s.otherProjectId, principalId: second.principalId, disabled: true }),
    );
    expect(auth.users.get(secondUser.authUser.id)!.banned).toBe(true);
    expect(await signInContractor(svc(), { username: 'avi.volt', password: STRONG, ipHash: null })).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
    expect(
      await loadExternalContext(database.db, {
        authUserId: secondUser.authUser.id,
        sessionAuthenticatedAt: new Date(Date.now() + 5_000),
        fallbackLocale: 'en',
      }),
    ).toEqual({ ok: false, reason: 'inactive' });
    await s.asOwner((ctx) =>
      setContractorAccountDisabled(ctx, { auth }, { projectId: s.otherProjectId, principalId: second.principalId, disabled: false }),
    );
    expect(await signInContractor(svc(), { username: 'avi.volt', password: STRONG, ipHash: null })).toMatchObject({ ok: true });
  });

  it('re-issued invites invalidate earlier links; expired / unknown tokens are rejected', async () => {
    const s = await scenario();
    const invited = await invite(s);
    const again = await s.asOwner((ctx) =>
      reissueContractorInvite(ctx, { projectId: s.projectId, principalId: invited.principalId }),
    );
    expect(await inspectContractorToken(svc(), tokenFrom(invited.activationPath), 'invite')).toEqual({ ok: false, reason: 'used' });
    expect(await inspectContractorToken(svc(), tokenFrom(again.activationPath), 'invite')).toMatchObject({ ok: true });
    expect(await inspectContractorToken(svc(), 'A'.repeat(43), 'invite')).toEqual({ ok: false, reason: 'invalid' });
    const later = () => new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await inspectContractorToken({ db: database.db, now: later }, tokenFrom(again.activationPath), 'invite')).toEqual({
      ok: false,
      reason: 'expired',
    });
    // An invite token is not a reset token.
    expect(await inspectContractorToken(svc(), tokenFrom(again.activationPath), 'password_reset')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });

  it('enforces project capabilities, the financial-grant rule and the DB guard', async () => {
    const s = await scenario();
    const worker = await addOrgMember(database, s.orgId, 'worker');
    const inviter = await addOrgMember(database, s.orgId, 'inviter');
    await s.asOwner((ctx) =>
      addProjectMember(ctx, {
        projectId: s.projectId,
        userId: inviter.id,
        capabilities: [C.PROJECT_VIEW, C.CONTRACTOR_INVITE, C.EXTERNAL_ACCESS_MANAGE],
      }),
    );
    const asUser = <T>(userId: string, fn: (ctx: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, s.orgId)));
    const base = {
      projectId: s.projectId,
      vendorId: s.vendorId,
      subcontractAgreementId: s.agreementId,
      displayName: 'X',
    };

    await expect(
      asUser(worker.id, (ctx) => inviteContractor(ctx, { auth }, { ...base, username: 'w.one', template: 'read_only' })),
    ).rejects.toBeInstanceOf(AuthorizationError);
    await expect(asUser(worker.id, (ctx) => getContractorAccessOverview(ctx, s.projectId))).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    // Inviter without contract.financial.view cannot hand out financial external capabilities...
    await expect(
      asUser(inviter.id, (ctx) => inviteContractor(ctx, { auth }, { ...base, username: 'fin.one', template: 'claims_only' })),
    ).rejects.toMatchObject({ messageKey: 'contractorAccess.errors.financial_requires_financial_grantor' });
    // ...nor vendor-wide access...
    await expect(
      asUser(inviter.id, (ctx) =>
        inviteContractor(ctx, { auth }, { ...base, username: 'wide.one', template: 'read_only', allProjects: true }),
      ),
    ).rejects.toMatchObject({ messageKey: 'contractorAccess.errors.vendor_wide_requires_org_admin' });
    // ...nor access on a project where they hold nothing.
    await expect(
      asUser(inviter.id, (ctx) =>
        inviteContractor(ctx, { auth }, { ...base, projectId: s.otherProjectId, subcontractAgreementId: null, username: 'p2.one', template: 'read_only' }),
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    // Operational invite works; failed invites left no auth users behind.
    const ok = await asUser(inviter.id, (ctx) => inviteContractor(ctx, { auth }, { ...base, username: 'ops.one', template: 'site_contractor' }));
    expect(auth.users.size).toBe(1);

    // RESTRICTIVE DB guard: a plain member cannot write contractor grants directly.
    await expect(
      database.asUser(worker.id, (tx) =>
        tx.insert(contractorGrants).values({
          organizationId: s.orgId,
          principalId: ok.principalId,
          portalKind: 'contractor',
          vendorId: s.vendorId,
          projectId: s.projectId,
          scopes: [X.PROJECT_VIEW, X.CLAIM_SUBMIT],
        }),
      ),
    ).rejects.toThrow();
    await expect(
      database.asUser(worker.id, (tx) =>
        tx.update(contractorGrants).set({ scopes: [X.PROJECT_VIEW, X.PAYMENT_VIEW] }).where(eq(contractorGrants.id, ok.grantId)),
      ),
    ).resolves.toBeDefined();
    const [unchanged] = await database.asService((db) => db.select().from(contractorGrants).where(eq(contractorGrants.id, ok.grantId)));
    expect(unchanged!.scopes).not.toContain(X.PAYMENT_VIEW);
    // Non-ext keys are rejected by the CHECK even for the service role.
    await expect(
      database.asService((db) =>
        db.update(contractorGrants).set({ scopes: ['expenses.manage'] }).where(eq(contractorGrants.id, ok.grantId)),
      ),
    ).rejects.toThrow();
  });

  it('another organization cannot see or manage the contractor account', async () => {
    const s = await scenario();
    const invited = await invite(s);
    const projectB = await createProjectAs(database, s.userB.id, s.orgB.organization.id, 'B tower');
    await expect(
      database.asUser(s.userB.id, async (tx) => {
        const ctx = await orgContextFor(tx, s.userB.id, s.orgB.organization.id);
        return issueContractorPasswordReset(ctx, { projectId: projectB, principalId: invited.principalId });
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const visible = await database.asUser(s.userB.id, (tx) =>
      tx.select({ id: contractorPrincipals.id }).from(contractorPrincipals),
    );
    expect(visible).toHaveLength(0);
  });
});
