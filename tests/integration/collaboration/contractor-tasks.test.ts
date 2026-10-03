import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const evidence = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/modules/evidence', () => ({
  countEvidence: vi.fn(async () => evidence.count),
  listEvidence: vi.fn(async () => []),
}));

import { and, eq, sql } from 'drizzle-orm';
import {
  auditEvents,
  collabComments,
  domainEvents,
  entityLinks,
  taskExternalAssignments,
  taskExternalEvents,
  tasks,
} from '@drizzle/schema';
import {
  createLinkedTask,
  getContractorPortalTask,
  getTaskContractorPanel,
  listContractorPortalTasks,
  loadContractorActivity,
  loadExternalDiscussion,
  loadProjectActivity,
  loadInternalDiscussion,
  postExternalComment,
  postInternalComment,
  runContractorTaskCommand,
  runInternalTaskCommand,
} from '@/modules/collaboration';
import { internalActor } from '@/shared/actor';
import type { ExternalContext } from '@/shared/external';
import { emitDomainEvent } from '@/shared/domain-events';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { asContractor, asInternal, createCollabScenario, type CollabScenario } from '@tests/setup/dg-fixtures-collab';

describe('Track G - contractor tasks on the existing task engine (0160)', () => {
  let database: TestDatabase;
  let s: CollabScenario;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    evidence.count = 0;
    s = await createCollabScenario(database);
  });

  async function createContractorTask(requiresEvidence = true): Promise<string> {
    const { taskId } = await asInternal(database, s.siteManager, s.orgId, (context) =>
      createLinkedTask(context, {
        projectId: s.projectId,
        title: 'Waterproof bathroom 3A',
        dueDate: '2026-10-20',
        priority: 'high',
        assignee: {
          kind: 'contractor',
          vendorId: s.contractorA.vendorId,
          subcontractAgreementId: s.contractorA.agreementId,
        },
        requiresEvidence,
        sources: [{ entityType: 'subcontract_agreement', entityId: s.contractorA.agreementId! }],
      }),
    );
    return taskId;
  }

  const contractorA = <T,>(fn: (context: ExternalContext) => Promise<T>) =>
    asContractor(database, s.contractorA, s.orgId, fn);

  it('runs assigned -> acknowledged -> in progress -> evidence -> rejected -> reopened -> resubmitted -> closed', async () => {
    const taskId = await createContractorTask();
    const command = (type: 'acknowledge' | 'start' | 'reopen' | 'submit_completion') =>
      contractorA((context) =>
        runContractorTaskCommand(context, { organizationId: s.orgId, taskId, command: { type } }),
      );

    expect((await command('acknowledge')).status).toBe('acknowledged');
    expect((await command('start')).status).toBe('in_progress');

    await expect(command('submit_completion')).rejects.toMatchObject({
      messageKey: 'collaboration.errors.evidenceRequired',
    });
    evidence.count = 1;
    expect((await command('submit_completion')).status).toBe('completion_submitted');

    // Contractors cannot verify their own work.
    await expect(
      contractorA((context) =>
        runContractorTaskCommand(context, {
          organizationId: s.orgId,
          taskId,
          command: { type: 'verify' } as never,
        }),
      ),
    ).rejects.toBeDefined();

    const rejected = await asInternal(database, s.siteManager, s.orgId, (context) =>
      runInternalTaskCommand(context, taskId, {
        type: 'verify',
        outcome: 'rejected',
        quality: 'unacceptable',
        note: 'Membrane overlap missing at the drain',
      }),
    );
    expect(rejected.status).toBe('rejected');

    expect((await command('reopen')).status).toBe('reopened');
    // Resubmission needs NEW evidence.
    await expect(command('submit_completion')).rejects.toMatchObject({
      messageKey: 'collaboration.errors.newEvidenceRequired',
    });
    evidence.count = 3;
    expect((await command('submit_completion')).status).toBe('resubmitted');

    await asInternal(database, s.siteManager, s.orgId, async (context) => {
      expect((await runInternalTaskCommand(context, taskId, { type: 'verify', outcome: 'approved', quality: 'satisfactory' })).status).toBe('approved');
      expect((await runInternalTaskCommand(context, taskId, { type: 'close' })).status).toBe('closed');
    });

    await database.asService(async (db) => {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
      expect(task!.status).toBe('done');
      expect(task!.completionDate).not.toBeNull();
      const [assignment] = await db.select().from(taskExternalAssignments).where(eq(taskExternalAssignments.taskId, taskId));
      expect(assignment).toMatchObject({ status: 'closed', cycle: 2, lastOutcome: 'approved', lastQuality: 'satisfactory', lastSubmittedEvidenceCount: 3 });

      const history = await db
        .select({ action: taskExternalEvents.action, to: taskExternalEvents.toStatus, actorType: taskExternalEvents.actorType })
        .from(taskExternalEvents)
        .where(eq(taskExternalEvents.taskId, taskId))
        .orderBy(taskExternalEvents.createdAt, taskExternalEvents.id);
      expect(history.map((h) => h.to)).toEqual([
        'assigned', 'acknowledged', 'in_progress', 'completion_submitted', 'rejected',
        'reopened', 'resubmitted', 'approved', 'closed',
      ]);
      expect(history.filter((h) => h.actorType === 'external')).toHaveLength(5);

      // Immutable history.
      await expect(db.update(taskExternalEvents).set({ note: 'tampered' }).where(eq(taskExternalEvents.taskId, taskId))).rejects.toBeDefined();
      await expect(db.delete(taskExternalEvents).where(eq(taskExternalEvents.taskId, taskId))).rejects.toBeDefined();

      const events = await db.select({ type: domainEvents.eventType }).from(domainEvents).where(eq(domainEvents.entityId, taskId));
      const types = events.map((e) => e.type);
      expect(types).toEqual(expect.arrayContaining([
        'task.external.assigned', 'task.external.acknowledged', 'task.external.completion_submitted',
        'task.external.verified', 'task.external.reopened', 'task.external.closed', 'task.linked.created',
      ]));
      const links = await db.select().from(entityLinks).where(and(eq(entityLinks.targetType, 'task'), eq(entityLinks.targetId, taskId)));
      expect(links.map((l) => l.sourceType)).toEqual(['subcontract_agreement']);

      const externalAudit = await db
        .select({ metadata: auditEvents.metadata })
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, taskId), eq(auditEvents.action, 'task_external.acknowledged')));
      expect(externalAudit[0]!.metadata).toMatchObject({ actor: { type: 'external', principalId: s.contractorA.principalId } });
    });

    // Internal task panel shows full history to the project team.
    const panel = await asInternal(database, s.pmOps, s.orgId, (context) => getTaskContractorPanel(context, taskId));
    expect(panel.assignment?.status).toBe('closed');
    expect(panel.history).toHaveLength(9);
    expect(panel.assignment?.availableCommands).toEqual(['reopen']);
  });

  it('isolates contractor A from contractor B (portal, RLS, commands)', async () => {
    const taskId = await createContractorTask(false);

    const listA = await contractorA((context) => listContractorPortalTasks(context, { organizationId: s.orgId, projectId: s.projectId }));
    expect(listA.map((t) => t.taskId)).toEqual([taskId]);
    expect(listA[0]!.availableCommands).toEqual(['acknowledge']);

    await asContractor(database, s.contractorB, s.orgId, async (context) => {
      expect(await listContractorPortalTasks(context, { organizationId: s.orgId, projectId: s.projectId })).toEqual([]);
      await expect(getContractorPortalTask(context, { organizationId: s.orgId, taskId })).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        runContractorTaskCommand(context, { organizationId: s.orgId, taskId, command: { type: 'acknowledge' } }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await context.db.select({ id: tasks.id }).from(tasks)).toEqual([]);
      expect(await context.db.select().from(taskExternalAssignments)).toEqual([]);
      expect(await context.db.select().from(taskExternalEvents)).toEqual([]);
      const updated = await context.db
        .update(taskExternalAssignments)
        .set({ status: 'acknowledged' })
        .where(eq(taskExternalAssignments.taskId, taskId))
        .returning();
      expect(updated).toEqual([]);
    });

    // Contractor A sees only its own task rows through RLS; tasks of other projects/vendors stay hidden.
    await contractorA(async (context) => {
      const visible = await context.db.select({ id: tasks.id, title: tasks.title }).from(tasks);
      expect(visible).toEqual([{ id: taskId, title: 'Waterproof bathroom 3A' }]);
    });
  });

  it('prevents contractors from tampering with assignment or skipping the lifecycle at the database', async () => {
    const taskId = await createContractorTask(true);
    await contractorA(async (context) => {
      await expect(
        context.db.update(taskExternalAssignments).set({ requiresEvidence: false }).where(eq(taskExternalAssignments.taskId, taskId)),
      ).rejects.toBeDefined();
    });
    await contractorA(async (context) => {
      await expect(
        context.db.update(taskExternalAssignments).set({ status: 'closed' }).where(eq(taskExternalAssignments.taskId, taskId)),
      ).rejects.toBeDefined();
    });
    await contractorA(async (context) => {
      await expect(
        context.db.update(tasks).set({ title: 'hacked' }).where(eq(tasks.id, taskId)),
      ).resolves.toBeDefined();
      const [row] = await context.db.select({ title: tasks.title }).from(tasks).where(eq(tasks.id, taskId));
      expect(row!.title).toBe('Waterproof bathroom 3A');
    });
  });

  it('never returns internal-audience posts to contractors', async () => {
    const taskId = await createContractorTask(false);
    await asInternal(database, s.owner, s.orgId, async (context) => {
      await postInternalComment(context, {
        organizationId: s.orgId, entityType: 'task', entityId: taskId,
        body: 'Internal: contractor is slow, consider back-charge', audience: 'internal',
      });
      await postInternalComment(context, {
        organizationId: s.orgId, entityType: 'task', entityId: taskId,
        body: 'Please start Sunday 07:00', audience: 'contractor',
      });
      await postInternalComment(context, {
        organizationId: s.orgId, entityType: 'task', entityId: taskId,
        body: 'Decision: membrane brand X approved', audience: 'internal', kind: 'decision',
      });
    });
    await contractorA((context) =>
      postExternalComment(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId, body: 'Confirmed, team of 3' }),
    );

    const external = await contractorA((context) =>
      loadExternalDiscussion(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId }),
    );
    expect(external.posts.map((p) => p.body)).toEqual(['Please start Sunday 07:00', 'Confirmed, team of 3']);
    expect(external.posts.every((p) => p.audience === 'contractor')).toBe(true);

    await contractorA(async (context) => {
      const raw = await context.db.select({ body: collabComments.body, audience: collabComments.audience }).from(collabComments);
      expect(raw.every((row) => row.audience === 'contractor')).toBe(true);
      expect(raw).toHaveLength(2);
      // Cannot forge an internal post or a decision.
      await expect(
        context.db.insert(collabComments).values({
          organizationId: s.orgId, projectId: s.projectId, entityType: 'task', entityId: taskId,
          vendorId: s.contractorA.vendorId, audience: 'internal', body: 'forged', actorType: 'external',
          actorPrincipalId: s.contractorA.principalId,
        }),
      ).rejects.toBeDefined();
    });

    await asContractor(database, s.contractorB, s.orgId, async (context) => {
      await expect(
        loadExternalDiscussion(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId }),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(
        postExternalComment(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId, body: 'B here' }),
      ).rejects.toMatchObject({ code: 'not_found' });
      expect(await context.db.select().from(collabComments)).toEqual([]);
    });

    const internal = await asInternal(database, s.pmOps, s.orgId, (context) =>
      loadInternalDiscussion(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId }),
    );
    expect(internal.posts).toHaveLength(4);
    expect(internal.posts.find((p) => p.kind === 'decision')?.body).toContain('membrane');
    expect(internal.contractorAudienceAllowed).toBe(true);

    await database.asService(async (db) => {
      await expect(db.update(collabComments).set({ body: 'edited' })).rejects.toBeDefined();
      const decisions = await db.select().from(auditEvents).where(eq(auditEvents.action, 'collab_decision.recorded'));
      expect(decisions).toHaveLength(1);
    });
  });

  it('refuses contractor-audience posts on internal-only tasks and decisions without authority', async () => {
    const { taskId } = await asInternal(database, s.siteManager, s.orgId, (context) =>
      createLinkedTask(context, { projectId: s.projectId, title: 'Internal follow-up', assignee: { kind: 'user', userId: s.pmOps.id } }),
    );
    await asInternal(database, s.siteManager, s.orgId, async (context) => {
      await expect(
        postInternalComment(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId, body: 'hi', audience: 'contractor' }),
      ).rejects.toMatchObject({ messageKey: 'collaboration.errors.notSharedWithContractors' });
    });
    await asInternal(database, s.accountant, s.orgId, async (context) => {
      await expect(
        postInternalComment(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId, body: 'x', audience: 'internal', kind: 'decision' }),
      ).rejects.toBeDefined();
    });
    await contractorA(async (context) => {
      await expect(
        postExternalComment(context, { organizationId: s.orgId, entityType: 'task', entityId: taskId, body: 'peek' }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
  });

  it('builds a paginated, filterable activity feed with financial redaction', async () => {
    const taskId = await createContractorTask(false);
    await contractorA((context) =>
      runContractorTaskCommand(context, { organizationId: s.orgId, taskId, command: { type: 'acknowledge' } }),
    );
    await asInternal(database, s.owner, s.orgId, (context) =>
      emitDomainEvent(context.db, {
        organizationId: s.orgId,
        projectId: s.projectId,
        type: 'subcontract.claim.certified' as never,
        entityType: 'subcontract_claim',
        entityId: s.contractorA.agreementId!,
        actor: internalActor(s.owner.id),
        payload: { title: 'Claim 3 certified 80,000', vendorId: s.contractorA.vendorId },
      }),
    );

    const ops = await asInternal(database, s.pmOps, s.orgId, (context) =>
      loadProjectActivity(context, { projectId: s.projectId, limit: 50 }),
    );
    const redacted = ops.items.filter((item) => item.redacted);
    expect(redacted).toHaveLength(1);
    expect(redacted[0]).toMatchObject({ title: null, href: null, entityId: null, messageKey: 'activity.events.financialRedacted' });
    expect(JSON.stringify(ops)).not.toContain('80,000');
    expect(ops.items.some((item) => item.eventType === 'task.external.acknowledged')).toBe(true);

    const finance = await asInternal(database, s.accountant, s.orgId, (context) =>
      loadProjectActivity(context, { projectId: s.projectId, limit: 50 }),
    );
    expect(finance.items.find((item) => item.eventType === 'subcontract.claim.certified')?.title).toBe('Claim 3 certified 80,000');

    const first = await asInternal(database, s.pmOps, s.orgId, (context) =>
      loadProjectActivity(context, { projectId: s.projectId, limit: 2 }),
    );
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await asInternal(database, s.pmOps, s.orgId, (context) =>
      loadProjectActivity(context, { projectId: s.projectId, limit: 2, cursor: first.nextCursor }),
    );
    expect(second.items.map((i) => i.id)).not.toContain(first.items[0]!.id);

    const byVendorB = await asInternal(database, s.pmOps, s.orgId, (context) =>
      loadProjectActivity(context, { projectId: s.projectId, filters: { vendorId: s.contractorB.vendorId } }),
    );
    expect(byVendorB.items).toEqual([]);
    const byDomain = await asInternal(database, s.pmOps, s.orgId, (context) =>
      loadProjectActivity(context, { projectId: s.projectId, filters: { domain: 'task' } }),
    );
    expect(byDomain.items.every((item) => item.eventType.startsWith('task.'))).toBe(true);

    const contractorFeed = await contractorA((context) =>
      loadContractorActivity(context, { organizationId: s.orgId, projectId: s.projectId }),
    );
    expect(contractorFeed.items.map((i) => i.eventType)).toEqual(['task.external.acknowledged', 'task.external.assigned']);
    const contractorBFeed = await asContractor(database, s.contractorB, s.orgId, (context) =>
      loadContractorActivity(context, { organizationId: s.orgId, projectId: s.projectId }),
    );
    expect(contractorBFeed.items).toEqual([]);
  });

  it('rejects linked tasks without tasks.manage and validates cross-project links', async () => {
    await asInternal(database, s.accountant, s.orgId, async (context) => {
      await expect(
        createLinkedTask(context, { projectId: s.projectId, title: 'x', assignee: { kind: 'none' } }),
      ).rejects.toMatchObject({ code: 'authorization_denied' });
    });
    await asInternal(database, s.siteManager, s.orgId, async (context) => {
      await expect(
        createLinkedTask(context, {
          projectId: s.projectId,
          title: 'Bad link',
          assignee: { kind: 'none' },
          sources: [{ entityType: 'project', entityId: '00000000-0000-4000-8000-000000000001' }],
        }),
      ).rejects.toMatchObject({ code: 'not_found' });
    });
    // Nothing persisted from the failed attempt (atomic).
    await database.asService(async (db) => {
      const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.title, 'Bad link'));
      expect(rows).toEqual([]);
      const count = await db.execute(sql`select count(*)::int as n from public.task_external_assignments`);
      expect((count as unknown as { rows: { n: number }[] }).rows[0]!.n).toBe(0);
    });
  });
});
