/**
 * S01 / 0185 — RLS for 0009 / 0011 sibling tables (prepared SQL on PGlite).
 */
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  apiClients,
  apiKeys,
  assets,
  complianceArtifacts,
  customFieldDefinitions,
  customFieldValues,
  inspections,
  maintenanceRecords,
  projectAccessGrants,
  projects,
} from '@drizzle/schema';
import { listComplianceArtifactsForOrg } from '@/modules/compliance';
import { resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError } from '@/shared/errors';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import {
  applyPreparedMigrations,
  GATE_A_SEC_PREPARED_RLS_WITH_SCHEMA_PARITY,
} from '@tests/setup/pending-journal-migrations';
import { addOrgMember, createProjectAs } from '@tests/setup/dg-fixtures';
import { grantRolePermission } from '@tests/setup/dg-fixtures-permissions';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';
import { PERMISSIONS } from '@/shared/permissions/catalog';

async function countTable(
  database: TestDatabase,
  userId: string,
  table: string,
  organizationId: string,
): Promise<number> {
  const rows = await database.asUser(userId, async (tx) =>
    resultRows<{ n: number }>(
      await tx.execute(
        sql.raw(
          `SELECT count(*)::int AS n FROM ${table} WHERE organization_id = '${organizationId}'::uuid`,
        ),
      ),
    ),
  );
  return rows[0]?.n ?? 0;
}

describe('RLS 0009/0011 sibling tables (0185 prepared)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPreparedMigrations(database, GATE_A_SEC_PREPARED_RLS_WITH_SCHEMA_PARITY);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  async function seedSiblingRows(organizationId: string, projectId: string): Promise<void> {
    const assetId = randomUUID();
    const apiClientId = randomUUID();
    const definitionId = randomUUID();
    const opportunityEntityId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(complianceArtifacts).values({
        id: randomUUID(),
        organizationId,
        artifactKind: 'insurance',
        name: 'Policy',
        subjectType: 'organization',
        expiresOn: '2027-01-01',
      });
      await db.insert(assets).values({
        id: assetId,
        organizationId,
        name: 'Excavator',
        assetKind: 'equipment',
      });
      await db.insert(maintenanceRecords).values({
        id: randomUUID(),
        organizationId,
        assetId,
        title: 'Oil change',
        performedOn: '2026-05-01',
        status: 'completed',
      });
      await db.insert(apiClients).values({
        id: apiClientId,
        organizationId,
        name: 'Integration client',
      });
      await db.insert(apiKeys).values({
        id: randomUUID(),
        organizationId,
        apiClientId,
        name: 'Primary key',
        keyPrefix: `pf_${randomUUID().slice(0, 8)}`,
        keyHash: 'hash',
      });
      await db.insert(inspections).values({
        id: randomUUID(),
        organizationId,
        projectId,
        title: 'Site walk',
        status: 'scheduled',
      });
      await db.insert(customFieldDefinitions).values({
        id: definitionId,
        organizationId,
        entityType: 'opportunity',
        key: 'tier',
        label: 'Tier',
        fieldType: 'text',
      });
      await db.insert(customFieldValues).values({
        id: randomUUID(),
        organizationId,
        definitionId,
        entityId: opportunityEntityId,
        valueText: 'enterprise',
      });
    });
  }

  it('worker sees field_ops inspections on granted project but not compliance, assets maintenance, or api keys', async () => {
    const owner = await createTestUser(database, 'sibling-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Sibling RLS Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'sibling-worker', 'worker');
    const projectId = await createProjectAs(database, owner.id, tenant.organization.id, 'Field site');

    await database.asService(async (db) => {
      await db.insert(projectAccessGrants).values({
        organizationId: tenant.organization.id,
        userId: worker.id,
        projectId,
        accessLevel: 'read',
      });
    });

    await seedSiblingRows(tenant.organization.id, projectId);

    expect(await countTable(database, worker.id, 'compliance_artifacts', tenant.organization.id)).toBe(
      0,
    );
    expect(await countTable(database, worker.id, 'maintenance_records', tenant.organization.id)).toBe(0);
    expect(await countTable(database, worker.id, 'api_keys', tenant.organization.id)).toBe(0);
    expect(await countTable(database, worker.id, 'custom_field_values', tenant.organization.id)).toBe(0);
    expect(await countTable(database, worker.id, 'inspections', tenant.organization.id)).toBe(1);
  });

  it('worker with compliance.read grant sees compliance artifacts via RLS', async () => {
    const owner = await createTestUser(database, 'sibling-compliance-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Compliance Grant Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'compliance-worker', 'worker');
    await grantRolePermission(
      database,
      tenant.organization.id,
      'worker',
      PERMISSIONS.COMPLIANCE_READ,
    );
    const projectId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(projects).values({
        id: projectId,
        organizationId: tenant.organization.id,
        name: 'Placeholder',
        status: 'active',
        currency: 'ILS',
      });
    });
    await seedSiblingRows(tenant.organization.id, projectId);

    expect(await countTable(database, worker.id, 'compliance_artifacts', tenant.organization.id)).toBe(
      1,
    );
  });

  it('worker cannot INSERT api_keys under 0185', async () => {
    const owner = await createTestUser(database, 'sibling-api-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'API RLS Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'api-worker', 'worker');
    const apiClientId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(apiClients).values({
        id: apiClientId,
        organizationId: tenant.organization.id,
        name: 'Client',
      });
    });

    let denied = false;
    try {
      await database.asUser(worker.id, async (tx) =>
        tx.execute(
          sql`INSERT INTO api_keys (id, organization_id, api_client_id, name, key_prefix, key_hash)
              VALUES (${randomUUID()}::uuid, ${tenant.organization.id}::uuid, ${apiClientId}::uuid, 'x', ${`pf_${randomUUID().slice(0, 8)}`}, 'hash')
              RETURNING id`,
        ),
      );
    } catch {
      denied = true;
    }
    expect(denied).toBe(true);
  });

  it('app layer denies worker listComplianceArtifactsForOrg', async () => {
    const owner = await createTestUser(database, 'sibling-app-owner@example.test');
    const tenant = await createTestOrganization(database, owner, 'Compliance App Org');
    const worker = await addOrgMember(database, tenant.organization.id, 'app-worker', 'worker');
    const projectId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(projects).values({
        id: projectId,
        organizationId: tenant.organization.id,
        name: 'P',
        status: 'active',
        currency: 'ILS',
      });
      await db.insert(complianceArtifacts).values({
        id: randomUUID(),
        organizationId: tenant.organization.id,
        artifactKind: 'insurance',
        name: 'Hidden',
        subjectType: 'organization',
        expiresOn: '2027-01-01',
      });
    });

    await expect(
      database.asUser(worker.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: worker.id,
          organizationId: tenant.organization.id,
          locale: 'en',
        });
        await listComplianceArtifactsForOrg(context);
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
