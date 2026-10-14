/**
 * S02 — prepared 0186 UWM parity for audit_events / contracts / contract_value_events (Gate A).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  auditEvents,
  contractValueEvents,
  contracts,
  projectAccessGrants,
} from '@drizzle/schema';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { addOrgMember } from '@tests/setup/dg-fixtures';
import {
  applyPreparedMigrations,
  GATE_A_SEC_PREPARED_S02,
} from '@tests/setup/pending-journal-migrations';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';

async function linkEmployeeGrant(
  database: TestDatabase,
  organizationId: string,
  userId: string,
  permissionKey: string,
): Promise<void> {
  const employeeId = randomUUID();
  const accountId = randomUUID();
  await database.asService(async (db) => {
    await db.execute(sql`
      INSERT INTO employees (id, organization_id, name, status, user_id)
      VALUES (${employeeId}::uuid, ${organizationId}::uuid, 'Linked', 'active', ${userId}::uuid)
    `);
    await db.execute(sql`
      INSERT INTO employee_app_accounts (
        id, organization_id, employee_id, user_id, status,
        username, username_normalized, auth_email
      ) VALUES (
        ${accountId}::uuid, ${organizationId}::uuid, ${employeeId}::uuid, ${userId}::uuid, 'active',
        'linked', 'linked', ${'linked-' + userId.slice(0, 8) + '@auth.example.test'}
      )
    `);
    await db.execute(sql`
      INSERT INTO employee_permission_grants (
        organization_id, employee_id, permission_key, scope, granted
      ) VALUES (
        ${organizationId}::uuid, ${employeeId}::uuid, ${permissionKey},
        'all_organization'::permission_scope, true
      )
    `);
  });
}

describe('RLS 0186 prepared — UWM employee grants (S02)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_SEC_PREPARED_S02);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('employee audit.read grant can SELECT audit_events (uwm, not has_org_permission)', async () => {
    const owner = await createTestUser(database, 's02-audit-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'UWM Audit Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'audit-worker', 'worker');

    await linkEmployeeGrant(database, tenant.organization.id, worker.id, 'audit.read');

    const auditEventId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(auditEvents).values({
        id: auditEventId,
        organizationId: tenant.organization.id,
        actorUserId: owner.id,
        action: 'test.s02.uwm.audit',
        entityType: 'organization',
        entityId: tenant.organization.id,
        before: {},
        after: {},
      });
    });

    const orgPerm = await database.asUser(worker.id, async (tx) =>
      resultRows<{ ok: boolean }>(
        await tx.execute(
          sql`SELECT app.has_org_permission(${tenant.organization.id}::uuid, 'audit.read') AS ok`,
        ),
      ),
    );
    expect(orgPerm[0]?.ok).toBe(false);

    const uwmPerm = await database.asUser(worker.id, async (tx) =>
      resultRows<{ ok: boolean }>(
        await tx.execute(
          sql`SELECT app.uwm_has_permission(${tenant.organization.id}::uuid, 'audit.read') AS ok`,
        ),
      ),
    );
    expect(uwmPerm[0]?.ok).toBe(true);

    const rows = await database.asUser(worker.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM audit_events WHERE id = ${auditEventId}::uuid`,
        ),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(auditEventId);
  });

  it('employee contracts.read grant can SELECT contract row', async () => {
    const owner = await createTestUser(database, 's02-contract-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'UWM Contract Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'contract-worker', 'worker');
    const projectId = randomUUID();
    const contractId = randomUUID();

    await linkEmployeeGrant(database, tenant.organization.id, worker.id, 'contracts.read');

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${tenant.organization.id}::uuid, 'Contract project', 'active', 'ILS')
      `);
      await db.insert(projectAccessGrants).values({
        organizationId: tenant.organization.id,
        userId: worker.id,
        projectId,
        accessLevel: 'read',
      });
      await db.insert(contracts).values({
        id: contractId,
        organizationId: tenant.organization.id,
        projectId,
        name: 'Main',
        status: 'active',
        currency: 'ILS',
      });
    });

    const rows = await database.asUser(worker.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM contracts WHERE organization_id = ${tenant.organization.id}::uuid AND id = ${contractId}::uuid`,
        ),
      ),
    );
    expect(rows.length).toBe(1);
  });

  it('employee contracts.read grant can SELECT contract_value_events on granted project', async () => {
    const owner = await createTestUser(database, 's02-cve-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'UWM CVE Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'cve-worker', 'worker');
    const projectId = randomUUID();
    const contractId = randomUUID();
    const eventId = randomUUID();

    await linkEmployeeGrant(database, tenant.organization.id, worker.id, 'contracts.read');

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO projects (id, organization_id, name, status, currency)
        VALUES (${projectId}::uuid, ${tenant.organization.id}::uuid, 'Value project', 'active', 'ILS')
      `);
      await db.insert(projectAccessGrants).values({
        organizationId: tenant.organization.id,
        userId: worker.id,
        projectId,
        accessLevel: 'read',
      });
      await db.insert(contracts).values({
        id: contractId,
        organizationId: tenant.organization.id,
        projectId,
        name: 'Main',
        status: 'active',
        currency: 'ILS',
      });
      await db.insert(contractValueEvents).values({
        id: eventId,
        organizationId: tenant.organization.id,
        contractId,
        projectId,
        kind: 'original',
        amount: '100000',
        currency: 'ILS',
        effectiveDate: '2026-01-01',
      });
    });

    const rows = await database.asUser(worker.id, async (tx) =>
      resultRows<{ id: string }>(
        await tx.execute(
          sql`SELECT id FROM contract_value_events WHERE organization_id = ${tenant.organization.id}::uuid AND id = ${eventId}::uuid`,
        ),
      ),
    );
    expect(rows.length).toBe(1);
  });
});
