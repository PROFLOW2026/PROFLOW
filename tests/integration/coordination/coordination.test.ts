import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, asc, eq } from 'drizzle-orm';
import {
  auditEvents,
  coordinationEventParticipants,
  coordinationEvents,
  coordinationIssues,
  coordinationResponses,
  domainEvents,
} from '@drizzle/schema';
import { addProjectMember } from '@/modules/project-team';
import {
  createCoordinationEvent,
  createCoordinationFollowUpTask,
  getContractorCoordinationSummary,
  getContractorEventDetail,
  getCoordinationEventDetail,
  listContractorSchedule,
  listCoordinationCalendarItems,
  listProjectCoordinationEvents,
  overrideCoordinationReadiness,
  recordCoordinationOutcome,
  recordResponseOnBehalf,
  rescheduleCoordinationEvent,
  respondToCoordinationEvent,
  type CoordinationTaskDeps,
} from '@/modules/coordination';
import type { CreateLinkedTaskInput } from '@/modules/collaboration';
import { EXTERNAL_CAPABILITIES as X } from '@/shared/external';
import { AuthorizationError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, createContractor, createProjectAs, orgContextFor } from '@tests/setup/dg-fixtures';
import { asContractor } from '@tests/setup/dg-fixtures-coordination';
import { provisionTwoTenants } from '../projects/setup';

