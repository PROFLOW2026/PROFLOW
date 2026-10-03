import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  domainEventRetries,
  domainEvents,
  externalAccessGrants,
  externalNotifications,
  notifications,
} from '@drizzle/schema';
import { createDgEventHandlerRegistry, runDgEventConsumer } from '@/modules/dg-events';
import {
  listExternalNotifications,
  listNotifications,
  markExternalNotificationRead,
  unreadExternalCount,
} from '@/modules/notifications';
import { localizeNotificationInbox } from '@/modules/notifications/application/localize-notifications';
import { addProjectMember } from '@/modules/project-team';
import { externalActor, internalActor, type Actor } from '@/shared/actor';
import { emitDomainEvent } from '@/shared/domain-events';
import { EXTERNAL_GRANT_TEMPLATES, type ExternalContext } from '@/shared/external';
import { NotFoundError } from '@/shared/errors';
import { notificationsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
import type { Database, Transaction } from '@/shared/db/types';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  externalContextFor,
  orgContextFor,
  type ContractorFixture,
} from '@tests/setup/dg-fixtures';
import { provisionTwoTenants } from '../projects/setup';

/**
 * Track T — domain-event consumer, internal + external notifications (migration 0169).
 *
 * Run with WIP SQL (local PGlite only; never Production):
 *   $env:PF_WIP_FILES='0169_dg_notifications_command_center.sql'
 *   npx vitest run tests/integration/dg-events
 */

const translator = async (locale: string) => notificationsCopyTranslator(locale);

