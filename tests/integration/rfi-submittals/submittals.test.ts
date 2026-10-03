import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import { domainEvents, submittalReviews, submittalRevisions, submittals } from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import {
  createContractorSubmittal,
  createSubmittal,
  getContractorSubmittal,
  getContractorSubmittalSummary,
  getSubmittal,
  listContractorSubmittals,
  listPendingSubmittals,
  listProjectSubmittals,
  openContractorRevision,
  reviewSubmittal,
  startSubmittalReview,
  submitContractorSubmittal,
  updateContractorRevisionNotes,
  withdrawSubmittal,
} from '@/modules/submittals';
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

describe('Submittals (Track KL, migration 0163)', () => {
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
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const engineer = await addOrgMember(database, orgId, 'engineer');
    const viewer = await addOrgMember(database, orgId, 'viewer');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: engineer.id, templateKey: 'execution_engineer' });
      await addProjectMember(context, { projectId, userId: viewer.id, templateKey: 'viewer' });
    });
    return { orgId, userA, projectId, contractorA, contractorB, engineer, viewer };
  }

  function asInternal<T>(userId: string, orgId: string, fn: (ctx: OrgContext) => Promise<T>) {
    return asInternalUser(database, userId, orgId, fn);
  }

  function asContractor<T>(contractor: ContractorFixture, orgId: string, fn: (ctx: ExternalContext) => Promise<T>) {
    return asContractorUser(database, contractor, orgId, fn);
  }

  it('keeps every submission as an immutable revision through review and resubmission', async () => {
    const { orgId, projectId, contractorA, engineer } = await scenario();

    const created = await asContractor(contractorA, orgId, (ctx) =>
      createContractorSubmittal(ctx, {
        organizationId: orgId,
        projectId,
        type: 'product',
        title: 'Waterproofing membrane',
        specSection: '07 13 00',
        notes: 'Datasheet attached',
      }),
    );
    expect(created.number).toBe(1);

    await asContractor(contractorA, orgId, async (ctx) => {
      await updateContractorRevisionNotes(ctx, { organizationId: orgId, submittalId: created.submittalId, notes: 'Datasheet + sample' });
      const submitted = await submitContractorSubmittal(ctx, { organizationId: orgId, submittalId: created.submittalId });
      expect(submitted.status).toBe('submitted');
      // a submitted revision is frozen
      await expect(
        updateContractorRevisionNotes(ctx, { organizationId: orgId, submittalId: created.submittalId, notes: 'late' }),
      ).rejects.toMatchObject({ code: 'domain_rule_violated' });
    });

    await asInternal(engineer.id, orgId, async (ctx) => {
      await startSubmittalReview(ctx, { submittalId: created.submittalId });
      await expect(
        reviewSubmittal(ctx, {
          submittalId: created.submittalId,
          revisionId: created.revisionId,
          decision: 'revise_and_resubmit',
        }),
      ).rejects.toMatchObject({ code: 'validation_failed' });
      const reviewed = await reviewSubmittal(ctx, {
        submittalId: created.submittalId,
        revisionId: created.revisionId,
        decision: 'revise_and_resubmit',
        comments: 'Provide 20-year warranty letter',
      });
      expect(reviewed.status).toBe('revise_and_resubmit');
    });

    const rev2 = await asContractor(contractorA, orgId, async (ctx) => {
      const opened = await openContractorRevision(ctx, { organizationId: orgId, submittalId: created.submittalId });
      expect(opened.revisionNumber).toBe(2);
      await updateContractorRevisionNotes(ctx, {
        organizationId: orgId,
        submittalId: created.submittalId,
        notes: 'Warranty letter attached',
      });
      await submitContractorSubmittal(ctx, { organizationId: orgId, submittalId: created.submittalId });
      return opened;
    });

    await asInternal(engineer.id, orgId, async (ctx) => {
      // stale revision id (Rev 1) cannot be reviewed again
      await expect(
        reviewSubmittal(ctx, { submittalId: created.submittalId, revisionId: created.revisionId, decision: 'approved' }),
      ).rejects.toMatchObject({ code: 'domain_rule_violated' });
      const approved = await reviewSubmittal(ctx, {
        submittalId: created.submittalId,
        revisionId: rev2.revisionId,
        decision: 'approved_with_comments',
        comments: 'Install per manufacturer detail',
      });
      expect(approved.status).toBe('approved_with_comments');
      const detail = await getSubmittal(ctx, created.submittalId);
      expect(detail.revisions.map((r) => [r.revisionNumber, r.review?.decision, r.notes])).toEqual([
        [2, 'approved_with_comments', 'Warranty letter attached'],
        [1, 'revise_and_resubmit', 'Datasheet + sample'],
      ]);
      expect(detail.availableActions).toEqual([]);
    });

    await database.asService(async (db) => {
      await expect(db.update(submittalRevisions).set({ notes: 'tampered' })).rejects.toBeDefined();
      await expect(db.delete(submittalRevisions)).rejects.toBeDefined();
      await expect(db.update(submittalReviews).set({ comments: 'tampered' })).rejects.toBeDefined();
      const events = await db
        .select({ type: domainEvents.eventType, actorType: domainEvents.actorType, payload: domainEvents.payload })
        .from(domainEvents)
        .where(eq(domainEvents.entityId, created.submittalId))
        .orderBy(asc(domainEvents.occurredAt));
      expect(events.filter((e) => e.type === 'submittal.package.submitted')).toHaveLength(2);
      expect(events.filter((e) => e.type === 'submittal.package.reviewed').map((e) => e.payload.decision)).toEqual([
        'revise_and_resubmit',
        'approved_with_comments',
      ]);
    });
  });

  it('isolates contractor A submittals from contractor B', async () => {
    const { orgId, projectId, contractorA, contractorB } = await scenario();
    const created = await asContractor(contractorA, orgId, (ctx) =>
      createContractorSubmittal(ctx, { organizationId: orgId, projectId, type: 'sample', title: 'Tile sample' }),
    );
    await asContractor(contractorB, orgId, async (ctx) => {
      expect(await listContractorSubmittals(ctx, { organizationId: orgId, projectId })).toHaveLength(0);
      expect(await ctx.db.select().from(submittals)).toHaveLength(0);
      expect(await ctx.db.select().from(submittalRevisions)).toHaveLength(0);
      await expect(
        getContractorSubmittal(ctx, { organizationId: orgId, submittalId: created.submittalId }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        submitContractorSubmittal(ctx, { organizationId: orgId, submittalId: created.submittalId }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await resolveEntityScope(ctx.db, 'submittal_revision', orgId, created.revisionId)).toBeNull();
    });
    await asContractor(contractorA, orgId, async (ctx) => {
      expect((await listContractorSubmittals(ctx, { organizationId: orgId, projectId })).map((s) => s.id)).toEqual([
        created.submittalId,
      ]);
      expect(await resolveEntityScope(ctx.db, 'submittal_revision', orgId, created.revisionId)).toMatchObject({
        projectId,
        vendorId: contractorA.vendorId,
      });
    });
  });

  it('never lets a contractor review or approve its own submittal', async () => {
    const { orgId, projectId, contractorA } = await scenario();
    const created = await asContractor(contractorA, orgId, async (ctx) => {
      const result = await createContractorSubmittal(ctx, {
        organizationId: orgId,
        projectId,
        type: 'equipment',
        title: 'Chiller',
      });
      await submitContractorSubmittal(ctx, { organizationId: orgId, submittalId: result.submittalId });
      return result;
    });
    await asContractor(contractorA, orgId, async (ctx) => {
      await expect(
        ctx.db.update(submittals).set({ status: 'approved' }).where(eq(submittals.id, created.submittalId)),
      ).rejects.toBeDefined();
    });
    // separate transaction: a rejected statement aborts the transaction it runs in
    await asContractor(contractorA, orgId, async (ctx) => {
      await expect(
        ctx.db.insert(submittalReviews).values({
          organizationId: orgId,
          projectId,
          submittalId: created.submittalId,
          revisionId: created.revisionId,
          decision: 'approved',
        }),
      ).rejects.toBeDefined();
    });
    const [row] = await database.asService((db) =>
      db.select({ status: submittals.status }).from(submittals).where(eq(submittals.id, created.submittalId)),
    );
    expect(row!.status).toBe('submitted');
  });

  it('requires submittal.manage for internal registration and review; contractors need ext.submittal.submit', async () => {
    const { orgId, projectId, contractorA, viewer, engineer } = await scenario();
    await asInternal(viewer.id, orgId, async (ctx) => {
      await expect(
        createSubmittal(ctx, {
          projectId,
          subcontractAgreementId: contractorA.agreementId!,
          type: 'material',
          title: 'Concrete mix',
        }),
      ).rejects.toMatchObject({ code: 'authorization_denied' });
    });
    const created = await asInternal(engineer.id, orgId, (ctx) =>
      createSubmittal(ctx, {
        projectId,
        subcontractAgreementId: contractorA.agreementId!,
        type: 'material',
        title: 'Concrete mix B30',
        dueDate: '2026-09-01',
      }),
    );
    await asInternal(viewer.id, orgId, async (ctx) => {
      const list = await listProjectSubmittals(ctx, { projectId });
      expect(list.items.map((s) => s.id)).toEqual([created.submittalId]);
      expect(list.canManage).toBe(false);
    });
    // the contractor sees a submittal registered on its behalf and can submit it
    await asContractor(contractorA, orgId, (ctx) =>
      submitContractorSubmittal(ctx, { organizationId: orgId, submittalId: created.submittalId }),
    );
    const pending = await database.asService((db) =>
      listPendingSubmittals(db, { organizationId: orgId, today: '2026-09-05' }),
    );
    expect(pending.map((p) => [p.submittalId, p.daysOverdue])).toEqual([[created.submittalId, 4]]);
    const summary = await asContractor(contractorA, orgId, (ctx) =>
      getContractorSubmittalSummary(ctx, { organizationId: orgId, projectId, today: '2026-09-05' }),
    );
    expect(summary).toEqual({ drafts: 0, pendingReview: 1, actionRequired: 0, approved: 0, overdueReview: 1 });

    await asInternal(engineer.id, orgId, async (ctx) => {
      const withdrawn = await withdrawSubmittal(ctx, { submittalId: created.submittalId });
      expect(withdrawn.status).toBe('withdrawn');
    });

    const limited = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'limited',
      capabilities: [X.PROJECT_VIEW, X.RFI_RAISE],
    });
    await asContractor(limited, orgId, async (ctx) => {
      await expect(
        createContractorSubmittal(ctx, { organizationId: orgId, projectId, type: 'catalogue', title: 'Catalogue' }),
      ).rejects.toMatchObject({ code: 'authorization_denied' });
    });
  });

  it('records the external actor on submitted revisions', async () => {
    const { orgId, projectId, contractorA } = await scenario();
    const created = await asContractor(contractorA, orgId, async (ctx) => {
      const result = await createContractorSubmittal(ctx, {
        organizationId: orgId,
        projectId,
        type: 'shop_drawing',
        title: 'Steel stair shop drawing',
      });
      await submitContractorSubmittal(ctx, { organizationId: orgId, submittalId: result.submittalId });
      return result;
    });
    await database.asService(async (db) => {
      const [revision] = await db
        .select()
        .from(submittalRevisions)
        .where(and(eq(submittalRevisions.id, created.revisionId)));
      expect(revision).toMatchObject({
        submittedActorType: 'external',
        submittedByPrincipalId: contractorA.principalId,
        submittedByUserId: null,
      });
    });
  });
});
