import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { activityEvents } from '@drizzle/schema';
import { createBillingRecord, voidBillingRecord } from '@/modules/billing';
import {
  createClient,
  getClientTimeline,
  isShownAsActiveInvoice,
  recordActivityEvent,
} from '@/modules/clients';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('client timeline', () => {
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

  it('prevents org B from reading org A client timeline', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const clientId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Secret Ltd' });
      return client.id;
    });

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        return getClientTimeline(context, clientId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('does not show voided billing as an active invoice', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const result = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Alpha Ltd' });
      const project = await createProject(context, {
        name: 'Alpha job',
        clientId: client.id,
      });
      const billed = await createBillingRecord(context, {
        projectId: project.projectId,
        amount: '1800',
        issueDate: '2026-08-01',
        finalize: true,
      });
      await recordActivityEvent(context, {
        clientId: client.id,
        projectId: project.projectId,
        kind: 'billing_created',
        entityType: 'billing_record',
        entityId: billed.id,
        summary: 'Stale invoice pointer',
        deepLink: `/billing/${billed.id}`,
      });
      await voidBillingRecord(context, billed.id);
      const timeline = await getClientTimeline(context, client.id);
      return { billingId: billed.id, timeline };
    });

    const billingEvents = result.timeline.events.filter(
      (event) => event.entityType === 'billing_record' && event.entityId === result.billingId,
    );
    expect(billingEvents.some((event) => event.kind === 'billing_voided')).toBe(true);
    expect(
      billingEvents.some((event) =>
        isShownAsActiveInvoice({
          kind: event.kind,
          presentation: event.presentation,
          billingKind: 'invoice',
        }),
      ),
    ).toBe(false);
  });

  it('upserts activity_events idempotently for the same org/kind/entity', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const outcome = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Beta Ltd' });
      const entityId = client.id;
      const first = await recordActivityEvent(context, {
        clientId: client.id,
        kind: 'indexed',
        entityType: 'client',
        entityId,
        summary: 'First note',
      });
      const second = await recordActivityEvent(context, {
        clientId: client.id,
        kind: 'indexed',
        entityType: 'client',
        entityId,
        summary: 'Updated note',
      });
      const rows = await tx
        .select()
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.organizationId, orgA.organization.id),
            eq(activityEvents.kind, 'indexed'),
            eq(activityEvents.entityType, 'client'),
            eq(activityEvents.entityId, entityId),
          ),
        );
      return { firstId: first.id, secondId: second.id, rows, clientId: client.id };
    });

    expect(outcome.secondId).toBe(outcome.firstId);
    expect(outcome.rows).toHaveLength(1);
    expect(outcome.rows[0]?.summary).toBe('Updated note');
  });
});