describe('dg domain-event consumer (migration 0169)', () => {
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
    const siteUserA = await createContractor(database, {
      organizationId: orgId,
      projectId,
      label: 'A-site',
      vendorId: contractorA.vendorId,
      withAgreement: false,
      capabilities: EXTERNAL_GRANT_TEMPLATES.site_contractor,
    });
    const pmOps = await addOrgMember(database, orgId, 'pm-ops');
    const surveyor = await addOrgMember(database, orgId, 'qs');
    const accountant = await addOrgMember(database, orgId, 'acct');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: pmOps.id, templateKey: 'project_manager_operational' });
      await addProjectMember(context, { projectId, userId: surveyor.id, templateKey: 'quantity_surveyor' });
      await addProjectMember(context, { projectId, userId: accountant.id, templateKey: 'project_accountant' });
    });
    // Setup itself may emit domain events (e.g. project team changes); start every test from an empty outbox.
    await consume();
    return { orgId, userA, projectId, contractorA, contractorB, siteUserA, pmOps, surveyor, accountant };
  }

  async function emit(input: {
    orgId: string;
    projectId: string | null;
    type: string;
    entityType: string;
    entityId: string;
    actor: Actor;
    payload?: Record<string, unknown>;
  }): Promise<string> {
    return database.asService((db) =>
      emitDomainEvent(db, {
        organizationId: input.orgId,
        projectId: input.projectId,
        type: input.type as never,
        entityType: input.entityType,
        entityId: input.entityId,
        actor: input.actor,
        payload: input.payload,
      }),
    );
  }

  function consume(options: Parameters<typeof runDgEventConsumer>[1] = {}) {
    return database.asService((db: Database) => runDgEventConsumer(db, { translator, ...options }));
  }

  /** Grants are read before the RLS transaction opens (the PGlite harness serializes connections). */
  async function asContractor<T>(
    contractor: ContractorFixture,
    orgId: string,
    fn: (context: ExternalContext, tx: Transaction) => Promise<T>,
  ): Promise<T> {
    const base = await externalContextFor(database, null as never, contractor, orgId);
    return database.asUser(contractor.authUser.id, (tx) => fn({ ...base, db: tx }, tx));
  }

  async function eventRow(eventId: string) {
    const [row] = await database.asService((db) => db.select().from(domainEvents).where(eq(domainEvents.id, eventId)));
    return row!;
  }

  async function internalRows(orgId: string) {
    return database.asService((db) => db.select().from(notifications).where(eq(notifications.organizationId, orgId)));
  }

  async function externalRows(orgId: string) {
    return database.asService((db) =>
      db.select().from(externalNotifications).where(eq(externalNotifications.organizationId, orgId)),
    );
  }

  const CLAIM_ID = '018f1234-5678-7abc-8def-00000000c001';

  it('sends a submitted claim only to claim reviewers (no operational user, no contractor)', async () => {
    const s = await scenario();
    const eventId = await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.submitted',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: externalActor(s.contractorA.principalId),
      payload: { vendorId: s.contractorA.vendorId, agreementId: s.contractorA.agreementId, reference: 'C-001' },
    });
    const result = await consume();
    expect(result).toMatchObject({ claimed: 1, processed: 1, failed: 0, internalNotifications: 1, externalNotifications: 0 });

    const rows = await internalRows(s.orgId);
    expect(rows.map((row) => row.recipientUserId)).toEqual([s.surveyor.id]);
    expect(rows[0]).toMatchObject({
      type: 'dg_claim',
      domain: 'contractor_finance',
      severity: 'warning',
      deepLink: `/projects/${s.projectId}/claims/${CLAIM_ID}`,
      // Stored fallback text is in the organization default locale; readers re-render in their own.
      title: 'חשבון חלקי ממתין לבדיקה',
    });
    expect(await externalRows(s.orgId)).toHaveLength(0);

    const event = await eventRow(eventId);
    expect(event.processedAt).not.toBeNull();
    expect(event.lastError).toBeNull();
  });

  it('sends a certified claim to contractor A financial users only, never B or A site users, and resolves the review', async () => {
    const s = await scenario();
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.submitted',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: externalActor(s.contractorA.principalId),
      payload: { vendorId: s.contractorA.vendorId, agreementId: s.contractorA.agreementId },
    });
    await consume();
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.certified',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: internalActor(s.surveyor.id),
      payload: { vendorId: s.contractorA.vendorId, agreementId: s.contractorA.agreementId, status: 'certified' },
    });
    const result = await consume();
    expect(result.resolved).toBe(1);

    const external = await externalRows(s.orgId);
    expect(external.map((row) => row.principalId)).toEqual([s.contractorA.principalId]);
    expect(external[0]).toMatchObject({
      vendorId: s.contractorA.vendorId,
      subcontractAgreementId: s.contractorA.agreementId,
      deepLink: `/contractor/projects/${s.projectId}/claims/${CLAIM_ID}`,
      requiredCapabilities: ['ext.claim.view'],
    });

    const internal = await internalRows(s.orgId);
    const certified = internal.filter((row) => row.dedupeKey.startsWith('dg:subcontract.claim.certified'));
    expect(certified.map((row) => row.recipientUserId)).toEqual([s.accountant.id]);
    expect(internal.some((row) => row.recipientUserId === s.pmOps.id)).toBe(false);
    const review = internal.find((row) => row.dedupeKey.startsWith('dg:subcontract.claim.submitted'));
    expect(review!.resolvedAt).not.toBeNull();
  });

  it('isolates contractors for operational events and honours named assignees', async () => {
    const s = await scenario();
    const defectId = '018f1234-5678-7abc-8def-00000000d001';
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'defect.item.assigned',
      entityType: 'defect',
      entityId: defectId,
      actor: internalActor(s.pmOps.id),
      payload: { vendorId: s.contractorB.vendorId, agreementId: s.contractorB.agreementId },
    });
    const taskId = '018f1234-5678-7abc-8def-00000000e001';
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'task.external.assigned',
      entityType: 'task',
      entityId: taskId,
      actor: internalActor(s.pmOps.id),
      payload: { vendorId: s.contractorA.vendorId, assigneePrincipalId: s.siteUserA.principalId },
    });
    await consume();

    const external = await externalRows(s.orgId);
    const defect = external.filter((row) => row.entityId === defectId);
    expect(defect.map((row) => row.principalId)).toEqual([s.contractorB.principalId]);
    const task = external.filter((row) => row.entityId === taskId);
    expect(task.map((row) => row.principalId)).toEqual([s.siteUserA.principalId]);
    expect(task[0]!.deepLink).toBe(`/contractor/projects/${s.projectId}/tasks/${taskId}`);
  });

  it('routes operational events to capability holders and falls back to project admins', async () => {
    const s = await scenario();
    const rfiId = '018f1234-5678-7abc-8def-00000000f001';
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'rfi.request.submitted',
      entityType: 'rfi',
      entityId: rfiId,
      actor: externalActor(s.contractorA.principalId),
      payload: { vendorId: s.contractorA.vendorId },
    });
    const emptyProject = await createProjectAs(database, s.userA.id, s.orgId, 'No team');
    await emit({
      orgId: s.orgId,
      projectId: emptyProject,
      type: 'rfi.request.submitted',
      entityType: 'rfi',
      entityId: '018f1234-5678-7abc-8def-00000000f002',
      actor: { type: 'system' },
    });
    await consume();
    const rows = await internalRows(s.orgId);
    expect(rows.filter((row) => row.entityId === rfiId).map((row) => row.recipientUserId)).toEqual([s.pmOps.id]);
    expect(
      rows.filter((row) => row.entityId === '018f1234-5678-7abc-8def-00000000f002').map((row) => row.recipientUserId),
    ).toEqual([s.userA.id]);
  });

  it('is idempotent and collapses bursts on the same subject', async () => {
    const s = await scenario();
    const payload = { vendorId: s.contractorA.vendorId, agreementId: s.contractorA.agreementId };
    const eventId = await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.submitted',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: externalActor(s.contractorA.principalId),
      payload,
    });
    await consume();
    expect((await consume()).claimed).toBe(0);

    // Replaying an already-delivered event (processing columns reset) changes nothing.
    await database.asService((db) =>
      db.update(domainEvents).set({ processedAt: null }).where(eq(domainEvents.id, eventId)),
    );
    expect((await consume()).processed).toBe(1);
    let rows = await internalRows(s.orgId);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.metadata as { dg: { occurrences: number } }).dg.occurrences).toBe(1);

    // A resubmission of the same claim collapses into the same unread row.
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.submitted',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: externalActor(s.contractorA.principalId),
      payload,
    });
    await consume();
    rows = await internalRows(s.orgId);
    expect(rows).toHaveLength(1);
    expect((rows[0]!.metadata as { dg: { occurrences: number } }).dg.occurrences).toBe(2);

    const inbox = await database.asUser(s.surveyor.id, async (tx) => {
      const context = await orgContextFor(tx, s.surveyor.id, s.orgId);
      return localizeNotificationInbox(await listNotifications(context), notificationsCopyTranslator('en'));
    });
    expect(inbox.unreadCount).toBe(1);
    expect(inbox.items[0]!.title).toBe('Progress claim awaiting review (2)');
    expect(inbox.items[0]!.body).toContain('Tower');
    expect(inbox.items[0]!.body).toContain('Contractor A');
  });

  it('marks unknown event types processed without side effects', async () => {
    const s = await scenario();
    const eventId = await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'foundation.test.happened',
      entityType: 'foundation_test',
      entityId: s.projectId,
      actor: internalActor(s.userA.id),
    });
    const result = await consume();
    expect(result).toMatchObject({ processed: 1, ignored: 1, internalNotifications: 0, externalNotifications: 0 });
    expect(await internalRows(s.orgId)).toHaveLength(0);
    expect((await eventRow(eventId)).processedAt).not.toBeNull();
  });

  it('records failures, backs off, retries, and rolls back partial side effects', async () => {
    const s = await scenario();
    const eventId = await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'rfi.request.submitted',
      entityType: 'rfi',
      entityId: '018f1234-5678-7abc-8def-00000000f003',
      actor: externalActor(s.contractorA.principalId),
      payload: { vendorId: s.contractorA.vendorId },
    });
    const working = createDgEventHandlerRegistry();
    const failing = createDgEventHandlerRegistry();
    failing.register('rfi.request.submitted', async (db, event, deps) => {
      await working.get('rfi.request.submitted')!(db, event, deps);
      throw new Error('downstream exploded');
    });

    const t0 = new Date();
    const first = await consume({ registry: failing, now: () => t0 });
    expect(first).toMatchObject({ failed: 1, processed: 0 });
    expect(first.failures[0]).toMatchObject({ eventId, attempts: 1, error: 'downstream exploded' });
    expect(await internalRows(s.orgId)).toHaveLength(0);

    expect(await eventRow(eventId)).toMatchObject({ attempts: 1, lastError: 'downstream exploded', processedAt: null });
    const [retry] = await database.asService((db) =>
      db.select().from(domainEventRetries).where(eq(domainEventRetries.eventId, eventId)),
    );
    expect(retry!.nextAttemptAt.getTime()).toBe(t0.getTime() + 30_000);

    expect((await consume({ registry: working, now: () => t0 })).claimed).toBe(0);

    const later = new Date(t0.getTime() + 60_000);
    const second = await consume({ registry: working, now: () => later });
    expect(second).toMatchObject({ claimed: 1, processed: 1, failed: 0 });
    expect(await internalRows(s.orgId)).toHaveLength(1);
    expect(
      await database.asService((db) =>
        db.select().from(domainEventRetries).where(eq(domainEventRetries.eventId, eventId)),
      ),
    ).toHaveLength(0);
    expect(await eventRow(eventId)).toMatchObject({ attempts: 2, lastError: null });
  });

  it('lets a principal read and mark only its own notifications (RLS + portal API)', async () => {
    const s = await scenario();
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.certified',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: internalActor(s.surveyor.id),
      payload: { vendorId: s.contractorA.vendorId, agreementId: s.contractorA.agreementId, reference: 'C-9' },
    });
    await consume();
    const [row] = await externalRows(s.orgId);

    await asContractor(s.contractorA, s.orgId, async (context) => {
      expect(await unreadExternalCount(context)).toBe(1);
      const items = await listExternalNotifications(context);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ title: 'Progress claim certified', severity: 'info' });
      expect(items[0]!.body).toContain('C-9');
      expect(items[0]!.body).not.toContain('Contractor A');
      await markExternalNotificationRead(context, items[0]!.id);
      expect(await unreadExternalCount(context)).toBe(0);
    });

    await asContractor(s.contractorB, s.orgId, async (context, tx) => {
      expect(await tx.select().from(externalNotifications)).toHaveLength(0);
      expect(await listExternalNotifications(context)).toHaveLength(0);
      await expect(markExternalNotificationRead(context, row!.id)).rejects.toBeInstanceOf(NotFoundError);
    });

    await database.asUser(s.pmOps.id, async (tx) => {
      expect(await tx.select().from(externalNotifications)).toHaveLength(0);
    });

    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      await expect(
        tx.insert(externalNotifications).values({
          organizationId: s.orgId,
          principalId: s.contractorA.principalId,
          eventType: 'x.y.z',
          copyKey: 'x',
          dedupeKey: 'forged',
        }),
      ).rejects.toBeDefined();
    });
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      await expect(
        tx.update(externalNotifications).set({ copyKey: 'tampered' }).where(eq(externalNotifications.id, row!.id)),
      ).rejects.toBeDefined();
    });
  });

  it('hides a stored notification once the grant loses the required capability', async () => {
    const s = await scenario();
    await emit({
      orgId: s.orgId,
      projectId: s.projectId,
      type: 'subcontract.claim.returned',
      entityType: 'subcontract_claim',
      entityId: CLAIM_ID,
      actor: internalActor(s.surveyor.id),
      payload: { vendorId: s.contractorA.vendorId, agreementId: s.contractorA.agreementId },
    });
    await consume();
    await database.asService((db) =>
      db
        .update(externalAccessGrants)
        .set({ scopes: [...EXTERNAL_GRANT_TEMPLATES.site_contractor] })
        .where(eq(externalAccessGrants.id, s.contractorA.grantId)),
    );
    await asContractor(s.contractorA, s.orgId, async (context) => {
      expect(await listExternalNotifications(context)).toHaveLength(0);
      expect(await unreadExternalCount(context)).toBe(0);
    });
  });
});
