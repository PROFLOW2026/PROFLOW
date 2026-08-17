import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  assistantConversations,
  assistantMessages,
  automationRules,
  documentLinks,
  documents,
  organizationIntegrations,
  organizationMemberships,
  organizationSettings,
  organizations,
  outboundCommunicationAttempts,
  outboundCommunicationAttachments,
  outboundCommunications,
  profiles,
  projectAccessGrants,
  projectCloseoutEvents,
  projectCloseouts,
  projects,
  roleAssignments,
  rolePermissions,
  roles,
  vendors,
  warrantyCoverages,
  warrantyIssues,
  workPackages,
} from '@drizzle/schema';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { seedSystemData } from '@drizzle/seed/system';
import { createTestDatabase, resultRows, type TestDatabase } from '../../setup/database';

describe('0055-0058 owner SQL review security and integrity', () => {
  let database: TestDatabase;
  let orgId: string;
  let otherOrgId: string;
  let ownerId: string;
  let otherOwnerId: string;
  let projectAId: string;
  let projectBId: string;
  let ownerMembershipId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    otherOrgId = randomUUID();
    ownerId = randomUUID();
    otherOwnerId = randomUUID();
    projectAId = randomUUID();
    projectBId = randomUUID();
    ownerMembershipId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);
      await db.insert(profiles).values([
        { id: ownerId, email: 'owner-nextgen@example.test', displayName: 'Owner' },
        { id: otherOwnerId, email: 'other-nextgen@example.test', displayName: 'Other' },
      ]);
      await db.insert(organizations).values([
        {
          id: orgId,
          name: 'NextGen Org',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
        {
          id: otherOrgId,
          name: 'Other Org',
          baseCurrency: 'ILS',
          timezone: 'Asia/Jerusalem',
          countryCode: 'IL',
          defaultLocale: 'he-IL',
        },
      ]);
      const otherMembershipId = randomUUID();
      await db.insert(organizationMemberships).values([
        { id: ownerMembershipId, organizationId: orgId, userId: ownerId, status: 'active' },
        {
          id: otherMembershipId,
          organizationId: otherOrgId,
          userId: otherOwnerId,
          status: 'active',
        },
      ]);
      const rolesA = await provisionOrganizationRoles(db, orgId);
      const rolesB = await provisionOrganizationRoles(db, otherOrgId);
      await assignRole(db, {
        organizationId: orgId,
        membershipId: ownerMembershipId,
        userId: ownerId,
        roleId: rolesA.owner,
      });
      await assignRole(db, {
        organizationId: otherOrgId,
        membershipId: otherMembershipId,
        userId: otherOwnerId,
        roleId: rolesB.owner,
      });
      await db.insert(organizationSettings).values({
        organizationId: orgId,
        key: 'project_access_mode',
        value: 'selected',
      });
      await db.insert(projects).values([
        {
          id: projectAId,
          organizationId: orgId,
          name: 'Project A',
          status: 'active',
          currency: 'ILS',
          workKind: 'project',
        },
        {
          id: projectBId,
          organizationId: orgId,
          name: 'Project B',
          status: 'active',
          currency: 'ILS',
          workKind: 'project',
        },
      ]);
    });
  });

  async function createScopedMember(email: string, permissionKeys: string[], projectIds: string[]) {
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(profiles).values({
        id: userId,
        email,
        displayName: email.split('@')[0]!,
      });
      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });
      await db.insert(roles).values({
        id: roleId,
        organizationId: orgId,
        key: `scoped-${userId.slice(0, 8)}`,
        name: 'Scoped',
        rank: 50,
        isProtected: false,
      });
      if (permissionKeys.length > 0) {
        await db.insert(rolePermissions).values(
          permissionKeys.map((permissionKey) => ({
            organizationId: orgId,
            roleId,
            permissionKey,
          })),
        );
      }
      await db.insert(roleAssignments).values({
        organizationId: orgId,
        membershipId,
        userId,
        roleId,
      });
      if (projectIds.length > 0) {
        await db.insert(projectAccessGrants).values(
          projectIds.map((projectId) => ({
            organizationId: orgId,
            userId,
            projectId,
            accessLevel: 'read' as const,
          })),
        );
      }
    });
    return { userId, membershipId, roleId };
  }

  async function expectDenied(fn: () => Promise<unknown>) {
    await expect(fn()).rejects.toThrow();
  }

  async function withServiceLatch<T>(kind: string, fn: (db: typeof database.db) => Promise<T>): Promise<T> {
    return database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`SELECT app.next_gen_latch_acquire(${kind})`);
      try {
        return await fn(db);
      } finally {
        await db.execute(sql`SELECT app.next_gen_latch_release(${kind})`);
      }
    });
  }

  it('blocks same-org wrong-project closeout, warranty coverage, and warranty issue relations', async () => {
    const closeoutA = randomUUID();
    const coverageA = randomUUID();
    const wpB = randomUUID();
    await withServiceLatch('closeout', async (db) => {
      await db.insert(projectCloseouts).values({
        id: closeoutA,
        organizationId: orgId,
        projectId: projectAId,
        status: 'open',
      });
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(workPackages).values({
        id: wpB,
        organizationId: orgId,
        projectId: projectBId,
        name: 'Package B',
      });
      await db.insert(warrantyCoverages).values({
        id: coverageA,
        organizationId: orgId,
        projectId: projectAId,
        title: 'Coverage A',
      });
    });

    await expectDenied(() =>
      withServiceLatch('closeout', async (db) => {
        await db.insert(projectCloseoutEvents).values({
          organizationId: orgId,
          closeoutId: closeoutA,
          projectId: projectBId,
          eventKind: 'started',
        });
      }),
    );

    await expectDenied(() =>
      database.asService(async (db) => {
        await db.insert(warrantyCoverages).values({
          organizationId: orgId,
          projectId: projectAId,
          workPackageId: wpB,
          title: 'Cross project package',
        });
      }),
    );

    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO calendar_events (
            organization_id, title, event_kind, event_date, starts_at, ends_at, all_day
          ) VALUES (
            ${orgId}::uuid, 'Backwards', 'meeting', CURRENT_DATE,
            now() + interval '2 hours', now(), false
          )
        `);
      }),
    );
  });

  it('allows a same-org work_order link without treating it as the original project', async () => {
    const coverageA = randomUUID();
    const workOrderId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(warrantyCoverages).values({
        id: coverageA,
        organizationId: orgId,
        projectId: projectAId,
        title: 'Coverage A',
      });
      await db.insert(projects).values({
        id: workOrderId,
        organizationId: orgId,
        name: 'Warranty call',
        status: 'active',
        currency: 'ILS',
        workKind: 'work_order',
      });
      await db.insert(warrantyIssues).values({
        organizationId: orgId,
        coverageId: coverageA,
        projectId: projectAId,
        workOrderId,
        title: 'Callback',
      });
    });

    await expectDenied(() =>
      database.asService(async (db) => {
        await db.insert(warrantyIssues).values({
          organizationId: orgId,
          coverageId: coverageA,
          projectId: projectAId,
          workOrderId: projectAId,
          title: 'Cannot link original project',
        });
      }),
    );
  });

  it('keeps closeout history append-only and refuses jobs in classic closeout', async () => {
    const closeoutA = randomUUID();
    const eventId = randomUUID();
    const jobId = randomUUID();
    await withServiceLatch('closeout', async (db) => {
      await db.insert(projectCloseouts).values({
        id: closeoutA,
        organizationId: orgId,
        projectId: projectAId,
        status: 'open',
      });
      await db.insert(projectCloseoutEvents).values({
        id: eventId,
        organizationId: orgId,
        closeoutId: closeoutA,
        projectId: projectAId,
        eventKind: 'started',
      });
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(projects).values({
        id: jobId,
        organizationId: orgId,
        name: 'Job',
        status: 'active',
        currency: 'ILS',
        workKind: 'job',
      });
    });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(
          sql`UPDATE project_closeout_events SET reason = 'rewrite' WHERE id = ${eventId}`,
        );
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM project_closeout_events WHERE id = ${eventId}`);
      }),
    );

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(
          sql`UPDATE project_closeouts
            SET status = 'closed', close_reason = 'done', financial_snapshot_json = '{"v":1}'::jsonb
            WHERE id = ${closeoutA}`,
        );
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(
          sql`UPDATE project_closeouts SET financial_snapshot_json = '{"v":2}'::jsonb WHERE id = ${closeoutA}`,
        );
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM project_closeouts WHERE id = ${closeoutA}`);
      }),
    );
    await expectDenied(() =>
      withServiceLatch('closeout', async (db) => {
        await db.insert(projectCloseouts).values({
          organizationId: orgId,
          projectId: jobId,
          status: 'open',
        });
      }),
    );
  });

  it('hides other-project communication children and new document owner types from selected-project users', async () => {
    const scoped = await createScopedMember(
      'scoped-a@example.test',
      [
        'projects.read',
        'projects.update',
        'communications.read',
        'communications.manage',
        'documents.read',
        'documents.manage',
        'scheduling.read',
      ],
      [projectAId],
    );
    const commB = randomUUID();
    const attemptB = randomUUID();
    const closeoutB = randomUUID();
    const coverageB = randomUUID();
    const issueB = randomUUID();
    const calendarB = randomUUID();
    const docB = randomUUID();
    const commDoc = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`SELECT app.next_gen_latch_acquire('closeout')`);
      await db.insert(projectCloseouts).values({
        id: closeoutB,
        organizationId: orgId,
        projectId: projectBId,
        status: 'open',
      });
      await db.execute(sql`SELECT app.next_gen_latch_release('closeout')`);
      await db.insert(warrantyCoverages).values({
        id: coverageB,
        organizationId: orgId,
        projectId: projectBId,
        title: 'B coverage',
      });
      await db.insert(warrantyIssues).values({
        id: issueB,
        organizationId: orgId,
        coverageId: coverageB,
        projectId: projectBId,
        title: 'B issue',
      });
      await db.execute(sql`
        INSERT INTO calendar_events (id, organization_id, title, event_kind, event_date, project_id)
        VALUES (${calendarB}::uuid, ${orgId}::uuid, 'Site B', 'site_visit', CURRENT_DATE, ${projectBId}::uuid)
      `);
      await db.insert(outboundCommunications).values({
        id: commB,
        organizationId: orgId,
        relatedEntityType: 'other',
        projectId: projectBId,
        recipientEmail: 'b@example.test',
        subject: 'B',
        bodyText: 'secret',
        status: 'draft',
      });
      await db.execute(sql`SELECT app.next_gen_latch_acquire('outbound_delivery')`);
      await db.insert(outboundCommunicationAttempts).values({
        id: attemptB,
        organizationId: orgId,
        communicationId: commB,
        result: 'failed',
        errorMessage: 'timeout',
      });
      await db.execute(sql`SELECT app.next_gen_latch_release('outbound_delivery')`);
      await db.insert(documents).values({
        id: docB,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/doc-b.pdf`,
        originalFilename: 'b.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: docB,
        ownerType: 'warranty_coverage',
        ownerId: coverageB,
      });
      await db.insert(documents).values({
        id: commDoc,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/comm-b.pdf`,
        originalFilename: 'comm-b.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: commDoc,
        ownerType: 'outbound_communication',
        ownerId: commB,
      });
    });

    const attemptIds = await database.asUser(scoped.userId, async (tx) => {
      const rows = resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM outbound_communication_attempts`),
      );
      return rows.map((row) => row.id);
    });
    expect(attemptIds).not.toContain(attemptB);

    const visibleDocs = await database.asUser(scoped.userId, async (tx) => {
      const rows = resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM documents`));
      return rows.map((row) => row.id);
    });
    expect(visibleDocs).not.toContain(docB);
    expect(visibleDocs).not.toContain(commDoc);

    const ownerAccess = await database.asUser(scoped.userId, async (tx) => {
      const rows = resultRows<{ ok: boolean }>(
        await tx.execute(sql`
          SELECT app.can_access_document_owner(${orgId}::uuid, 'closeout', ${closeoutB}::uuid) AS ok
          UNION ALL
          SELECT app.can_access_document_owner(${orgId}::uuid, 'warranty_issue', ${issueB}::uuid)
          UNION ALL
          SELECT app.can_access_document_owner(${orgId}::uuid, 'calendar_event', ${calendarB}::uuid)
        `),
      );
      return rows.map((row) => row.ok);
    });
    expect(ownerAccess).toEqual([false, false, false]);
  });

  it('rejects fabricated sent state, sent rewrites, and unauthorized attachments', async () => {
    const scoped = await createScopedMember(
      'comms@example.test',
      ['communications.read', 'communications.manage', 'documents.read', 'projects.read'],
      [projectAId],
    );
    const commA = randomUUID();
    const secretDoc = randomUUID();
    const coverageB = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(outboundCommunications).values({
        id: commA,
        organizationId: orgId,
        relatedEntityType: 'other',
        projectId: projectAId,
        recipientEmail: 'a@example.test',
        subject: 'Hello',
        bodyText: 'Body',
        status: 'draft',
      });
      await db.insert(warrantyCoverages).values({
        id: coverageB,
        organizationId: orgId,
        projectId: projectBId,
        title: 'B coverage',
      });
      await db.insert(documents).values({
        id: secretDoc,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/secret.pdf`,
        originalFilename: 'secret.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: secretDoc,
        ownerType: 'warranty_coverage',
        ownerId: coverageB,
      });
    });

    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(sql`
          UPDATE outbound_communications
          SET status = 'sent', provider_key = 'fake', provider_message_id = 'msg-1', sent_at = now()
          WHERE id = ${commA}
        `);
      }),
    );

    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.insert(outboundCommunicationAttachments).values({
          organizationId: orgId,
          communicationId: commA,
          documentId: secretDoc,
        });
      }),
    );

    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(sql`
          UPDATE outbound_communications SET status = 'sending' WHERE id = ${commA}
        `);
      }),
    );

    await database.asUser(scoped.userId, async (tx) => {
      await tx.execute(sql`
        SELECT app.request_outbound_communication_send(${orgId}::uuid, ${commA}::uuid)
      `);
    });
    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(sql`
          SELECT app.confirm_outbound_communication_delivery(
            ${orgId}::uuid, ${commA}::uuid, 'resend', 'prv_real'
          )
        `);
      }),
    );
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.confirm_outbound_communication_delivery(
          ${orgId}::uuid, ${commA}::uuid, 'resend', 'prv_real'
        )
      `);
    });

    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(
          sql`UPDATE outbound_communications SET subject = 'rewritten' WHERE id = ${commA}`,
        );
      }),
    );
    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(
          sql`UPDATE outbound_communications SET status = 'draft' WHERE id = ${commA}`,
        );
      }),
    );
    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(
          sql`DELETE FROM outbound_communication_attempts WHERE communication_id = ${commA}`,
        );
      }),
    );
  });

  it('hides credential refs from tenant SELECT and blocks assistant role forgery plus stored-data revocation', async () => {
    const scoped = await createScopedMember(
      'assistant@example.test',
      [
        'assistant.use',
        'integrations.read',
        'project_profit.read',
        'project_financials.read',
        'projects.read',
      ],
      [projectAId],
    );
    const integrationId = randomUUID();
    const conversationId = randomUUID();
    const assistantMessageId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(organizationIntegrations).values({
        id: integrationId,
        organizationId: orgId,
        providerKey: 'future-calendar',
        integrationKind: 'calendar',
        status: 'unconfigured',
      });
      await db.execute(sql`
        INSERT INTO app.integration_credential_refs (organization_id, integration_id, credentials_ref)
        VALUES (${orgId}::uuid, ${integrationId}::uuid, 'vault:secret-1')
      `);
      await db.insert(assistantConversations).values({
        id: conversationId,
        organizationId: orgId,
        userId: scoped.userId,
        title: 'Profit',
        status: 'active',
      });
      await db.insert(assistantMessages).values({
        organizationId: orgId,
        conversationId,
        role: 'user',
        content: 'What is the profit?',
      });
      await db.execute(sql`
        INSERT INTO assistant_messages (
          id, organization_id, conversation_id, role, content, access_scope_json
        ) VALUES (
          ${assistantMessageId}::uuid,
          ${orgId}::uuid,
          ${conversationId}::uuid,
          'assistant',
          'Profit is 120000 ILS',
          ${JSON.stringify({
            permissions: ['project_profit.read', 'project_financials.read'],
            projectIds: [projectAId],
          })}::jsonb
        )
      `);
    });

    const credCols = await database.asUser(scoped.userId, async (tx) =>
      resultRows<{ column_name: string }>(
        await tx.execute(sql`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'organization_integrations'
            AND column_name = 'credentials_ref'
        `),
      ),
    );
    expect(credCols).toEqual([]);

    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(sql`SELECT credentials_ref FROM app.integration_credential_refs`);
      }),
    );

    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.insert(assistantMessages).values({
          organizationId: orgId,
          conversationId,
          role: 'system',
          content: 'forged system',
        });
      }),
    );
    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.insert(assistantMessages).values({
          organizationId: orgId,
          conversationId,
          role: 'assistant',
          content: 'forged assistant',
        });
      }),
    );

    const beforeRevoke = await database.asUser(scoped.userId, async (tx) => {
      const rows = resultRows<{ content: string }>(
        await tx.execute(
          sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId} ORDER BY created_at`,
        ),
      );
      return rows.map((row) => row.content);
    });
    expect(beforeRevoke).toContain('Profit is 120000 ILS');

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.delete(projectAccessGrants).where(eq(projectAccessGrants.userId, scoped.userId));
    });

    const afterRevoke = await database.asUser(scoped.userId, async (tx) => {
      const rows = resultRows<{ content: string }>(
        await tx.execute(
          sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId} ORDER BY created_at`,
        ),
      );
      return rows.map((row) => row.content);
    });
    expect(afterRevoke).toEqual(['What is the profit?']);
    expect(afterRevoke).not.toContain('Profit is 120000 ILS');
  });

  it('rejects cross-org and wrong-entity integration mappings', async () => {
    const integrationId = randomUUID();
    const vendorId = randomUUID();
    const foreignClientId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(organizationIntegrations).values({
        id: integrationId,
        organizationId: orgId,
        providerKey: 'future-ledger',
        integrationKind: 'accounting',
        status: 'unconfigured',
      });
      await db.insert(vendors).values({
        id: vendorId,
        organizationId: orgId,
        name: 'Local vendor',
      });
      await db.execute(sql`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${foreignClientId}::uuid, ${otherOrgId}::uuid, 'Foreign client')
      `);
    });

    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO integration_entity_mappings (
            organization_id, integration_id, entity_type, entity_id, external_id
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'client', ${foreignClientId}::uuid, 'ext-1'
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO integration_entity_mappings (
            organization_id, integration_id, entity_type, entity_id, external_id
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'client', ${vendorId}::uuid, 'ext-2'
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO integration_entity_mappings (
            organization_id, integration_id, entity_type, entity_id, external_id
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'project', ${randomUUID()}::uuid, 'ext-3'
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO integration_entity_mappings (
            organization_id, integration_id, entity_type, entity_id, external_id
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'ap_payment', ${vendorId}::uuid, 'ext-ap'
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`
          INSERT INTO integration_entity_mappings (
            organization_id, integration_id, entity_type, entity_id, external_id
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'ar_payment', ${vendorId}::uuid, 'ext-ar'
          )
        `);
      }),
    );
  });

  it('rejects fabricated closeout events, classic completed bypass, spoofed actor/time, and reuses a fresh reclose snapshot', async () => {
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO project_closeout_events (
            organization_id, closeout_id, project_id, event_kind, actor_user_id, snapshot_json
          ) VALUES (
            ${orgId}::uuid, ${randomUUID()}::uuid, ${projectAId}::uuid, 'closed', ${otherOwnerId}::uuid, '{"fake":true}'::jsonb
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          UPDATE projects SET status = 'completed' WHERE id = ${projectAId}
        `);
      }),
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'first close', '{"wave":1}'::jsonb, ${ownerId}::uuid
        )
      `);
    });

    const firstClose = await database.asUser(ownerId, async (tx) =>
      resultRows<{ snapshot_json: unknown; actor_user_id: string; closed_at: string }>(
        await tx.execute(sql`
          SELECT snapshot_json, actor_user_id, created_at AS closed_at
          FROM project_closeout_events
          WHERE project_id = ${projectAId} AND event_kind = 'closed'
          ORDER BY created_at
          LIMIT 1
        `),
      ),
    );
    expect(firstClose[0]?.actor_user_id).toBe(ownerId);
    expect(firstClose[0]?.snapshot_json).toEqual({ wave: 1 });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          UPDATE project_closeouts
          SET closed_by_user_id = ${otherOwnerId}::uuid, closed_at = now() - interval '3 days'
          WHERE project_id = ${projectAId}
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`UPDATE projects SET status = 'active' WHERE id = ${projectAId}`);
      }),
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        SELECT app.reopen_project_via_closeout(${orgId}::uuid, ${projectAId}::uuid, 'need more work')
      `);
      await tx.execute(sql`SELECT app.mark_project_closeout_ready(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    const afterReady = await database.asUser(ownerId, async (tx) =>
      resultRows<{ status: string; closed_at: string | null }>(
        await tx.execute(sql`
          SELECT status, closed_at::text
          FROM project_closeouts WHERE project_id = ${projectAId}
        `),
      ),
    );
    expect(afterReady[0]?.status).toBe('ready');
    expect(afterReady[0]?.closed_at).toBeTruthy();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'second close', '{"wave":2}'::jsonb, ${ownerId}::uuid
        )
      `);
    });

    const events = await database.asUser(ownerId, async (tx) =>
      resultRows<{ event_kind: string; snapshot_json: unknown }>(
        await tx.execute(sql`
          SELECT event_kind, snapshot_json
          FROM project_closeout_events
          WHERE project_id = ${projectAId}
          ORDER BY created_at
        `),
      ),
    );
    const closedEvents = events.filter((row) => row.event_kind === 'closed');
    expect(closedEvents).toHaveLength(2);
    expect(closedEvents[0]?.snapshot_json).toEqual({ wave: 1 });
    expect(closedEvents[1]?.snapshot_json).toEqual({ wave: 2 });

    const current = await database.asUser(ownerId, async (tx) =>
      resultRows<{ financial_snapshot_json: unknown }>(
        await tx.execute(sql`
          SELECT financial_snapshot_json FROM project_closeouts WHERE project_id = ${projectAId}
        `),
      ),
    );
    expect(current[0]?.financial_snapshot_json).toEqual({ wave: 2 });
  });

  it('rejects forged sent insert, sent attachment reparenting, and unscoped related entities', async () => {
    const draftId = randomUUID();
    const sentId = randomUUID();
    const draftDoc = randomUUID();
    const sentDoc = randomUUID();
    const billingId = randomUUID();
    const calendarId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, project_id, issue_date, status, subtotal_amount, total_amount, currency
        ) VALUES (
          ${billingId}::uuid, ${orgId}::uuid, ${projectAId}::uuid, CURRENT_DATE, 'draft', 100, 100, 'ILS'
        )
      `);
      await db.insert(outboundCommunications).values({
        id: draftId,
        organizationId: orgId,
        relatedEntityType: 'other',
        projectId: projectAId,
        recipientEmail: 'draft@example.test',
        subject: 'Draft',
        bodyText: 'draft',
        status: 'draft',
      });
      await db.insert(documents).values([
        {
          id: draftDoc,
          organizationId: orgId,
          storageBucket: 'documents',
          storagePath: `org/${orgId}/draft.pdf`,
          originalFilename: 'draft.pdf',
          mimeType: 'application/pdf',
          status: 'available',
        },
        {
          id: sentDoc,
          organizationId: orgId,
          storageBucket: 'documents',
          storagePath: `org/${orgId}/sent.pdf`,
          originalFilename: 'sent.pdf',
          mimeType: 'application/pdf',
          status: 'available',
        },
      ]);
    });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO outbound_communications (
            organization_id, related_entity_type, project_id, recipient_email, subject, body_text,
            status, provider_key, provider_message_id, sent_at
          ) VALUES (
            ${orgId}::uuid, 'other', ${projectAId}::uuid, 'forge@example.test', 'Forge', 'no',
            'sent', 'fake', 'msg-fake', now()
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO outbound_communications (
            organization_id, related_entity_type, related_entity_id, project_id,
            recipient_email, subject, body_text, status
          ) VALUES (
            ${orgId}::uuid, 'billing_record', ${billingId}::uuid, NULL,
            'scope@example.test', 'Bypass', 'no', 'draft'
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO calendar_events (
            id, organization_id, title, event_kind, event_date,
            related_entity_type, related_entity_id, project_id
          ) VALUES (
            ${calendarId}::uuid, ${orgId}::uuid, 'Billing visit', 'site_visit', CURRENT_DATE,
            'billing_record', ${billingId}::uuid, NULL
          )
        `);
      }),
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO outbound_communications (
          id, organization_id, related_entity_type, related_entity_id, project_id,
          recipient_email, subject, body_text, status
        ) VALUES (
          ${sentId}::uuid, ${orgId}::uuid, 'billing_record', ${billingId}::uuid, ${projectAId}::uuid,
          'ok@example.test', 'Ok', 'body', 'draft'
        )
      `);
      await tx.insert(outboundCommunicationAttachments).values({
        organizationId: orgId,
        communicationId: sentId,
        documentId: sentDoc,
      });
      await tx.execute(sql`SELECT app.request_outbound_communication_send(${orgId}::uuid, ${sentId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.confirm_outbound_communication_delivery(
          ${orgId}::uuid, ${sentId}::uuid, 'resend', 'prv-ok'
        )
      `);
    });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          UPDATE outbound_communication_attachments
          SET communication_id = ${draftId}::uuid
          WHERE communication_id = ${sentId}::uuid
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          DELETE FROM outbound_communication_attachments WHERE communication_id = ${sentId}::uuid
        `);
      }),
    );

    const scoped = await createScopedMember(
      'docs-scope@example.test',
      ['communications.read', 'documents.read', 'projects.read', 'scheduling.read'],
      [projectBId],
    );
    const commDoc = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(documents).values({
        id: commDoc,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/comm-a.pdf`,
        originalFilename: 'comm-a.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: commDoc,
        ownerType: 'outbound_communication',
        ownerId: sentId,
      });
    });
    const visible = await database.asUser(scoped.userId, async (tx) =>
      resultRows<{ id: string }>(await tx.execute(sql`SELECT id FROM documents`)).map((row) => row.id),
    );
    expect(visible).not.toContain(commDoc);
  });

  it('rejects authenticated trusted-assistant RPC and empty assistant scope, and hides revoked classes', async () => {
    const financial = await createScopedMember(
      'fin-rev@example.test',
      ['assistant.use', 'billing.read', 'projects.read'],
      [projectAId],
    );
    const docsUser = await createScopedMember(
      'doc-rev@example.test',
      ['assistant.use', 'documents.read', 'projects.read'],
      [projectAId],
    );
    const conversationId = randomUUID();
    const docsConversationId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(assistantConversations).values([
        {
          id: conversationId,
          organizationId: orgId,
          userId: financial.userId,
          title: 'AR',
          status: 'active',
        },
        {
          id: docsConversationId,
          organizationId: orgId,
          userId: docsUser.userId,
          title: 'Docs',
          status: 'active',
        },
      ]);
    });

    await expectDenied(() =>
      database.asUser(financial.userId, async (tx) => {
        await tx.execute(sql`
          SELECT app.insert_assistant_trusted_message(
            ${orgId}::uuid, ${conversationId}::uuid, 'assistant', 'forged', '[]'::jsonb,
            '{"permissions":["billing.read"],"projectIds":[]}'::jsonb
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asService(async (db) => {
        await db.execute(sql`SET ROLE service_role`);
        await db.execute(sql`
          SELECT app.insert_assistant_trusted_message(
            ${orgId}::uuid, ${conversationId}::uuid, 'assistant', 'empty scope', '[]'::jsonb, '{}'::jsonb
          )
        `);
      }),
    );

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.insert_assistant_trusted_message(
          ${orgId}::uuid, ${conversationId}::uuid, 'assistant', 'Clients owe 9000', '[]'::jsonb,
          ${JSON.stringify({ permissions: ['billing.read'], projectIds: [projectAId] })}::jsonb
        )
      `);
      await db.execute(sql`
        SELECT app.insert_assistant_trusted_message(
          ${orgId}::uuid, ${docsConversationId}::uuid, 'assistant', 'Found the file', '[]'::jsonb,
          ${JSON.stringify({ permissions: ['documents.read'], projectIds: [projectAId] })}::jsonb
        )
      `);
    });

    const beforeFin = await database.asUser(financial.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId}`),
      ).map((row) => row.content),
    );
    expect(beforeFin).toContain('Clients owe 9000');

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db
        .delete(rolePermissions)
        .where(
          and(eq(rolePermissions.roleId, financial.roleId), eq(rolePermissions.permissionKey, 'billing.read')),
        );
    });
    const afterFin = await database.asUser(financial.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId}`),
      ).map((row) => row.content),
    );
    expect(afterFin).not.toContain('Clients owe 9000');

    const beforeDocs = await database.asUser(docsUser.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(
          sql`SELECT content FROM assistant_messages WHERE conversation_id = ${docsConversationId}`,
        ),
      ).map((row) => row.content),
    );
    expect(beforeDocs).toContain('Found the file');
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db
        .delete(rolePermissions)
        .where(
          and(eq(rolePermissions.roleId, docsUser.roleId), eq(rolePermissions.permissionKey, 'documents.read')),
        );
    });
    const afterDocs = await database.asUser(docsUser.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(
          sql`SELECT content FROM assistant_messages WHERE conversation_id = ${docsConversationId}`,
        ),
      ).map((row) => row.content),
    );
    expect(afterDocs).not.toContain('Found the file');
  });

  it('rejects tenant-manufactured automation runs and inconsistent sync job history', async () => {
    const ruleId = randomUUID();
    const integrationId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(automationRules).values({
        id: ruleId,
        organizationId: orgId,
        presetKey: 'client_balance_overdue',
        enabled: true,
      });
      await db.insert(organizationIntegrations).values({
        id: integrationId,
        organizationId: orgId,
        providerKey: 'future-ledger',
        integrationKind: 'accounting',
        status: 'unconfigured',
      });
    });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO automation_runs (organization_id, rule_id, status, actions_json)
          VALUES (${orgId}::uuid, ${ruleId}::uuid, 'ok', '[]'::jsonb)
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          SELECT app.record_automation_run(
            ${orgId}::uuid, ${ruleId}::uuid, 'ok', '[]'::jsonb, NULL
          )
        `);
      }),
    );
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.record_automation_run(
          ${orgId}::uuid, ${ruleId}::uuid, 'ok', '{"count":1}'::jsonb, NULL
        )
      `);
    });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO integration_sync_jobs (
            organization_id, integration_id, job_kind, status
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'export', 'succeeded'
          )
        `);
      }),
    );
    await expectDenied(() =>
      withServiceLatch('integration_sync', async (db) => {
        await db.execute(sql`
          INSERT INTO integration_sync_jobs (
            organization_id, integration_id, job_kind, status, finished_at
          ) VALUES (
            ${orgId}::uuid, ${integrationId}::uuid, 'export', 'queued', now()
          )
        `);
      }),
    );
    await withServiceLatch('integration_sync', async (db) => {
      await db.execute(sql`
        INSERT INTO integration_sync_jobs (
          organization_id, integration_id, job_kind, status
        ) VALUES (
          ${orgId}::uuid, ${integrationId}::uuid, 'export', 'queued'
        )
      `);
    });
  });

  it('rejects a fabricated tenant closeout snapshot', async () => {
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          SELECT app.close_project_via_closeout(
            ${orgId}::uuid, ${projectAId}::uuid, 'forge', '{"fabricated":true}'::jsonb, ${ownerId}::uuid
          )
        `);
      }),
    );
    const stillOpen = await database.asUser(ownerId, async (tx) =>
      resultRows<{ status: string }>(
        await tx.execute(sql`SELECT status FROM project_closeouts WHERE project_id = ${projectAId}`),
      ),
    );
    expect(stillOpen[0]?.status).toBe('open');
  });

  it('rejects project to job to completed to project and work_kind escape once closeout exists', async () => {
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          UPDATE projects
          SET work_kind = 'job', status = 'completed'
          WHERE id = ${projectAId}
        `);
      }),
    );

    const jobId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(projects).values({
        id: jobId,
        organizationId: orgId,
        name: 'Job bypass',
        status: 'active',
        currency: 'ILS',
        workKind: 'project',
      });
    });
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`UPDATE projects SET work_kind = 'job' WHERE id = ${jobId}`);
    });
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`UPDATE projects SET status = 'completed' WHERE id = ${jobId}`);
    });
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`UPDATE projects SET work_kind = 'project' WHERE id = ${jobId}`);
      }),
    );

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`UPDATE projects SET work_kind = 'job' WHERE id = ${projectAId}`);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`UPDATE projects SET work_kind = 'work_order' WHERE id = ${projectAId}`);
      }),
    );
  });

  it('sets a fresh actual_end_date on close, clears it on reopen, and writes a new date on reclose', async () => {
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'first end', '{"wave":1}'::jsonb, ${ownerId}::uuid
        )
      `);
    });
    const closed = await database.asUser(ownerId, async (tx) =>
      resultRows<{ actual_end_date: string | null }>(
        await tx.execute(sql`SELECT actual_end_date::text FROM projects WHERE id = ${projectAId}`),
      ),
    );
    expect(closed[0]?.actual_end_date).toBeTruthy();

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        SELECT app.reopen_project_via_closeout(${orgId}::uuid, ${projectAId}::uuid, 'reopen')
      `);
    });
    const reopened = await database.asUser(ownerId, async (tx) =>
      resultRows<{ actual_end_date: string | null; status: string }>(
        await tx.execute(
          sql`SELECT actual_end_date::text, status FROM projects WHERE id = ${projectAId}`,
        ),
      ),
    );
    expect(reopened[0]?.status).toBe('active');
    expect(reopened[0]?.actual_end_date).toBeNull();

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.mark_project_closeout_ready(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'second end', '{"wave":2}'::jsonb, ${ownerId}::uuid
        )
      `);
    });
    const reclosed = await database.asUser(ownerId, async (tx) =>
      resultRows<{ actual_end_date: string | null }>(
        await tx.execute(sql`SELECT actual_end_date::text FROM projects WHERE id = ${projectAId}`),
      ),
    );
    expect(reclosed[0]?.actual_end_date).toBeTruthy();
    const history = await database.asUser(ownerId, async (tx) =>
      resultRows<{ event_kind: string; snapshot_json: unknown }>(
        await tx.execute(sql`
          SELECT event_kind, snapshot_json
          FROM project_closeout_events
          WHERE project_id = ${projectAId}
          ORDER BY created_at
        `),
      ),
    );
    const closedEvents = history.filter((row) => row.event_kind === 'closed');
    expect(closedEvents).toHaveLength(2);
    expect(closedEvents[0]?.snapshot_json).toEqual({ wave: 1 });
    expect(closedEvents[1]?.snapshot_json).toEqual({ wave: 2 });
  });

  it('rejects tenant DELETE of a project that has closeout history', async () => {
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM projects WHERE id = ${projectAId}`);
      }),
    );
    const started = await database.asUser(ownerId, async (tx) =>
      resultRows<{ event_kind: string }>(
        await tx.execute(sql`
          SELECT event_kind FROM project_closeout_events WHERE project_id = ${projectAId}
        `),
      ),
    );
    expect(started.some((row) => row.event_kind === 'started')).toBe(true);

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'close', '{"wave":1}'::jsonb, ${ownerId}::uuid
        )
      `);
    });
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM projects WHERE id = ${projectAId}`);
      }),
    );
    const remaining = await database.asUser(ownerId, async (tx) =>
      resultRows<{ event_kind: string }>(
        await tx.execute(sql`
          SELECT event_kind FROM project_closeout_events WHERE project_id = ${projectAId}
        `),
      ),
    );
    expect(remaining.some((row) => row.event_kind === 'closed')).toBe(true);
  });

  it('rejects DELETE of sent, sending, and attempted communications', async () => {
    const sentId = randomUUID();
    const sendingId = randomUUID();
    const failedId = randomUUID();
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO outbound_communications (
          id, organization_id, related_entity_type, project_id,
          recipient_email, subject, body_text, status
        ) VALUES
          (${sentId}::uuid, ${orgId}::uuid, 'other', ${projectAId}::uuid, 'sent@example.test', 'S', 'b', 'draft'),
          (${sendingId}::uuid, ${orgId}::uuid, 'other', ${projectAId}::uuid, 'sending@example.test', 'G', 'b', 'draft'),
          (${failedId}::uuid, ${orgId}::uuid, 'other', ${projectAId}::uuid, 'fail@example.test', 'F', 'b', 'draft')
      `);
      await tx.execute(sql`SELECT app.request_outbound_communication_send(${orgId}::uuid, ${sentId}::uuid)`);
      await tx.execute(sql`SELECT app.request_outbound_communication_send(${orgId}::uuid, ${sendingId}::uuid)`);
      await tx.execute(sql`SELECT app.request_outbound_communication_send(${orgId}::uuid, ${failedId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.confirm_outbound_communication_delivery(
          ${orgId}::uuid, ${sentId}::uuid, 'resend', 'prv-sent'
        )
      `);
      await db.execute(sql`
        SELECT app.record_outbound_communication_failure(
          ${orgId}::uuid, ${failedId}::uuid, 'failed', 'provider down'
        )
      `);
    });

    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM outbound_communications WHERE id = ${sentId}`);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM outbound_communications WHERE id = ${sendingId}`);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`DELETE FROM outbound_communications WHERE id = ${failedId}`);
      }),
    );
    const attempts = await database.asUser(ownerId, async (tx) =>
      resultRows<{ communication_id: string }>(
        await tx.execute(sql`
          SELECT communication_id FROM outbound_communication_attempts
          WHERE communication_id IN (${failedId}::uuid, ${sentId}::uuid)
        `),
      ),
    );
    expect(attempts.length).toBeGreaterThan(0);
  });

  it('rejects send after attachment document access is revoked', async () => {
    const scoped = await createScopedMember(
      'send-attach@example.test',
      [
        'communications.manage',
        'communications.read',
        'documents.read',
        'projects.read',
        'projects.update',
      ],
      [projectAId],
    );
    const commId = randomUUID();
    const docId = randomUUID();
    const coverageA = randomUUID();
    const coverageB = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(warrantyCoverages).values([
        { id: coverageA, organizationId: orgId, projectId: projectAId, title: 'A' },
        { id: coverageB, organizationId: orgId, projectId: projectBId, title: 'B' },
      ]);
      await db.insert(documents).values({
        id: docId,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/attach.pdf`,
        originalFilename: 'attach.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: docId,
        ownerType: 'warranty_coverage',
        ownerId: coverageA,
      });
    });
    await database.asUser(scoped.userId, async (tx) => {
      await tx.execute(sql`
        INSERT INTO outbound_communications (
          id, organization_id, related_entity_type, project_id,
          recipient_email, subject, body_text, status
        ) VALUES (
          ${commId}::uuid, ${orgId}::uuid, 'other', ${projectAId}::uuid,
          'attach@example.test', 'Attach', 'body', 'draft'
        )
      `);
      await tx.insert(outboundCommunicationAttachments).values({
        organizationId: orgId,
        communicationId: commId,
        documentId: docId,
      });
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.delete(documentLinks).where(eq(documentLinks.documentId, docId));
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: docId,
        ownerType: 'warranty_coverage',
        ownerId: coverageB,
      });
    });
    await expectDenied(() =>
      database.asUser(scoped.userId, async (tx) => {
        await tx.execute(sql`SELECT app.request_outbound_communication_send(${orgId}::uuid, ${commId}::uuid)`);
      }),
    );
  });

  it('revokes the related project resolver from authenticated and rejects unknown calendar types', async () => {
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          SELECT app.next_gen_related_project_id(
            ${orgId}::uuid, 'project', ${projectAId}::uuid
          )
        `);
      }),
    );
    await expectDenied(() =>
      database.asUser(ownerId, async (tx) => {
        await tx.execute(sql`
          INSERT INTO calendar_events (
            organization_id, title, event_kind, event_date,
            related_entity_type, related_entity_id, project_id
          ) VALUES (
            ${orgId}::uuid, 'Hidden project', 'meeting', CURRENT_DATE,
            'sneaky_project', ${projectAId}::uuid, NULL
          )
        `);
      }),
    );
  });

  it('returns false from document visibility for a non-member', async () => {
    const docId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(documents).values({
        id: docId,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/oracle.pdf`,
        originalFilename: 'oracle.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
    });
    const visible = await database.asUser(otherOwnerId, async (tx) =>
      resultRows<{ visible: boolean }>(
        await tx.execute(sql`
          SELECT app.document_visible_to_current_user(${orgId}::uuid, ${docId}::uuid) AS visible
        `),
      ),
    );
    expect(visible[0]?.visible).toBe(false);
  });

  it('hides raw integration mappings from a selected-project user', async () => {
    const scoped = await createScopedMember(
      'map-scope@example.test',
      ['integrations.read', 'projects.read', 'settings.manage'],
      [projectAId],
    );
    const integrationId = randomUUID();
    const vendorId = randomUUID();
    const clientId = randomUUID();
    const billingId = randomUUID();
    const paymentId = randomUUID();
    const apBillId = randomUUID();
    const apPaymentId = randomUUID();
    const mappingIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(organizationIntegrations).values({
        id: integrationId,
        organizationId: orgId,
        providerKey: 'future-ledger',
        integrationKind: 'accounting',
        status: 'unconfigured',
      });
      await db.insert(vendors).values({
        id: vendorId,
        organizationId: orgId,
        name: 'Map vendor',
      });
      await db.execute(sql`
        INSERT INTO clients (id, organization_id, name)
        VALUES (${clientId}::uuid, ${orgId}::uuid, 'Map client')
      `);
      await db.execute(sql`
        INSERT INTO billing_records (
          id, organization_id, project_id, issue_date, status, subtotal_amount, total_amount, currency
        ) VALUES (
          ${billingId}::uuid, ${orgId}::uuid, ${projectBId}::uuid, CURRENT_DATE, 'draft', 100, 100, 'ILS'
        )
      `);
      await db.execute(sql`
        INSERT INTO payments (
          id, organization_id, client_id, amount, currency, payment_date, status
        ) VALUES (
          ${paymentId}::uuid, ${orgId}::uuid, ${clientId}::uuid, 100, 'ILS', CURRENT_DATE, 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO ap_bills (
          id, organization_id, vendor_id, project_id, status, currency, total_amount, net_amount, gross_amount
        ) VALUES (
          ${apBillId}::uuid, ${orgId}::uuid, ${vendorId}::uuid, ${projectBId}::uuid, 'draft', 'ILS', 100, 100, 100
        )
      `);
      await db.execute(sql`
        INSERT INTO ap_payments (
          id, organization_id, vendor_id, amount, currency, payment_date, status
        ) VALUES (
          ${apPaymentId}::uuid, ${orgId}::uuid, ${vendorId}::uuid, 50, 'ILS', CURRENT_DATE, 'recorded'
        )
      `);
      await db.execute(sql`
        INSERT INTO integration_entity_mappings (
          id, organization_id, integration_id, entity_type, entity_id, external_id
        ) VALUES
          (${mappingIds[0]}::uuid, ${orgId}::uuid, ${integrationId}::uuid, 'project', ${projectBId}::uuid, 'ext-p'),
          (${mappingIds[1]}::uuid, ${orgId}::uuid, ${integrationId}::uuid, 'billing_record', ${billingId}::uuid, 'ext-b'),
          (${mappingIds[2]}::uuid, ${orgId}::uuid, ${integrationId}::uuid, 'ar_payment', ${paymentId}::uuid, 'ext-ar'),
          (${mappingIds[3]}::uuid, ${orgId}::uuid, ${integrationId}::uuid, 'ap_bill', ${apBillId}::uuid, 'ext-apb'),
          (${mappingIds[4]}::uuid, ${orgId}::uuid, ${integrationId}::uuid, 'ap_payment', ${apPaymentId}::uuid, 'ext-app')
      `);
    });
    const seen = await database
      .asUser(scoped.userId, async (tx) =>
        resultRows<{ id: string; entity_type: string }>(
          await tx.execute(sql`
            SELECT id, entity_type FROM integration_entity_mappings
            WHERE organization_id = ${orgId}
          `),
        ),
      )
      .catch(() => []);
    expect(seen).toEqual([]);
  });

  it('hides automation run data scoped to a project the selected-project user cannot access', async () => {
    const scoped = await createScopedMember(
      'auto-scope@example.test',
      ['automations.read', 'automations.manage', 'projects.read'],
      [projectAId],
    );
    const ruleId = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(automationRules).values({
        id: ruleId,
        organizationId: orgId,
        presetKey: 'forecast_over_budget',
        enabled: true,
      });
      await db.execute(sql`
        SELECT app.record_automation_run(
          ${orgId}::uuid,
          ${ruleId}::uuid,
          'ok',
          ${JSON.stringify({ projectId: projectBId, secret: 'other-project' })}::jsonb,
          NULL,
          ${JSON.stringify({ projectIds: [projectBId] })}::jsonb
        )
      `);
    });
    const seen = await database.asUser(scoped.userId, async (tx) =>
      resultRows<{ actions_json: unknown }>(
        await tx.execute(sql`
          SELECT actions_json FROM automation_runs WHERE rule_id = ${ruleId}
        `),
      ),
    );
    expect(seen).toEqual([]);
  });

  it('hides a stored assistant answer after document-specific access is revoked', async () => {
    const docsUser = await createScopedMember(
      'doc-owner-rev@example.test',
      ['assistant.use', 'documents.read', 'projects.read'],
      [projectAId, projectBId],
    );
    const conversationId = randomUUID();
    const docId = randomUUID();
    const coverageB = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(warrantyCoverages).values({
        id: coverageB,
        organizationId: orgId,
        projectId: projectBId,
        title: 'Doc B',
      });
      await db.insert(documents).values({
        id: docId,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/secret.pdf`,
        originalFilename: 'secret.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: docId,
        ownerType: 'warranty_coverage',
        ownerId: coverageB,
      });
      await db.insert(assistantConversations).values({
        id: conversationId,
        organizationId: orgId,
        userId: docsUser.userId,
        title: 'Docs',
        status: 'active',
      });
      await db.execute(sql`
        SELECT app.insert_assistant_trusted_message(
          ${orgId}::uuid,
          ${conversationId}::uuid,
          'assistant',
          'Document says retainage 12 percent',
          '[]'::jsonb,
          ${JSON.stringify({
            permissions: ['documents.read'],
            projectIds: [projectAId],
            documentIds: [docId],
          })}::jsonb
        )
      `);
    });
    const before = await database.asUser(docsUser.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId}`),
      ).map((row) => row.content),
    );
    expect(before).toContain('Document says retainage 12 percent');

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db
        .delete(projectAccessGrants)
        .where(
          and(
            eq(projectAccessGrants.userId, docsUser.userId),
            eq(projectAccessGrants.projectId, projectBId),
          ),
        );
    });
    const after = await database.asUser(docsUser.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId}`),
      ).map((row) => row.content),
    );
    expect(after).not.toContain('Document says retainage 12 percent');
  });

  it('enforces closeout integrity even when project_closeouts are invisible to SELECT', async () => {
    const updater = await createScopedMember(
      'closeout-updater-no-read@example.test',
      ['projects.update'],
      [projectAId],
    );
    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    const invisible = await database.asUser(updater.userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM project_closeouts WHERE project_id = ${projectAId}`),
      ),
    );
    expect(invisible).toEqual([]);

    await expectDenied(() =>
      database.asUser(updater.userId, async (tx) => {
        await tx.execute(sql`UPDATE projects SET work_kind = 'job' WHERE id = ${projectAId}`);
      }),
    );
    await expectDenied(() =>
      database.asUser(updater.userId, async (tx) => {
        await tx.execute(sql`DELETE FROM projects WHERE id = ${projectAId}`);
      }),
    );
    const history = await database.asUser(ownerId, async (tx) =>
      resultRows<{ event_kind: string }>(
        await tx.execute(sql`
          SELECT event_kind FROM project_closeout_events WHERE project_id = ${projectAId}
        `),
      ),
    );
    expect(history.some((row) => row.event_kind === 'started')).toBe(true);
  });

  it('blocks communication history deletes when parent rows are invisible to SELECT', async () => {
    const sender = await createScopedMember(
      'comms-manage-no-read@example.test',
      ['communications.manage', 'projects.read'],
      [projectAId],
    );
    const commId = randomUUID();
    const attachId = randomUUID();
    const docId = randomUUID();
    await database.asUser(ownerId, async (tx) => {
      await tx.insert(documents).values({
        id: docId,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/sent-lock.pdf`,
        originalFilename: 'sent-lock.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await tx.insert(outboundCommunications).values({
        id: commId,
        organizationId: orgId,
        relatedEntityType: 'other',
        projectId: projectAId,
        recipientEmail: 'hidden-parent@example.test',
        subject: 'Hidden parent',
        bodyText: 'body',
        status: 'draft',
      });
      await tx.insert(outboundCommunicationAttachments).values({
        id: attachId,
        organizationId: orgId,
        communicationId: commId,
        documentId: docId,
      });
      await tx.execute(sql`SELECT app.request_outbound_communication_send(${orgId}::uuid, ${commId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.confirm_outbound_communication_delivery(
          ${orgId}::uuid, ${commId}::uuid, 'resend', 'prv-hidden-parent'
        )
      `);
    });

    const hiddenParent = await database.asUser(sender.userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`SELECT id FROM outbound_communications WHERE id = ${commId}`),
      ),
    );
    expect(hiddenParent).toEqual([]);
    const hiddenAttempts = await database.asUser(sender.userId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM outbound_communication_attempts WHERE communication_id = ${commId}
        `),
      ),
    );
    expect(hiddenAttempts).toEqual([]);

    await database.asUser(sender.userId, async (tx) => {
      await tx.execute(sql`DELETE FROM outbound_communications WHERE id = ${commId}`);
      await tx.execute(sql`
        DELETE FROM outbound_communication_attachments WHERE id = ${attachId}
      `);
    });

    const commStillThere = await database.asUser(ownerId, async (tx) =>
      resultRows<{ status: string }>(
        await tx.execute(sql`SELECT status FROM outbound_communications WHERE id = ${commId}`),
      ),
    );
    expect(commStillThere[0]?.status).toBe('sent');
    const attachStillThere = await database.asUser(ownerId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM outbound_communication_attachments WHERE id = ${attachId}
        `),
      ),
    );
    expect(attachStillThere).toHaveLength(1);

    const reader = await createScopedMember(
      'comms-manage-with-read@example.test',
      ['communications.manage', 'communications.read', 'projects.read'],
      [projectAId],
    );
    await expectDenied(() =>
      database.asUser(reader.userId, async (tx) => {
        await tx.execute(sql`DELETE FROM outbound_communications WHERE id = ${commId}`);
      }),
    );
    await expectDenied(() =>
      database.asUser(reader.userId, async (tx) => {
        await tx.execute(sql`
          DELETE FROM outbound_communication_attachments WHERE id = ${attachId}
        `);
      }),
    );
    const attemptsRemain = await database.asUser(ownerId, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(sql`
          SELECT id FROM outbound_communication_attempts WHERE communication_id = ${commId}
        `),
      ),
    );
    expect(attemptsRemain.length).toBeGreaterThan(0);
  });

  it('blocks conversation delete when assistant history is hidden by revocation', async () => {
    const docsUser = await createScopedMember(
      'assistant-hidden-delete@example.test',
      ['assistant.use', 'documents.read', 'projects.read'],
      [projectAId, projectBId],
    );
    const conversationId = randomUUID();
    const docId = randomUUID();
    const coverageB = randomUUID();
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(warrantyCoverages).values({
        id: coverageB,
        organizationId: orgId,
        projectId: projectBId,
        title: 'Hidden delete doc',
      });
      await db.insert(documents).values({
        id: docId,
        organizationId: orgId,
        storageBucket: 'documents',
        storagePath: `org/${orgId}/hidden-delete.pdf`,
        originalFilename: 'hidden-delete.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
      await db.insert(documentLinks).values({
        organizationId: orgId,
        documentId: docId,
        ownerType: 'warranty_coverage',
        ownerId: coverageB,
      });
      await db.insert(assistantConversations).values({
        id: conversationId,
        organizationId: orgId,
        userId: docsUser.userId,
        title: 'Hidden delete',
        status: 'active',
      });
      await db.execute(sql`
        SELECT app.insert_assistant_trusted_message(
          ${orgId}::uuid,
          ${conversationId}::uuid,
          'assistant',
          'Hidden answer must survive delete',
          '[]'::jsonb,
          ${JSON.stringify({
            permissions: ['documents.read'],
            projectIds: [projectAId],
            documentIds: [docId],
          })}::jsonb
        )
      `);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db
        .delete(projectAccessGrants)
        .where(
          and(
            eq(projectAccessGrants.userId, docsUser.userId),
            eq(projectAccessGrants.projectId, projectBId),
          ),
        );
    });
    const hidden = await database.asUser(docsUser.userId, async (tx) =>
      resultRows<{ content: string }>(
        await tx.execute(sql`SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId}`),
      ).map((row) => row.content),
    );
    expect(hidden).not.toContain('Hidden answer must survive delete');

    await expectDenied(() =>
      database.asUser(docsUser.userId, async (tx) => {
        await tx.execute(sql`DELETE FROM assistant_conversations WHERE id = ${conversationId}`);
      }),
    );
    const stillThere = await database.asService(async (db) =>
      resultRows<{ content: string }>(
        await db.execute(sql`
          SELECT content FROM assistant_messages WHERE conversation_id = ${conversationId}
        `),
      ).map((row) => row.content),
    );
    expect(stillThere).toContain('Hidden answer must survive delete');
  });

  it('stores actual_end_date using organization timezone, not UTC calendar date', async () => {
    const boundary = await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      return resultRows<{ utc_date: string; org_date: string }>(
        await db.execute(sql`
          SELECT
            (timestamptz '2026-08-17 22:00:00+00' AT TIME ZONE 'utc')::date::text AS utc_date,
            (timezone('Asia/Jerusalem', timestamptz '2026-08-17 22:00:00+00'))::date::text AS org_date
        `),
      );
    });
    expect(boundary[0]?.utc_date).toBe('2026-08-17');
    expect(boundary[0]?.org_date).toBe('2026-08-18');

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.start_project_closeout(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'business date close', '{"wave":1}'::jsonb, ${ownerId}::uuid
        )
      `);
    });
    const closed = await database.asUser(ownerId, async (tx) =>
      resultRows<{ actual_end_date: string }>(
        await tx.execute(sql`SELECT actual_end_date::text FROM projects WHERE id = ${projectAId}`),
      ),
    );
    const expected = await database.asService(async (db) =>
      resultRows<{ d: string }>(
        await db.execute(sql`SELECT app.organization_business_date(${orgId}::uuid)::text AS d`),
      ),
    );
    expect(closed[0]?.actual_end_date).toBe(expected[0]?.d);

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`
        SELECT app.reopen_project_via_closeout(${orgId}::uuid, ${projectAId}::uuid, 'reopen for date')
      `);
    });
    const reopened = await database.asUser(ownerId, async (tx) =>
      resultRows<{ actual_end_date: string | null }>(
        await tx.execute(sql`SELECT actual_end_date::text FROM projects WHERE id = ${projectAId}`),
      ),
    );
    expect(reopened[0]?.actual_end_date).toBeNull();

    await database.asUser(ownerId, async (tx) => {
      await tx.execute(sql`SELECT app.mark_project_closeout_ready(${orgId}::uuid, ${projectAId}::uuid)`);
    });
    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.execute(sql`
        SELECT app.close_project_via_closeout(
          ${orgId}::uuid, ${projectAId}::uuid, 'business date reclose', '{"wave":2}'::jsonb, ${ownerId}::uuid
        )
      `);
    });
    const reclosed = await database.asUser(ownerId, async (tx) =>
      resultRows<{ actual_end_date: string }>(
        await tx.execute(sql`SELECT actual_end_date::text FROM projects WHERE id = ${projectAId}`),
      ),
    );
    expect(reclosed[0]?.actual_end_date).toBe(expected[0]?.d);
  });
});