describe('coordination events / contractor readiness (Track H, migration 0161)', () => {
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
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower A');
    const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Tower B');
    const electrical = await createContractor(database, { organizationId: orgId, projectId, label: 'Electrical' });
    const hvac = await createContractor(database, { organizationId: orgId, projectId, label: 'HVAC' });
    const fire = await createContractor(database, { organizationId: orgId, projectId, label: 'Fire' });
    const outsiderContractor = await createContractor(database, { organizationId: orgId, projectId, label: 'Plumbing' });
    const siteManager = await addOrgMember(database, orgId, 'site');
    const viewer = await addOrgMember(database, orgId, 'viewer');
    const outsider = await addOrgMember(database, orgId, 'outsider');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: siteManager.id, templateKey: 'site_manager' });
      await addProjectMember(context, { projectId, userId: viewer.id, templateKey: 'viewer' });
    });
    return { orgId, userA, projectId, otherProjectId, electrical, hvac, fire, outsiderContractor, siteManager, viewer, outsider };
  }

  type Scenario = Awaited<ReturnType<typeof scenario>>;

  async function createPour(s: Scenario, overrides: { startsAt?: string } = {}) {
    return database.asUser(s.siteManager.id, async (tx) => {
      const context = await orgContextFor(tx, s.siteManager.id, s.orgId);
      const { eventId } = await createCoordinationEvent(context, {
        projectId: s.projectId,
        title: 'יציקת תקרה קומה 1',
        kind: 'concrete_pour',
        startsAt: overrides.startsAt ?? '2030-03-10T07:00:00.000Z',
        endsAt: '2030-03-10T15:00:00.000Z',
        preparationDeadline: '2030-03-09T12:00:00.000Z',
        requiredAcknowledgements: ['Safety briefing read'],
        contractors: [
          { vendorId: s.electrical.vendorId, subcontractAgreementId: s.electrical.agreementId, tradeLabel: 'Electrical', isRequired: true },
          { vendorId: s.hvac.vendorId, subcontractAgreementId: s.hvac.agreementId, tradeLabel: 'HVAC', isRequired: true },
          { vendorId: s.fire.vendorId, subcontractAgreementId: s.fire.agreementId, tradeLabel: 'Fire', isRequired: false },
        ],
        internalUserIds: [s.siteManager.id],
      });
      return eventId;
    });
  }

  async function participantOf(eventId: string, vendorId: string): Promise<string> {
    const [row] = await database.asService((db) =>
      db
        .select({ id: coordinationEventParticipants.id })
        .from(coordinationEventParticipants)
        .where(and(eq(coordinationEventParticipants.eventId, eventId), eq(coordinationEventParticipants.vendorId, vendorId))),
    );
    return row!.id;
  }

  async function eventTypes(eventId: string): Promise<string[]> {
    const rows = await database.asService((db) =>
      db
        .select({ type: domainEvents.eventType, occurredAt: domainEvents.occurredAt })
        .from(domainEvents)
        .where(eq(domainEvents.entityId, eventId))
        .orderBy(asc(domainEvents.occurredAt)),
    );
    return rows.map((row) => row.type);
  }

  async function detailAs(s: Scenario, userId: string, eventId: string) {
    return database.asUser(userId, async (tx) =>
      getCoordinationEventDetail(await orgContextFor(tx, userId, s.orgId), s.projectId, eventId),
    );
  }

  it('runs the full "יציקת תקרה קומה 1" flow: NOT READY -> linked task -> reconfirm READY -> event READY -> completed', async () => {
    const s = await scenario();
    const eventId = await createPour(s);
    const electricalParty = await participantOf(eventId, s.electrical.vendorId);
    const hvacParty = await participantOf(eventId, s.hvac.vendorId);

    const created = await detailAs(s, s.siteManager.id, eventId);
    expect(created.status).toBe('scheduled');
    expect(created.readiness.state).toBe('waiting');
    expect(
      created.contractors
        .map((c) => [c.tradeLabel, c.partyName, c.isRequired] as const)
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ['Electrical', 'Contractor Electrical', true],
      ['Fire', 'Contractor Fire', false],
      ['HVAC', 'Contractor HVAC', true],
    ]);
    expect(created.internalParticipants).toHaveLength(1);
    const ackKey = created.requiredAcknowledgements[0]!.key;

    // Electrical READY (with the required acknowledgement), from the contractor portal.
    await asContractor(database, s.electrical, s.orgId, (ctx) =>
      respondToCoordinationEvent(ctx, {
        projectId: s.projectId,
        eventId,
        participantId: electricalParty,
        status: 'ready',
        acknowledgedKeys: [ackKey],
      }),
    );

    // HVAC NOT READY + raise issue.
    const hvacAnswer = await asContractor(database, s.hvac, s.orgId, (ctx) =>
      respondToCoordinationEvent(ctx, {
        projectId: s.projectId,
        eventId,
        participantId: hvacParty,
        status: 'not_ready',
        note: 'Duct sleeves not delivered',
        acknowledgedKeys: [ackKey],
        raiseIssue: { title: 'Duct sleeves missing on floor 1' },
      }),
    );
    expect(hvacAnswer.issueId).not.toBeNull();
    expect(hvacAnswer.readiness?.state).toBe('not_ready');

    // Readiness matrix: Electrical READY, HVAC NOT READY, Fire WAITING (optional).
    const matrix = await detailAs(s, s.siteManager.id, eventId);
    expect(matrix.readiness.state).toBe('not_ready');
    expect(matrix.contractors.map((c) => [c.tradeLabel, c.readiness.state])).toEqual([
      ['Electrical', 'ready'],
      ['HVAC', 'not_ready'],
      ['Fire', 'waiting'],
    ]);
    expect(matrix.issues).toHaveLength(1);
    expect(matrix.issues[0]!.raisedBy.type).toBe('external');

    // Site manager turns the issue into a linked follow-up task for HVAC.
    const calls: CreateLinkedTaskInput[] = [];
    const taskId = randomUUID();
    const deps: CoordinationTaskDeps = {
      createLinkedTask: async (_context, input) => {
        calls.push(input);
        return { taskId };
      },
    };
    const followUp = await database.asUser(s.siteManager.id, async (tx) =>
      createCoordinationFollowUpTask(
        await orgContextFor(tx, s.siteManager.id, s.orgId),
        {
          projectId: s.projectId,
          eventId,
          participantId: hvacParty,
          issueId: hvacAnswer.issueId,
          title: 'Deliver duct sleeves before pour',
          dueDate: '2030-03-09',
        },
        deps,
      ),
    );
    expect(followUp).toEqual({ issueId: hvacAnswer.issueId, taskId });
    expect(calls[0]!.assignee).toEqual({
      kind: 'contractor',
      vendorId: s.hvac.vendorId,
      subcontractAgreementId: s.hvac.agreementId,
    });
    expect(calls[0]!.sources?.map((source) => source.entityType)).toEqual([
      'coordination_event',
      'coordination_participant',
      'coordination_response',
    ]);
    const [issue] = await database.asService((db) =>
      db.select().from(coordinationIssues).where(eq(coordinationIssues.id, hvacAnswer.issueId!)),
    );
    expect(issue!.status).toBe('task_created');
    expect(issue!.taskId).toBe(taskId);

    // HVAC reconfirms READY -> required parties all ready -> event READY.
    const reconfirm = await asContractor(database, s.hvac, s.orgId, (ctx) =>
      respondToCoordinationEvent(ctx, { projectId: s.projectId, eventId, participantId: hvacParty, status: 'ready' }),
    );
    expect(reconfirm.readiness?.state).toBe('ready');
    const ready = await detailAs(s, s.siteManager.id, eventId);
    expect(ready.readiness.isReady).toBe(true);
    expect(ready.readiness.requiredReadyCount).toBe(2);
    expect(ready.responses.filter((r) => r.participantId === hvacParty).map((r) => r.status)).toEqual([
      'ready',
      'not_ready',
    ]);

    // Outcome: completed with actual times.
    const outcome = await database.asUser(s.siteManager.id, async (tx) =>
      recordCoordinationOutcome(await orgContextFor(tx, s.siteManager.id, s.orgId), {
        projectId: s.projectId,
        eventId,
        outcome: 'completed',
        actualStartAt: '2030-03-10T07:20:00.000Z',
        actualEndAt: '2030-03-10T14:10:00.000Z',
      }),
    );
    expect(outcome.status).toBe('completed');

    // Closed events no longer accept answers.
    await expect(
      asContractor(database, s.hvac, s.orgId, (ctx) =>
        respondToCoordinationEvent(ctx, { projectId: s.projectId, eventId, participantId: hvacParty, status: 'ready' }),
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);

    const types = await eventTypes(eventId);
    expect(types[0]).toBe('coordination.event.created');
    expect(types.filter((type) => type === 'coordination.readiness.requested')).toHaveLength(3);
    expect(types).toContain('coordination.contractor.not_ready');
    expect(types).toContain('coordination.issue.raised');
    expect(types).toContain('coordination.issue.task_created');
    expect(types.filter((type) => type === 'coordination.event.ready')).toHaveLength(1);
    expect(types.at(-1)).toBe('coordination.event.completed');

    const [readyEvent] = await database.asService((db) =>
      db
        .select()
        .from(domainEvents)
        .where(and(eq(domainEvents.entityId, eventId), eq(domainEvents.eventType, 'coordination.event.ready'))),
    );
    expect(readyEvent!.actorType).toBe('external');
    expect(readyEvent!.actorPrincipalId).toBe(s.hvac.principalId);

    // Answers are append-only.
    await expect(
      database.asService((db) =>
        db.update(coordinationResponses).set({ status: 'blocked' }).where(eq(coordinationResponses.eventId, eventId)),
      ),
    ).rejects.toBeDefined();
  });

  it('isolates contractors: only invited vendors see the event, and only their own party / answers', async () => {
    const s = await scenario();
    const eventId = await createPour(s);
    const electricalParty = await participantOf(eventId, s.electrical.vendorId);
    const hvacParty = await participantOf(eventId, s.hvac.vendorId);

    await asContractor(database, s.hvac, s.orgId, (ctx) =>
      respondToCoordinationEvent(ctx, {
        projectId: s.projectId,
        eventId,
        participantId: hvacParty,
        status: 'blocked',
        note: 'Crane unavailable',
        raiseIssue: { title: 'Crane' },
      }),
    );

    await asContractor(database, s.electrical, s.orgId, async (ctx, tx) => {
      const schedule = await listContractorSchedule(ctx, s.projectId);
      expect(schedule.map((item) => item.id)).toEqual([eventId]);
      expect(schedule[0]!.invitations.map((invitation) => invitation.participantId)).toEqual([electricalParty]);
      const detail = await getContractorEventDetail(ctx, s.projectId, eventId);
      expect(detail.responses).toHaveLength(0);
      expect(detail.issues).toHaveLength(0);
      // Raw RLS view of the contractor's session.
      const parties = await tx.select().from(coordinationEventParticipants);
      expect(parties.map((p) => p.id)).toEqual([electricalParty]);
      expect(await tx.select().from(coordinationResponses)).toHaveLength(0);
      expect(await tx.select().from(coordinationIssues)).toHaveLength(0);
      // Cannot answer for another contractor's party.
      await expect(
        respondToCoordinationEvent(ctx, { projectId: s.projectId, eventId, participantId: hvacParty, status: 'ready' }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    // Direct insert for another party is rejected by RLS, even with a forged scope.
    await expect(
      asContractor(database, s.electrical, s.orgId, (_ctx, tx) =>
        tx.insert(coordinationResponses).values({
          organizationId: s.orgId,
          projectId: s.projectId,
          eventId,
          participantId: hvacParty,
          vendorId: s.electrical.vendorId,
          status: 'ready',
          eventStartsAtSnapshot: new Date(),
          actorType: 'external',
          actorPrincipalId: s.electrical.principalId,
        }),
      ),
    ).rejects.toBeDefined();

    // A contractor on the project that is NOT invited sees nothing.
    await asContractor(database, s.outsiderContractor, s.orgId, async (ctx, tx) => {
      expect(await listContractorSchedule(ctx, s.projectId)).toEqual([]);
      await expect(getContractorEventDetail(ctx, s.projectId, eventId)).rejects.toBeInstanceOf(NotFoundError);
      expect(await tx.select().from(coordinationEvents)).toHaveLength(0);
      const summary = await getContractorCoordinationSummary(ctx);
      expect(summary.upcoming).toHaveLength(0);
    });

    // View-only grant: sees the event but cannot answer.
    const readOnly = await createContractor(database, {
      organizationId: s.orgId,
      projectId: s.projectId,
      label: 'ReadOnly',
      capabilities: [X.PROJECT_VIEW, X.SCHEDULE_VIEW],
    });
    await database.asUser(s.siteManager.id, async (tx) => {
      const { inviteCoordinationParticipants } = await import('@/modules/coordination');
      await inviteCoordinationParticipants(await orgContextFor(tx, s.siteManager.id, s.orgId), {
        projectId: s.projectId,
        eventId,
        contractors: [{ vendorId: readOnly.vendorId, subcontractAgreementId: readOnly.agreementId, isRequired: false }],
      });
    });
    const readOnlyParty = await participantOf(eventId, readOnly.vendorId);
    await asContractor(database, readOnly, s.orgId, async (ctx) => {
      const [item] = await listContractorSchedule(ctx, s.projectId);
      expect(item!.invitations[0]!.canRespond).toBe(false);
      await expect(
        respondToCoordinationEvent(ctx, { projectId: s.projectId, eventId, participantId: readOnlyParty, status: 'ready' }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });

  it('enforces internal capabilities and audits an authorized readiness override', async () => {
    const s = await scenario();
    const eventId = await createPour(s);

    // schedule.view: read, but no write / override.
    await database.asUser(s.viewer.id, async (tx) => {
      const context = await orgContextFor(tx, s.viewer.id, s.orgId);
      const list = await listProjectCoordinationEvents(context, s.projectId);
      expect(list.items.map((item) => item.id)).toEqual([eventId]);
      expect(list.canManage).toBe(false);
      await expect(
        overrideCoordinationReadiness(context, { projectId: s.projectId, eventId, decision: 'force_ready', reason: 'Go ahead anyway' }),
      ).rejects.toBeInstanceOf(AuthorizationError);
      await expect(
        createCoordinationEvent(context, { projectId: s.projectId, title: 'X', startsAt: '2030-01-01T07:00:00Z' }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });

    // No capability on the project: nothing visible.
    await database.asUser(s.outsider.id, async (tx) => {
      const context = await orgContextFor(tx, s.outsider.id, s.orgId);
      await expect(listProjectCoordinationEvents(context, s.projectId)).rejects.toBeInstanceOf(AuthorizationError);
      expect(await listCoordinationCalendarItems(context, s.projectId, { from: new Date('2030-01-01'), to: new Date('2031-01-01') })).toEqual([]);
      expect(await tx.select().from(coordinationEvents)).toHaveLength(0);
    });

    // Override with reason -> READY (overridden), event.ready emitted, audited; clearing returns to computed.
    await database.asUser(s.siteManager.id, async (tx) => {
      const context = await orgContextFor(tx, s.siteManager.id, s.orgId);
      await overrideCoordinationReadiness(context, {
        projectId: s.projectId,
        eventId,
        decision: 'force_ready',
        reason: 'HVAC confirmed by phone, works outside pour zone',
      });
    });
    const overridden = await detailAs(s, s.siteManager.id, eventId);
    expect(overridden.readiness.state).toBe('ready');
    expect(overridden.readiness.overridden).toBe(true);
    expect(overridden.readiness.computedState).toBe('waiting');
    expect(overridden.overrides[0]!.reason).toContain('HVAC');
    expect(await eventTypes(eventId)).toContain('coordination.event.ready');
    const audits = await database.asService((db) =>
      db
        .select()
        .from(auditEvents)
        .where(and(eq(auditEvents.entityId, eventId), eq(auditEvents.action, 'coordination_event.readiness_overridden'))),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(s.siteManager.id);

    await database.asUser(s.siteManager.id, async (tx) => {
      const context = await orgContextFor(tx, s.siteManager.id, s.orgId);
      await overrideCoordinationReadiness(context, { projectId: s.projectId, eventId, decision: 'cleared', reason: 'Back to normal' });
      await expect(
        overrideCoordinationReadiness(context, { projectId: s.projectId, eventId, decision: 'cleared', reason: 'Again' }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
    expect((await detailAs(s, s.siteManager.id, eventId)).readiness.overridden).toBe(false);

    // Another project's id never resolves the event.
    await expect(
      database.asUser(s.userA.id, async (tx) =>
        getCoordinationEventDetail(await orgContextFor(tx, s.userA.id, s.orgId), s.otherProjectId, eventId),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('reschedules with history and requires reconfirmation; portal summary tracks pending answers', async () => {
    const s = await scenario();
    const eventId = await createPour(s);
    const electricalParty = await participantOf(eventId, s.electrical.vendorId);

    const before = await asContractor(database, s.electrical, s.orgId, (ctx) => getContractorCoordinationSummary(ctx, { now: new Date('2030-03-01T00:00:00Z') }));
    expect(before.upcoming.map((item) => item.id)).toEqual([eventId]);
    expect(before.upcoming[0]!.timeZone).toBe('Asia/Jerusalem');
    expect(before.pendingAcknowledgements.map((item) => item.reason)).toEqual(['response']);

    // Recorded on behalf by the site team, READY but without the acknowledgement.
    await database.asUser(s.siteManager.id, async (tx) =>
      recordResponseOnBehalf(await orgContextFor(tx, s.siteManager.id, s.orgId), {
        projectId: s.projectId,
        eventId,
        participantId: electricalParty,
        status: 'ready',
      }),
    );
    const pending = await asContractor(database, s.electrical, s.orgId, (ctx) => getContractorCoordinationSummary(ctx, { now: new Date('2030-03-01T00:00:00Z') }));
    expect(pending.pendingAcknowledgements.map((item) => item.reason)).toEqual(['acknowledgement']);
    expect((await detailAs(s, s.siteManager.id, eventId)).contractors[0]!.readiness.state).toBe('ready');

    await database.asUser(s.siteManager.id, async (tx) =>
      rescheduleCoordinationEvent(await orgContextFor(tx, s.siteManager.id, s.orgId), {
        projectId: s.projectId,
        eventId,
        startsAt: '2030-03-12T07:00:00.000Z',
        endsAt: '2030-03-12T15:00:00.000Z',
        reason: 'Concrete supplier delay',
        requiresReconfirmation: true,
      }),
    );
    const moved = await detailAs(s, s.siteManager.id, eventId);
    expect(moved.startsAt.toISOString()).toBe('2030-03-12T07:00:00.000Z');
    expect(moved.preparationDeadline?.toISOString()).toBe('2030-03-11T12:00:00.000Z');
    expect(moved.reschedules).toHaveLength(1);
    expect(moved.reschedules[0]!.previousStartsAt.toISOString()).toBe('2030-03-10T07:00:00.000Z');
    expect(moved.contractors[0]!.readiness.state).toBe('waiting');
    expect(moved.responses[0]!.superseded).toBe(true);
    const types = await eventTypes(eventId);
    expect(types).toContain('coordination.event.rescheduled');
    expect(types.filter((type) => type === 'coordination.readiness.requested')).toHaveLength(6);

    const contractorView = await asContractor(database, s.electrical, s.orgId, (ctx) =>
      getContractorEventDetail(ctx, s.projectId, eventId),
    );
    expect(contractorView.reschedules).toHaveLength(1);
    expect(contractorView.invitations[0]!.latestStatus).toBeNull();

    // Calendar source for the project timeline.
    const items = await database.asUser(s.viewer.id, async (tx) =>
      listCoordinationCalendarItems(await orgContextFor(tx, s.viewer.id, s.orgId), s.projectId, {
        from: new Date('2030-03-01T00:00:00Z'),
        to: new Date('2030-04-01T00:00:00Z'),
      }),
    );
    expect(items.map((item) => [item.id, item.readiness])).toEqual([[eventId, 'waiting']]);
  });
});
