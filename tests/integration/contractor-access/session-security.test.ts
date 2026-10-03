import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  auditEvents,
  contractorGrants,
  contractorPrincipals,
  expenses,
  organizationMemberships,
  organizations,
  projects,
  subcontractAgreements,
  subcontractWorkLines,
  vendors,
} from '@drizzle/schema';
import { listExternalDirectory, loadExternalContext, recordExternalAuditEvent } from '@/modules/contractor-access';
import { resolveOrgContext } from '@/modules/tenancy';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { EXTERNAL_CAPABILITIES as X, requireExternalScope } from '@/shared/external';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createProjectAs } from '@tests/setup/dg-fixtures';
import { createContractorAccount, loadContractorContext } from '@tests/setup/dg-fixtures-external';
import { provisionTwoTenants } from '../projects/setup';

describe('contractor sessions - RLS-bound external context (0156)', () => {
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

  async function scenario() {
    const { orgA, userA, orgB, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const otherOrgProjectId = await createProjectAs(database, userB.id, orgB.organization.id, 'Elsewhere');
    const contractorA = await createContractorAccount(database, {
      organizationId: orgId,
      projectId,
      label: 'a',
      narrowToProject: true,
    });
    const contractorB = await createContractorAccount(database, {
      organizationId: orgId,
      projectId,
      label: 'b',
      narrowToProject: true,
    });
    const lines = await database.asService(async (db) => {
      const ids: string[] = [];
      for (const contractor of [contractorA, contractorB]) {
        const [line] = await db
          .insert(subcontractWorkLines)
          .values({
            organizationId: orgId,
            agreementId: contractor.agreementId!,
            projectId,
            vendorId: contractor.vendorId,
            description: 'Work',
          })
          .returning({ id: subcontractWorkLines.id });
        ids.push(line!.id);
      }
      return { A: ids[0]!, B: ids[1]! };
    });
    return { orgId, orgB, userA, projectId, otherOrgProjectId, contractorA, contractorB, lines };
  }

  it('loads only the principal own live grants and binds ctx.db to the principal (A vs B)', async () => {
    const { orgId, projectId, contractorA, contractorB, lines } = await scenario();
    const ctxA = await loadContractorContext(database, contractorA);
    expect(ctxA.principalId).toBe(contractorA.principalId);
    expect(ctxA.grants.map((g) => g.grantId)).toEqual([contractorA.grantId]);

    const visible = await ctxA.db.select({ id: subcontractWorkLines.id }).from(subcontractWorkLines);
    expect(visible.map((row) => row.id)).toEqual([lines.A]);

    const target = { organizationId: orgId, projectId, vendorId: contractorA.vendorId, subcontractAgreementId: contractorA.agreementId };
    expect(requireExternalScope(ctxA, target, X.PROJECT_VIEW).grantId).toBe(contractorA.grantId);
    expect(() =>
      requireExternalScope(ctxA, { ...target, vendorId: contractorB.vendorId }, X.PROJECT_VIEW),
    ).toThrow();

    // Explicit transaction keeps the same identity.
    const inTx = await ctxA.db.transaction(async (tx) =>
      tx.select({ id: subcontractWorkLines.id }).from(subcontractWorkLines),
    );
    expect(inTx.map((row) => row.id)).toEqual([lines.A]);

    const ownGrants = await ctxA.db.select({ id: contractorGrants.id }).from(contractorGrants);
    expect(ownGrants.map((row) => row.id)).toEqual([contractorA.grantId]);
    const principals = await ctxA.db.select({ id: contractorPrincipals.id }).from(contractorPrincipals);
    expect(principals.map((row) => row.id)).toEqual([contractorA.principalId]);
  });

  it('external principal has no memberships, cannot resolve an org context and reads no general org tables', async () => {
    const { orgId, contractorA } = await scenario();
    const ctx = await loadContractorContext(database, contractorA);

    const memberships = await database.asService((db) =>
      db.select().from(organizationMemberships).where(eq(organizationMemberships.userId, contractorA.authUser.id)),
    );
    expect(memberships).toHaveLength(0);

    await expect(
      database.asUser(contractorA.authUser.id, (tx) =>
        resolveOrgContext(tx, { userId: contractorA.authUser.id, organizationId: orgId, locale: 'en' }),
      ),
    ).rejects.toThrow();

    expect(await ctx.db.select({ id: organizations.id }).from(organizations)).toHaveLength(0);
    expect(await ctx.db.select({ id: projects.id }).from(projects)).toHaveLength(0);
    expect(await ctx.db.select({ id: vendors.id }).from(vendors)).toHaveLength(0);
    expect(await ctx.db.select({ id: expenses.id }).from(expenses)).toHaveLength(0);
    expect(await ctx.db.select({ id: subcontractAgreements.id }).from(subcontractAgreements)).toHaveLength(0);
    expect(await ctx.db.select({ id: organizationMemberships.id }).from(organizationMemberships)).toHaveLength(0);
    expect(await ctx.db.select({ id: auditEvents.id }).from(auditEvents)).toHaveLength(0);
  });

  it('a contractor auth user can never be given an organization membership (DB trigger)', async () => {
    const { orgId, contractorA } = await scenario();
    await expect(
      database.asService((db) =>
        db.insert(organizationMemberships).values({ organizationId: orgId, userId: contractorA.authUser.id, status: 'active' }),
      ),
    ).rejects.toThrow();
  });

  it('disable, revoke and session revocation cut access off immediately', async () => {
    const { contractorA, lines } = await scenario();

    await database.asService((db) =>
      db.update(contractorGrants).set({ status: 'revoked', revokedAt: new Date() }).where(eq(contractorGrants.id, contractorA.grantId)),
    );
    const revoked = await loadContractorContext(database, contractorA);
    expect(revoked.grants).toHaveLength(0);
    expect(await revoked.db.select({ id: subcontractWorkLines.id }).from(subcontractWorkLines)).toHaveLength(0);
    await database.asService((db) =>
      db.update(contractorGrants).set({ status: 'active', revokedAt: null }).where(eq(contractorGrants.id, contractorA.grantId)),
    );

    const before = new Date(Date.now() - 60_000);
    await database.asService((db) =>
      db.update(contractorPrincipals).set({ sessionsRevokedAt: new Date() }).where(eq(contractorPrincipals.id, contractorA.principalId)),
    );
    const stale = await loadExternalContext(database.db, {
      authUserId: contractorA.authUser.id,
      sessionAuthenticatedAt: before,
      fallbackLocale: 'en',
    });
    expect(stale).toEqual({ ok: false, reason: 'session_revoked' });
    const fresh = await loadContractorContext(database, contractorA, { sessionAuthenticatedAt: new Date(Date.now() + 1000) });
    expect((await fresh.db.select({ id: subcontractWorkLines.id }).from(subcontractWorkLines)).map((r) => r.id)).toEqual([lines.A]);

    await database.asService((db) =>
      db.update(contractorPrincipals).set({ status: 'disabled', disabledAt: new Date() }).where(eq(contractorPrincipals.id, contractorA.principalId)),
    );
    const disabled = await loadExternalContext(database.db, {
      authUserId: contractorA.authUser.id,
      sessionAuthenticatedAt: new Date(Date.now() + 1000),
      fallbackLocale: 'en',
    });
    expect(disabled).toEqual({ ok: false, reason: 'inactive' });
    // Even a hand-built context gets nothing: app.external_principal_id() is null for disabled accounts.
    expect(await fresh.db.select({ id: subcontractWorkLines.id }).from(subcontractWorkLines)).toHaveLength(0);
  });

  it('an internal user is not an external principal', async () => {
    const { userA } = await scenario();
    const result = await loadExternalContext(database.db, {
      authUserId: userA.id,
      sessionAuthenticatedAt: new Date(),
      fallbackLocale: 'en',
    });
    expect(result).toEqual({ ok: false, reason: 'not_contractor' });
  });

  it('directory exposes safe names for own grants only; external audit is principal-bound', async () => {
    const { orgId, orgB, projectId, contractorA, contractorB } = await scenario();
    const ctxA = await loadContractorContext(database, contractorA);
    const directory = await listExternalDirectory(ctxA);
    expect(directory).toHaveLength(1);
    expect(directory[0]).toMatchObject({
      organizationId: orgId,
      vendorId: contractorA.vendorId,
      projectId,
      projectName: 'Tower',
      subcontractAgreementId: contractorA.agreementId,
    });

    await recordExternalAuditEvent(ctxA, {
      organizationId: orgId,
      action: AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_PROFILE_UPDATED,
      entityType: 'external_principal',
      entityId: contractorA.principalId,
    });
    const written = await database.asService((db) =>
      db.select().from(auditEvents).where(eq(auditEvents.entityId, contractorA.principalId)),
    );
    expect(written).toHaveLength(1);
    expect(written[0]!.actorUserId).toBeNull();
    expect(written[0]!.metadata).toMatchObject({ actor: { type: 'external', principalId: contractorA.principalId } });

    // Spoofing another principal, or an org without a grant, is rejected by RLS.
    await expect(
      ctxA.db.insert(auditEvents).values({
        organizationId: orgId,
        actorUserId: null,
        action: 'external_principal.profile_updated',
        entityType: 'external_principal',
        metadata: { actor: { type: 'external', principalId: contractorB.principalId } },
      }),
    ).rejects.toThrow();
    await expect(
      recordExternalAuditEvent(ctxA, {
        organizationId: orgB.organization.id,
        action: AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_PROFILE_UPDATED,
        entityType: 'external_principal',
        entityId: contractorA.principalId,
      }),
    ).rejects.toThrow();
  });

  it('own-profile update goes through the definer function only', async () => {
    const { contractorA } = await scenario();
    const ctx = await loadContractorContext(database, contractorA);
    await ctx.db.execute(sql`select app.external_update_own_profile(${'Dana'}, ${'050-1234567'}, ${'he-IL'})`);
    const [row] = await database.asService((db) =>
      db.select().from(contractorPrincipals).where(eq(contractorPrincipals.id, contractorA.principalId)),
    );
    expect(row).toMatchObject({ displayName: 'Dana', phone: '050-1234567', locale: 'he-IL' });
    // Direct UPDATE of the own row (e.g. status / username) is not allowed for the principal.
    await ctx.db.update(contractorPrincipals).set({ status: 'active', phone: 'x' }).where(eq(contractorPrincipals.id, contractorA.principalId));
    const [after] = await database.asService((db) =>
      db.select().from(contractorPrincipals).where(eq(contractorPrincipals.id, contractorA.principalId)),
    );
    expect(after!.phone).toBe('050-1234567');
  });
});
