import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  auditEvents,
  domainEvents,
  entityLinks,
  meetingActionItems,
  siteDailyLogEntries,
  siteDailyReports,
  siteInstructionEvents,
  siteInstructions,
  siteMeetingDetails,
  siteMeetingPublications,
} from '@drizzle/schema';
import {
  addDailyLogEntry,
  closeDailyLog,
  getContractorDailyReports,
  getDailyLogCalendar,
  getDailyLogDay,
  recordContractorDailyReport,
  reopenDailyLog,
  shiftIsoDate,
  submitContractorDailyReport,
  updateDailyLogHeader,
} from '@/modules/site-log';
import {
  acknowledgeInstructionAsContractor,
  getContractorInstruction,
  getContractorInstructionSummary,
  getInstructionDetail,
  issueInstruction,
  linkInstructionConversion,
  listContractorInstructions,
  reportInstructionPerformedAsContractor,
  requestInstructionConversion,
  transitionInstruction,
} from '@/modules/site-instructions';
import {
  addContractorMeetingAttendee,
  addMeetingActionItem,
  createSiteMeeting,
  getSiteMeetingDetail,
  listContractorMeetingMinutes,
  markSiteMeetingHeld,
  publishMeetingMinutes,
  recordMeetingDecision,
  saveMeetingMinutes,
} from '@/modules/site-meetings';
import { resolveEntityScope } from '@/shared/entity-access';
import { EXTERNAL_CAPABILITIES as X, type ExternalContext } from '@/shared/external';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createContractor, orgContextFor } from '@tests/setup/dg-fixtures';
import {
  insertStandInTask,
  runAsContractor,
  seedFieldScenario,
  type FieldScenario,
} from '@tests/setup/dg-fixtures-field';

const collaboration = vi.hoisted(() => ({ createLinkedTask: vi.fn() }));
vi.mock('@/modules/collaboration', () => ({ createLinkedTask: collaboration.createLinkedTask }));

const NOW_DATE = new Date().toISOString().slice(0, 10);
const TODAY_SAFE = shiftIsoDate(NOW_DATE, -3);
const LATER = shiftIsoDate(NOW_DATE, 30);

