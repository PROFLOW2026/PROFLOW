import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { emitNotification, listNotifications } from '@/modules/notifications';
import { buildDedupeKey } from '@/modules/notifications/domain/dedupe';
import { acceptInvitation, createInvitation, resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, createTwoTenantScenario } from '../../setup/fixtures';

const ENTITY_A = '018f1234-5678-7abc-8def-aaaaaaaaaaa1';
const ENTITY_B = '018f1234-5678-7abc-8def-bbbbbbbbbbb1';

describe('notifications isolation', () => {
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

  it('keeps org A notifications invisible to org B', async () => {
    const { orgA, orgB, userA, userB } = await createTwoTenantScenario(database);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await emitNotification(context, {
        recipientUserId: userA.id,
        type: 'billing_overdue',
        title: 'Overdue invoice',
        body: 'Customer billing is outstanding.',
        dedupeKey: buildDedupeKey('billing_overdue', ENTITY_A),
        severity: 'urgent',
        entityType: 'billing_record',
        entityId: ENTITY_A,
        deepLink: `/billing/${ENTITY_A}`,
      });
    });

    const inboxA = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listNotifications(context);
    });
    expect(inboxA.unreadCount).toBe(1);
    expect(inboxA.items[0]?.title).toBe('Overdue invoice');

    const inboxB = await database.asUser(userB.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });
      return listNotifications(context);
    });
    expect(inboxB.unreadCount).toBe(0);
    expect(inboxB.items).toHaveLength(0);
  });

  it('keeps recipient A notifications invisible to recipient B in the same org', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);
    const invitation = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return createInvitation(context, { email: 'worker-a@example.test', roleKey: 'worker' });
    });
    const worker = await createTestUser(database, 'worker-a@example.test');
    await database.asService((db) =>
      acceptInvitation(db, {
        token: invitation.token,
        userId: worker.id,
        userEmail: worker.email,
      }),
    );

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await emitNotification(context, {
        recipientUserId: userA.id,
        type: 'approval_waiting',
        title: 'Waiting for approval',
        body: 'A request is waiting.',
        dedupeKey: buildDedupeKey('approval_waiting', ENTITY_B),
        entityType: 'approval_request',
        entityId: ENTITY_B,
      });
    });

    const ownerInbox = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listNotifications(context);
    });
    expect(ownerInbox.unreadCount).toBe(1);

    const workerInbox = await database.asUser(worker.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: worker.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listNotifications(context);
    });
    expect(workerInbox.unreadCount).toBe(0);
    expect(workerInbox.items).toHaveLength(0);
  });

  it('upserts the same dedupe key instead of duplicating', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);
    const key = buildDedupeKey('document_expiring', ENTITY_A);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await emitNotification(context, {
        recipientUserId: userA.id,
        type: 'document_expiring',
        title: 'Document expiring',
        body: 'First',
        dedupeKey: key,
        entityType: 'document',
        entityId: ENTITY_A,
      });
      await emitNotification(context, {
        recipientUserId: userA.id,
        type: 'document_expiring',
        title: 'Document expiring',
        body: 'Second',
        dedupeKey: key,
        entityType: 'document',
        entityId: ENTITY_A,
      });
    });

    const inbox = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return listNotifications(context);
    });
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]?.body).toBe('Second');
  });

  it('requires notifications.read', async () => {
    const { orgA, userA } = await createTwoTenantScenario(database);
    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        const permissions = new Set(context.permissions);
        permissions.delete(PERMISSIONS.NOTIFICATIONS_READ);
        return listNotifications({ ...context, permissions });
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
