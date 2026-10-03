import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { auditEvents, domainEvents, rfiAnswers, rfis } from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import {
  answerRfi,
  closeRfi,
  createContractorRfi,
  createRfi,
  getContractorRfi,
  getContractorRfiSummary,
  getRfi,
  listContractorRfis,
  listOverdueRfis,
  listProjectRfis,
  reopenRfi,
  startRfiReview,
  submitContractorRfi,
  submitRfi,
  updateContractorRfi,
  updateRfi,
} from '@/modules/rfi';
import { resolveEntityScope } from '@/shared/entity-access';
import type { OrgContext } from '@/shared/auth/context';
import { EXTERNAL_CAPABILITIES as X, type ExternalContext } from '@/shared/external';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  orgContextFor,
  type ContractorFixture,
} from '@tests/setup/dg-fixtures';
import { asContractor as asContractorUser, asInternal as asInternalUser } from '@tests/setup/dg-fixtures-rfi';
import { provisionTwoTenants } from '../projects/setup';

describe('RFI (Track KL, migration 0163)', () => {
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
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Other');
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const engineer = await addOrgMember(database, orgId, 'engineer');
    const viewer = await addOrgMember(database, orgId, 'viewer');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: engineer.id, templateKey: 'execution_engineer' });
      await addProjectMember(context, { projectId, userId: viewer.id, templateKey: 'viewer' });
    });
    return { orgId, userA, projectId, otherProjectId, contractorA, contractorB, engineer, viewer };
  }

  function asInternal<T>(userId: string, orgId: string, fn: (ctx: OrgContext) => Promise<T>) {
    return asInternalUser(database, userId, orgId, fn);
  }

  function asContractor<T>(contractor: ContractorFixture, orgId: string, fn: (ctx: ExternalContext) => Promise<T>) {
    return asContractorUser(database, contractor, orgId, fn);
  }

  it('runs the internal lifecycle with append-only answers and an audited reopen', async () => {
    const { orgId, projectId, contractorA, engineer } = await scenario();

    const created = await asInternal(engineer.id, orgId, (ctx) =>
      createRfi(ctx, {
        projectId,
        subject: 'Slab opening',
        question: 'Confirm opening size at grid C/4',
        subcontractAgreementId: contractorA.agreementId,
        dueDate: '2026-10-10',
        submit: true,
      }),
    );
    expect(created.number).toBe(1);
    expect(created.status).toBe('submitted');

    await asInternal(engineer.id, orgId, async (ctx) => {
      await startRfiReview(ctx, { rfiId: created.rfiId });
      const first = await answerRfi(ctx, { rfiId: created.rfiId, body: 'Opening is 600x600' });
      expect(first.status).toBe('answered');
      await closeRfi(ctx, { rfiId: created.rfiId });
      await expect(reopenRfi(ctx, { rfiId: created.rfiId })).rejects.toMatchObject({ code: 'validation_failed' });
      const reopened = await reopenRfi(ctx, { rfiId: created.rfiId, reason: 'Structural engineer changed size' });
      expect(reopened.status).toBe('under_review');
      expect(reopened.reopenCount).toBe(1);
      await answerRfi(ctx, { rfiId: created.rfiId, body: 'Opening is 800x600', close: true });

      const detail = await getRfi(ctx, created.rfiId);
      expect(detail.status).toBe('closed');
      expect(detail.vendorId).toBe(contractorA.vendorId);
      expect(detail.answers.map((a) => a.body)).toEqual(['Opening is 600x600', 'Opening is 800x600']);
      expect(detail.answers[1]!.supersedesAnswerId).toBe(detail.answers[0]!.id);
      expect(detail.history.map((h) => h.toStatus)).toEqual([
        'submitted',
        'under_review',
        'answered',
        'closed',
        'under_review',
        'answered',
        'closed',
      ]);
      expect(detail.history.find((h) => h.reason)?.reason).toBe('Structural engineer changed size');
    });

    await database.asService(async (db) => {
      const events = await db
        .select({ type: domainEvents.eventType, payload: domainEvents.payload })
        .from(domainEvents)
        .where(eq(domainEvents.entityId, created.rfiId));
      expect(events.map((e) => e.type).sort()).toEqual(
        [
          'rfi.request.answered',
          'rfi.request.answered',
          'rfi.request.closed',
          'rfi.request.closed',
          'rfi.request.reopened',
          'rfi.request.submitted',
        ].sort(),
      );
      const audits = await db
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityType, 'rfi'), eq(auditEvents.entityId, created.rfiId)));
      expect(audits.map((a) => a.action)).toContain('rfi.reopened');
      // official answers cannot be rewritten
      await expect(db.update(rfiAnswers).set({ body: 'tampered' })).rejects.toBeDefined();
      await expect(db.delete(rfiAnswers)).rejects.toBeDefined();
    });
  });

  it('freezes the question once submitted and rejects illegal transitions in the database', async () => {
    const { orgId, userA, projectId } = await scenario();
    const created = await asInternal(userA.id, orgId, (ctx) =>
      createRfi(ctx, { projectId, subject: 'Q', question: 'Original', submit: true }),
    );
    await asInternal(userA.id, orgId, async (ctx) => {
      await expect(updateRfi(ctx, { rfiId: created.rfiId, question: 'Changed' })).rejects.toMatchObject({
        code: 'validation_failed',
      });
      // triage stays editable
      const updated = await updateRfi(ctx, { rfiId: created.rfiId, priority: 'urgent', dueDate: '2026-11-01' });
      expect(updated.priority).toBe('urgent');
    });
    await database.asService(async (db) => {
      await expect(db.update(rfis).set({ question: 'Hack' }).where(eq(rfis.id, created.rfiId))).rejects.toBeDefined();
      await expect(db.update(rfis).set({ status: 'draft' }).where(eq(rfis.id, created.rfiId))).rejects.toBeDefined();
    });
  });

  it('requires rfi.manage to raise or answer; project.view can read', async () => {
    const { orgId, projectId, viewer, engineer } = await scenario();
    await asInternal(viewer.id, orgId, async (ctx) => {
      await expect(createRfi(ctx, { projectId, subject: 'S', question: 'Q' })).rejects.toMatchObject({
        code: 'authorization_denied',
      });
    });
    const created = await asInternal(engineer.id, orgId, (ctx) =>
      createRfi(ctx, { projectId, subject: 'S', question: 'Q', submit: true }),
    );
    await asInternal(viewer.id, orgId, async (ctx) => {
      const detail = await getRfi(ctx, created.rfiId);
      expect(detail.canManage).toBe(false);
      expect(detail.availableActions).toEqual([]);
      await expect(answerRfi(ctx, { rfiId: created.rfiId, body: 'x' })).rejects.toMatchObject({
        code: 'authorization_denied',
      });
      const list = await listProjectRfis(ctx, { projectId });
      expect(list.items).toHaveLength(1);
      // RLS backs the capability check
      await expect(
        ctx.db.insert(rfis).values({
          organizationId: orgId,
          projectId,
          subject: 'x',
          question: 'y',
          raisedActorType: 'internal',
          raisedByUserId: viewer.id,
        }),
      ).rejects.toBeDefined();
    });
  });

  it('isolates contractor A from contractor B and hides internal drafts', async () => {
    const { orgId, projectId, contractorA, contractorB, engineer } = await scenario();

    const own = await asContractor(contractorA, orgId, (ctx) =>
      createContractorRfi(ctx, { organizationId: orgId, projectId, subject: 'Rebar spacing', question: 'Confirm 15cm?' }),
    );
    const internalDraft = await asInternal(engineer.id, orgId, (ctx) =>
      createRfi(ctx, { projectId, subject: 'Internal', question: 'Draft for A', subcontractAgreementId: contractorA.agreementId }),
    );

    await asContractor(contractorA, orgId, async (ctx) => {
      const list = await listContractorRfis(ctx, { organizationId: orgId, projectId });
      expect(list.map((r) => r.id)).toEqual([own.rfiId]);
      await updateContractorRfi(ctx, { organizationId: orgId, rfiId: own.rfiId, question: 'Confirm 15cm spacing?' });
      const submitted = await submitContractorRfi(ctx, { organizationId: orgId, rfiId: own.rfiId });
      expect(submitted.status).toBe('submitted');
      await expect(
        updateContractorRfi(ctx, { organizationId: orgId, rfiId: own.rfiId, question: 'late edit' }),
      ).rejects.toMatchObject({ code: 'domain_rule_violated' });
      await expect(getContractorRfi(ctx, { organizationId: orgId, rfiId: internalDraft.rfiId })).rejects.toMatchObject({
        code: 'not_found',
      });
      // a contractor can never close through the database (RLS: only its drafts are updatable)
      await ctx.db.update(rfis).set({ status: 'closed' }).where(eq(rfis.id, own.rfiId));
      const [row] = await ctx.db.select({ status: rfis.status }).from(rfis).where(eq(rfis.id, own.rfiId));
      expect(row!.status).toBe('submitted');
    });
    // separate transaction: a rejected statement aborts the transaction it runs in
    await asContractor(contractorA, orgId, async (ctx) => {
      await expect(
        ctx.db.insert(rfiAnswers).values({ organizationId: orgId, projectId, rfiId: own.rfiId, body: 'self answer' }),
      ).rejects.toBeDefined();
    });

    await asContractor(contractorB, orgId, async (ctx) => {
      expect(await listContractorRfis(ctx, { organizationId: orgId, projectId })).toHaveLength(0);
      await expect(getContractorRfi(ctx, { organizationId: orgId, rfiId: own.rfiId })).rejects.toMatchObject({
        code: 'not_found',
      });
      expect(await ctx.db.select().from(rfis)).toHaveLength(0);
      expect(await resolveEntityScope(ctx.db, 'rfi', orgId, own.rfiId)).toBeNull();
    });

    // the internal draft becomes visible to A only once submitted
    await asInternal(engineer.id, orgId, async (ctx) => {
      await submitRfi(ctx, { rfiId: internalDraft.rfiId });
      const answered = await answerRfi(ctx, { rfiId: own.rfiId, body: '15cm confirmed' });
      expect(answered.status).toBe('answered');
    });
    await asContractor(contractorA, orgId, async (ctx) => {
      const detail = await getContractorRfi(ctx, { organizationId: orgId, rfiId: own.rfiId });
      expect(detail.answers.map((a) => a.body)).toEqual(['15cm confirmed']);
      expect(detail.answers[0]!.answeredByName).toBeNull();
      expect(detail.assigneeUserId).toBeNull();
      const scope = await resolveEntityScope(ctx.db, 'rfi', orgId, own.rfiId);
      expect(scope).toMatchObject({ projectId, vendorId: contractorA.vendorId });
      const list = await listContractorRfis(ctx, { organizationId: orgId, projectId });
      expect(list.map((r) => r.id).sort()).toEqual([own.rfiId, internalDraft.rfiId].sort());
    });

    await database.asService(async (db) => {
      const [event] = await db
        .select()
        .from(domainEvents)
        .where(and(eq(domainEvents.entityId, own.rfiId), eq(domainEvents.eventType, 'rfi.request.submitted')));
      expect(event).toMatchObject({ actorType: 'external', actorPrincipalId: contractorA.principalId });
      const [audit] = await db
        .select({ metadata: auditEvents.metadata, actorUserId: auditEvents.actorUserId })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, own.rfiId), eq(auditEvents.action, 'rfi.submitted')));
      expect(audit!.actorUserId).toBeNull();
      expect(audit!.metadata).toMatchObject({ actor: { type: 'external', principalId: contractorA.principalId } });
    });
  });

  it('denies contractors without ext.rfi.raise or outside the project', async () => {
    const { orgId, projectId, otherProjectId } = await scenario();
    const limited = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'limited',
      capabilities: [X.PROJECT_VIEW],
    });
    await asContractor(limited, orgId, async (ctx) => {
      await expect(
        createContractorRfi(ctx, { organizationId: orgId, projectId, subject: 'S', question: 'Q' }),
      ).rejects.toMatchObject({ code: 'authorization_denied' });
      await expect(listContractorRfis(ctx, { organizationId: orgId, projectId })).rejects.toMatchObject({
        code: 'authorization_denied',
      });
    });
    const full = await createContractor(database, { organizationId: orgId, projectId, label: 'full' });
    await asContractor(full, orgId, async (ctx) => {
      // vendor-wide grant, but the vendor has no agreement on the other project -> RLS refuses
      await expect(
        createContractorRfi(ctx, { organizationId: orgId, projectId: otherProjectId, subject: 'S', question: 'Q' }),
      ).rejects.toBeDefined();
    });
  });

  it('numbers RFIs per project across internal and contractor authors and reports overdue items', async () => {
    const { orgId, userA, projectId, otherProjectId, contractorA } = await scenario();
    const one = await asInternal(userA.id, orgId, (ctx) =>
      createRfi(ctx, { projectId, subject: 'A', question: 'Q', dueDate: '2026-09-01', submit: true }),
    );
    const two = await asContractor(contractorA, orgId, (ctx) =>
      createContractorRfi(ctx, {
        organizationId: orgId,
        projectId,
        subject: 'B',
        question: 'Q',
        dueDate: '2026-09-15',
        submit: true,
      }),
    );
    const other = await asInternal(userA.id, orgId, (ctx) =>
      createRfi(ctx, { projectId: otherProjectId, subject: 'C', question: 'Q' }),
    );
    expect([one.number, two.number, other.number]).toEqual([1, 2, 1]);

    const overdue = await database.asService((db) =>
      listOverdueRfis(db, { organizationId: orgId, today: '2026-09-10' }),
    );
    expect(overdue.map((item) => item.rfiId)).toEqual([one.rfiId]);
    expect(overdue[0]!.daysOverdue).toBe(9);

    const summary = await asContractor(contractorA, orgId, (ctx) =>
      getContractorRfiSummary(ctx, { organizationId: orgId, projectId, today: '2026-09-20' }),
    );
    expect(summary).toEqual({ drafts: 0, awaitingAnswer: 1, answered: 0, closed: 0, overdue: 1 });
  });
});