describe('Track O - daily site log, contractor meetings, site instructions (0165)', () => {
  let database: TestDatabase;
  let s: FieldScenario;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    collaboration.createLinkedTask.mockReset();
    s = await seedFieldScenario(database);
  });

  const asInternal = <T>(userId: string, fn: (ctx: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
    database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, s.orgId)));

  const asContractor = <T>(contractor: FieldScenario['contractorA'], fn: (ctx: ExternalContext) => Promise<T>) =>
    runAsContractor(database, contractor, s.orgId, fn);

  // ─── Daily log ─────────────────────────────────────────────────────────────

  describe('daily log', () => {
    it('creates the date log lazily with no mandatory fields and summarizes entries + reports', async () => {
      await asInternal(s.pmOps.id, async (ctx) => {
        await updateDailyLogHeader(ctx, { projectId: s.projectId, logDate: TODAY_SAFE });
        await addDailyLogEntry(ctx, {
          projectId: s.projectId,
          logDate: TODAY_SAFE,
          entryType: 'contractor_presence',
          vendorId: s.contractorA.vendorId,
          headcount: '6',
        });
        await addDailyLogEntry(ctx, {
          projectId: s.projectId,
          logDate: TODAY_SAFE,
          entryType: 'blocking_issue',
          description: 'Crane down',
        });
        await expect(
          addDailyLogEntry(ctx, { projectId: s.projectId, logDate: TODAY_SAFE, entryType: 'note' }),
        ).rejects.toMatchObject({ code: 'validation_failed' });
        await recordContractorDailyReport(ctx, {
          projectId: s.projectId,
          vendorId: s.contractorB.vendorId,
          reportDate: TODAY_SAFE,
          manpowerCount: '4',
        });
      });
      const day = await asInternal(s.foreman.id, (ctx) => getDailyLogDay(ctx, s.projectId, TODAY_SAFE));
      expect(day.log?.status).toBe('open');
      expect(day.entries).toHaveLength(2);
      expect(day.summary).toMatchObject({
        contractorsPresent: 2,
        recordedManpower: 6,
        reportedManpower: 4,
        blockingIssues: 1,
        contractorReports: 1,
      });
      expect(day.canManage).toBe(true);
      const calendar = await asInternal(s.pmOps.id, (ctx) => getDailyLogCalendar(ctx, s.projectId, { toDate: TODAY_SAFE }));
      expect(calendar.days[0]).toEqual(
        expect.objectContaining({ logDate: TODAY_SAFE, entryCount: 2, contractorReports: 1 }),
      );
      expect(calendar.days).toHaveLength(14);
    });

    it('locks a closed log (application + database) until reopened', async () => {
      await asInternal(s.pmOps.id, async (ctx) => {
        await addDailyLogEntry(ctx, { projectId: s.projectId, logDate: TODAY_SAFE, entryType: 'note', description: 'x' });
        await closeDailyLog(ctx, { projectId: s.projectId, logDate: TODAY_SAFE });
        await expect(
          addDailyLogEntry(ctx, { projectId: s.projectId, logDate: TODAY_SAFE, entryType: 'note', description: 'y' }),
        ).rejects.toMatchObject({ messageKey: 'siteOps.errors.logClosed' });
      });
      await database.asUser(s.pmOps.id, async (tx) => {
        const [log] = await tx.execute(sql`select id from site_daily_logs`).then((r) => resultRows<{ id: string }>(r));
        await expect(
          tx.insert(siteDailyLogEntries).values({
            organizationId: s.orgId,
            projectId: s.projectId,
            dailyLogId: log!.id,
            entryType: 'note',
            description: 'bypass',
          }),
        ).rejects.toBeDefined();
      });
      await asInternal(s.pmOps.id, async (ctx) => {
        await reopenDailyLog(ctx, { projectId: s.projectId, logDate: TODAY_SAFE });
        await addDailyLogEntry(ctx, { projectId: s.projectId, logDate: TODAY_SAFE, entryType: 'note', description: 'y' });
      });
    });

    it('denies the log to members without project capabilities and to contractors', async () => {
      await asInternal(s.pmOps.id, (ctx) =>
        addDailyLogEntry(ctx, { projectId: s.projectId, logDate: TODAY_SAFE, entryType: 'note', description: 'x' }),
      );
      await asInternal(s.outsider.id, async (ctx) => {
        await expect(getDailyLogDay(ctx, s.projectId, TODAY_SAFE)).rejects.toMatchObject({ code: 'authorization_denied' });
        expect(await ctx.db.select().from(siteDailyLogEntries)).toHaveLength(0);
      });
      await asInternal(s.foreman.id, async (ctx) => {
        // foreman holds daily_log.manage but not on the other project
        await expect(
          addDailyLogEntry(ctx, { projectId: s.otherProjectId, logDate: TODAY_SAFE, entryType: 'note', description: 'x' }),
        ).rejects.toMatchObject({ code: 'authorization_denied' });
      });
      await database.asUser(s.contractorA.authUser.id, async (tx) => {
        expect(await tx.select().from(siteDailyLogEntries)).toHaveLength(0);
        expect(await tx.execute(sql`select * from site_daily_logs`).then((r) => resultRows(r))).toHaveLength(0);
      });
    });
  });

  // ─── Contractor daily reports ──────────────────────────────────────────────

  describe('contractor daily reports', () => {
    it('lets contractor A submit revisions and keeps contractor B isolated', async () => {
      const first = await asContractor(s.contractorA, (ctx) =>
        submitContractorDailyReport(
          ctx,
          { projectId: s.projectId, reportDate: TODAY_SAFE, manpowerCount: '5', workPerformed: 'Formwork' },
          LATER,
        ),
      );
      const second = await asContractor(s.contractorA, (ctx) =>
        submitContractorDailyReport(ctx, { projectId: s.projectId, reportDate: TODAY_SAFE, manpowerCount: '7' }, LATER),
      );
      expect(first.revision).toBe(1);
      expect(second.revision).toBe(2);
      expect(second.supersedesReportId).toBe(first.id);
      expect(second.vendorId).toBe(s.contractorA.vendorId);

      const mine = await asContractor(s.contractorA, (ctx) => getContractorDailyReports(ctx, s.projectId));
      expect(mine.reports.map((r) => [r.revision, r.isLatest])).toEqual([
        [2, true],
        [1, false],
      ]);
      const theirs = await asContractor(s.contractorB, (ctx) => getContractorDailyReports(ctx, s.projectId));
      expect(theirs.reports).toHaveLength(0);

      // B cannot report as A's company (application) nor insert directly (RLS)
      await asContractor(s.contractorB, async (ctx) => {
        await expect(
          submitContractorDailyReport(
            ctx,
            { projectId: s.projectId, vendorId: s.contractorA.vendorId, reportDate: TODAY_SAFE },
            LATER,
          ),
        ).rejects.toMatchObject({ code: 'authorization_denied' });
        await expect(
          ctx.db.insert(siteDailyReports).values({
            organizationId: s.orgId,
            projectId: s.projectId,
            vendorId: s.contractorA.vendorId,
            reportDate: TODAY_SAFE,
            submittedActorType: 'external',
            submittedByPrincipalId: s.contractorB.principalId,
          }),
        ).rejects.toBeDefined();
      });

      // append-only
      await database.asService(async (db) => {
        await expect(
          db.update(siteDailyReports).set({ notes: 'tamper' }).where(eq(siteDailyReports.id, first.id)),
        ).rejects.toBeDefined();
      });

      // audit (external actor metadata) + event recorded
      const audits = await database.asService((db) =>
        db.select().from(auditEvents).where(eq(auditEvents.action, 'site_daily_report.submitted')),
      );
      expect(audits).toHaveLength(2);
      expect(audits[0]!.actorUserId).toBeNull();
      expect((audits[0]!.metadata as { actor: { type: string } }).actor.type).toBe('external');
      const events = await database.asService((db) =>
        db.select().from(domainEvents).where(eq(domainEvents.eventType, 'field.daily_log.submitted')),
      );
      expect(events.every((e) => e.actorType === 'external' && e.actorPrincipalId === s.contractorA.principalId)).toBe(true);

      // internal readers see both revisions in the day view
      const day = await asInternal(s.pmOps.id, (ctx) => getDailyLogDay(ctx, s.projectId, TODAY_SAFE));
      expect(day.reports).toHaveLength(2);
      expect(day.summary.reportedManpower).toBe(7);
    });

    it('requires ext.daily_log.submit and refuses future dates', async () => {
      const readOnly = await createContractor(database, {
        organizationId: s.orgId,
        projectId: s.projectId,
        label: 'ro',
        capabilities: [X.PROJECT_VIEW],
      });
      await asContractor(readOnly, async (ctx) => {
        await expect(
          submitContractorDailyReport(ctx, { projectId: s.projectId, reportDate: TODAY_SAFE }, LATER),
        ).rejects.toMatchObject({ code: 'authorization_denied' });
      });
      await asContractor(s.contractorA, async (ctx) => {
        await expect(
          submitContractorDailyReport(ctx, { projectId: s.projectId, reportDate: shiftIsoDate(NOW_DATE, 2) }, NOW_DATE),
        ).rejects.toMatchObject({ code: 'validation_failed' });
      });
    });
  });

  // ─── Site instructions ─────────────────────────────────────────────────────

  describe('site instructions', () => {
    async function issueToA(category: 'operational' | 'potentially_financial' | 'urgent_before_price' = 'operational') {
      return asInternal(s.pmOps.id, (ctx) =>
        issueInstruction(ctx, {
          projectId: s.projectId,
          vendorId: s.contractorA.vendorId,
          subcontractAgreementId: s.contractorA.agreementId,
          title: 'Move rebar to zone B',
          category,
          dueDate: '2026-01-20',
        }),
      );
    }

    it('numbers per project and runs issued -> acknowledged -> performed -> closed with contractor ack', async () => {
      const first = await issueToA();
      const second = await issueToA();
      expect([first.instructionNumber, second.instructionNumber]).toEqual([1, 2]);
      expect(first.status).toBe('issued');
      expect(first.conversionState).toBe('none');

      const listA = await asContractor(s.contractorA, (ctx) => listContractorInstructions(ctx, s.projectId));
      expect(listA.map((i) => i.id).sort()).toEqual([first.id, second.id].sort());
      const listB = await asContractor(s.contractorB, (ctx) => listContractorInstructions(ctx, s.projectId));
      expect(listB).toHaveLength(0);
      await asContractor(s.contractorB, async (ctx) => {
        await expect(getContractorInstruction(ctx, s.projectId, first.id)).rejects.toMatchObject({ code: 'not_found' });
        await expect(
          acknowledgeInstructionAsContractor(ctx, { projectId: s.projectId, instructionId: first.id }),
        ).rejects.toBeDefined();
      });

      const summaryBefore = await asContractor(s.contractorA, (ctx) => getContractorInstructionSummary(ctx));
      expect(summaryBefore.pendingAcknowledgements).toBe(2);

      const acked = await asContractor(s.contractorA, (ctx) =>
        acknowledgeInstructionAsContractor(ctx, { projectId: s.projectId, instructionId: first.id, note: 'On it' }),
      );
      expect(acked.status).toBe('acknowledged');
      await asContractor(s.contractorA, async (ctx) => {
        // contractors can never close: a direct 'closed' event is refused (RLS + trigger)
        await expect(
          ctx.db.insert(siteInstructionEvents).values({
            organizationId: s.orgId,
            projectId: s.projectId,
            instructionId: first.id,
            vendorId: s.contractorA.vendorId,
            eventType: 'closed',
            actorType: 'external',
            actorPrincipalId: s.contractorA.principalId,
          }),
        ).rejects.toBeDefined();
      });
      await asContractor(s.contractorA, async (ctx) => {
        await reportInstructionPerformedAsContractor(ctx, { projectId: s.projectId, instructionId: first.id });
        const detail = await getContractorInstruction(ctx, s.projectId, first.id);
        expect(detail.instruction.status).toBe('performed');
        expect(detail.events.map((e) => e.eventType)).toEqual(['issued', 'acknowledged', 'performed']);
        expect(detail.events[1]!.byContractor).toBe(true);
      });

      const summaryAfter = await asContractor(s.contractorA, (ctx) => getContractorInstructionSummary(ctx, { projectId: s.projectId }));
      expect(summaryAfter.pendingAcknowledgements).toBe(1);

      await asInternal(s.pmOps.id, async (ctx) => {
        // status can only change through events
        await expect(
          ctx.db.update(siteInstructions).set({ status: 'closed' }).where(eq(siteInstructions.id, first.id)),
        ).rejects.toBeDefined();
      });
      await asInternal(s.pmOps.id, async (ctx) => {
        await transitionInstruction(ctx, { projectId: s.projectId, instructionId: first.id, event: 'closed' });
        await expect(
          transitionInstruction(ctx, { projectId: s.projectId, instructionId: first.id, event: 'cancelled' }),
        ).rejects.toMatchObject({ messageKey: 'siteOps.errors.invalidTransition' });
        const detail = await getInstructionDetail(ctx, s.projectId, first.id);
        expect(detail.instruction.status).toBe('closed');
        expect(detail.instruction.acknowledgedActorType).toBe('external');
        expect(detail.instruction.acknowledgedByPrincipalId).toBe(s.contractorA.principalId);
        expect(detail.transitions).toEqual(['reopened']);
      });

      // history is append-only
      await database.asService(async (db) => {
        const [row] = await db.select().from(siteInstructionEvents).limit(1);
        await expect(
          db.update(siteInstructionEvents).set({ note: 'x' }).where(eq(siteInstructionEvents.id, row!.id)),
        ).rejects.toBeDefined();
      });

      const types = (await database.asService((db) => db.select().from(domainEvents))).map((e) => e.eventType);
      expect(types).toEqual(
        expect.arrayContaining([
          'field.instruction.issued',
          'field.instruction.acknowledged',
          'field.instruction.performed',
          'field.instruction.closed',
        ]),
      );
    });

    it('converts a potentially-financial instruction via conversion request + entity link', async () => {
      const operational = await issueToA('operational');
      const financial = await issueToA('potentially_financial');
      expect(financial.conversionState).toBe('pending');

      await asInternal(s.pmOps.id, async (ctx) => {
        await expect(
          requestInstructionConversion(ctx, { projectId: s.projectId, instructionId: operational.id, target: 'change' }),
        ).rejects.toMatchObject({ messageKey: 'siteOps.errors.conversionNotAllowed' });
        const outcome = await requestInstructionConversion(ctx, {
          projectId: s.projectId,
          instructionId: financial.id,
          target: 'change',
        });
        expect(outcome.linked).toBeNull();
        expect(outcome.instruction.conversionState).toBe('pending');

        const changeId = '00000000-0000-4000-8000-0000000000c1';
        const converted = await linkInstructionConversion(ctx, {
          projectId: s.projectId,
          instructionId: financial.id,
          targetType: 'subcontract_change',
          targetId: changeId,
        });
        expect(converted.conversionState).toBe('converted');
        const links = await ctx.db
          .select()
          .from(entityLinks)
          .where(and(eq(entityLinks.sourceType, 'site_instruction'), eq(entityLinks.sourceId, financial.id)));
        expect(links).toMatchObject([{ targetType: 'subcontract_change', targetId: changeId, relation: 'converted_to' }]);
      });

      const requested = await database.asService((db) =>
        db.select().from(domainEvents).where(eq(domainEvents.eventType, 'field.instruction.conversion_requested')),
      );
      expect(requested).toHaveLength(1);
      expect(requested[0]!.payload).toMatchObject({ target: 'change', vendorId: s.contractorA.vendorId });
      expect(JSON.stringify(requested[0]!.payload)).not.toMatch(/amount|price|value/i);

      // contractors never see the commercial follow-up events
      const detail = await asContractor(s.contractorA, (ctx) => getContractorInstruction(ctx, s.projectId, financial.id));
      expect(detail.events.map((e) => e.eventType)).toEqual(['issued']);
    });

    it('requires contractor.coordinate to issue and contractor.view to read', async () => {
      await asInternal(s.foreman.id, async (ctx) => {
        await expect(
          issueInstruction(ctx, { projectId: s.projectId, vendorId: s.contractorA.vendorId, title: 'x' }),
        ).rejects.toMatchObject({ code: 'authorization_denied' });
      });
      const issued = await issueToA();
      await asInternal(s.outsider.id, async (ctx) => {
        expect(await ctx.db.select().from(siteInstructions)).toHaveLength(0);
        await expect(getInstructionDetail(ctx, s.projectId, issued.id)).rejects.toMatchObject({
          code: 'authorization_denied',
        });
      });
      const scope = await asInternal(s.foreman.id, (ctx) =>
        resolveEntityScope(ctx.db, 'site_instruction', s.orgId, issued.id),
      );
      expect(scope).toMatchObject({ projectId: s.projectId, vendorId: s.contractorA.vendorId });
    });
  });

  // ─── Meetings ──────────────────────────────────────────────────────────────

  describe('contractor meetings', () => {
    it('reuses meeting tables, creates real linked tasks and publishes minutes to attending contractors only', async () => {
      const taskId = await insertStandInTask(database, s.orgId, 'Submit shop drawings');
      collaboration.createLinkedTask.mockResolvedValue({ taskId });

      const meetingId = await asInternal(s.pmOps.id, async (ctx) => {
        const id = await createSiteMeeting(ctx, {
          projectId: s.projectId,
          title: 'Weekly contractors #12',
          meetingType: 'weekly_contractor',
          scheduledAt: '2026-01-14T07:00:00Z',
          agenda: 'Pour floor 1',
        });
        await addContractorMeetingAttendee(ctx, { projectId: s.projectId, meetingId: id, vendorId: s.contractorA.vendorId });
        await recordMeetingDecision(ctx, { projectId: s.projectId, meetingId: id, title: 'Pour on Sunday' });
        const withTask = await addMeetingActionItem(ctx, {
          projectId: s.projectId,
          meetingId: id,
          title: 'Submit shop drawings',
          assignee: `vendor:${s.contractorA.vendorId}`,
          dueDate: '2026-01-18',
          createTask: true,
        });
        expect(withTask.taskId).toBe(taskId);
        await addMeetingActionItem(ctx, {
          projectId: s.projectId,
          meetingId: id,
          title: 'B to clear scaffold',
          assignee: `vendor:${s.contractorB.vendorId}`,
          createTask: false,
        });
        await addMeetingActionItem(ctx, {
          projectId: s.projectId,
          meetingId: id,
          title: 'Internal: update budget',
          createTask: false,
        });
        await expect(publishMeetingMinutes(ctx, { projectId: s.projectId, meetingId: id })).rejects.toMatchObject({
          messageKey: 'siteOps.errors.publishNotHeld',
        });
        await saveMeetingMinutes(ctx, { projectId: s.projectId, meetingId: id, minutes: 'Discussed pour.' });
        await markSiteMeetingHeld(ctx, { projectId: s.projectId, meetingId: id });
        const published = await publishMeetingMinutes(ctx, { projectId: s.projectId, meetingId: id });
        expect(published.version).toBe(1);
        return id;
      });

      expect(collaboration.createLinkedTask).toHaveBeenCalledWith(
        expect.objectContaining({ userId: s.pmOps.id }),
        expect.objectContaining({
          projectId: s.projectId,
          assignee: expect.objectContaining({ kind: 'contractor', vendorId: s.contractorA.vendorId }),
          sources: [{ entityType: 'site_meeting', entityId: meetingId, relation: 'action_item' }],
        }),
      );

      // reused legacy tables
      const items = await database.asService((db) =>
        db.select().from(meetingActionItems).where(eq(meetingActionItems.meetingId, meetingId)),
      );
      expect(items).toHaveLength(3);
      expect(items.find((i) => i.title === 'Submit shop drawings')!.taskId).toBe(taskId);

      const detail = await asInternal(s.foreman.id, (ctx) => getSiteMeetingDetail(ctx, s.projectId, meetingId));
      expect(detail.meeting.details.status).toBe('published');
      expect(detail.decisions).toHaveLength(1);
      expect(detail.internalAttendees).toHaveLength(1);
      expect(detail.canManage).toBe(false);

      const minutesA = await asContractor(s.contractorA, (ctx) => listContractorMeetingMinutes(ctx, s.projectId));
      expect(minutesA).toHaveLength(1);
      expect(minutesA[0]!.minutes).toBe('Discussed pour.');
      expect(minutesA[0]!.myActions.map((a) => a.title)).toEqual(['Submit shop drawings']);

      // B did not attend: sees no minutes at all
      const minutesB = await asContractor(s.contractorB, (ctx) => listContractorMeetingMinutes(ctx, s.projectId));
      expect(minutesB).toHaveLength(0);
      await database.asUser(s.contractorB.authUser.id, async (tx) => {
        expect(await tx.select().from(siteMeetingPublications)).toHaveLength(0);
        expect(await tx.select().from(siteMeetingDetails)).toHaveLength(0);
        expect(await tx.select().from(meetingActionItems)).toHaveLength(0);
      });

      // B invited later + republished: B sees minutes v2 with only its own action
      await asInternal(s.pmOps.id, async (ctx) => {
        await addContractorMeetingAttendee(ctx, { projectId: s.projectId, meetingId, vendorId: s.contractorB.vendorId });
        const republished = await publishMeetingMinutes(ctx, { projectId: s.projectId, meetingId });
        expect(republished.version).toBe(2);
      });
      const minutesB2 = await asContractor(s.contractorB, (ctx) => listContractorMeetingMinutes(ctx, s.projectId));
      expect(minutesB2).toHaveLength(1);
      expect(minutesB2[0]!.version).toBe(2);
      expect(minutesB2[0]!.myActions.map((a) => a.title)).toEqual(['B to clear scaffold']);

      // publications are immutable
      await database.asService(async (db) => {
        await expect(
          db.update(siteMeetingPublications).set({ minutes: 'rewrite' }).where(eq(siteMeetingPublications.meetingId, meetingId)),
        ).rejects.toBeDefined();
      });
      const published = await database.asService((db) =>
        db.select().from(domainEvents).where(eq(domainEvents.eventType, 'field.meeting.published')),
      );
      expect(published).toHaveLength(2);
    });

    it('requires meetings.manage on the project (application + RLS on reused tables)', async () => {
      await asInternal(s.foreman.id, async (ctx) => {
        await expect(
          createSiteMeeting(ctx, { projectId: s.projectId, title: 'x', scheduledAt: '2026-01-14T07:00:00Z' }),
        ).rejects.toMatchObject({ code: 'authorization_denied' });
      });
      const meetingId = await asInternal(s.pmOps.id, (ctx) =>
        createSiteMeeting(ctx, { projectId: s.projectId, title: 'Site walk', meetingType: 'site', scheduledAt: '2026-01-14T07:00:00Z' }),
      );
      await asInternal(s.outsider.id, async (ctx) => {
        expect(await ctx.db.select().from(siteMeetingDetails)).toHaveLength(0);
        await expect(getSiteMeetingDetail(ctx, s.projectId, meetingId)).rejects.toMatchObject({
          code: 'authorization_denied',
        });
      });
      // other tenant cannot see it at all
      await database.asUser(s.otherOwner.id, async (tx) => {
        expect(await tx.select().from(siteMeetingDetails)).toHaveLength(0);
      });
    });
  });
});
