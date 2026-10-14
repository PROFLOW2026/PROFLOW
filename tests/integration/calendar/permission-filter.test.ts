import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { listExistingDatedSources } from '@/modules/calendar/data/source-dates.repository';
import type { CalendarSourceAccess } from '@/modules/calendar/domain/source-access';
import { createOpportunity } from '@/modules/crm';
import { resolveModuleVisibility } from '@/modules/tenancy/domain/types';
import { resolveOrgContext } from '@/modules/tenancy';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assets, complianceArtifacts, maintenanceRecords } from '@drizzle/schema';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { addOrgMember } from '@tests/setup/dg-fixtures';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';

describe('calendar permission filter (U08)', () => {
  let database: TestDatabase;
  let orgId: string;
  let ownerId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    const owner = await createTestUser(database, 'cal-filter-owner@example.test');
    ownerId = owner.id;
    const tenant = await createTestOrganization(database, owner, 'Calendar Filter Org');
    orgId = tenant.organization.id;
  });

  function accessFor(permissions: string[]): CalendarSourceAccess {
    const modules = resolveModuleVisibility([]);
    Object.keys(modules).forEach((key) => {
      (modules as Record<string, boolean>)[key] = true;
    });
    return {
      hasPermission: (key) => permissions.includes(key),
      modules,
    };
  }

  async function seedCrossModuleSources(): Promise<void> {
    await database.asUser(ownerId, async (tx) => {
      const ctx = await resolveOrgContext(tx, { userId: ownerId, organizationId: orgId, locale: 'en' });
      await createOpportunity(ctx, {
        name: 'Pipeline deal',
        nextActionAt: '2026-06-15T10:00:00.000Z',
        nextActionText: 'Call customer',
      });
    });
    await database.asService(async (db) => {
      const assetId = randomUUID();
      await db.insert(assets).values({
        id: assetId,
        organizationId: orgId,
        name: 'Test vehicle',
        assetKind: 'vehicle',
      });
      await db.insert(complianceArtifacts).values({
        id: randomUUID(),
        organizationId: orgId,
        artifactKind: 'insurance',
        name: 'Insurance cert',
        subjectType: 'organization',
        expiresOn: '2026-06-20',
      });
      await db.insert(maintenanceRecords).values({
        id: randomUUID(),
        organizationId: orgId,
        assetId,
        title: 'Fleet service',
        performedOn: '2026-06-18',
        status: 'completed',
      });
    });
  }

  it('hides CRM, compliance, and maintenance for scheduling.read only', async () => {
    await seedCrossModuleSources();
    const worker = await addOrgMember(database, orgId, 'cal-worker', 'worker');
    const range = { from: '2026-06-01', to: '2026-06-30' };

    const sources = await database.asUser(worker.id, async (tx) =>
      listExistingDatedSources(tx, orgId, range, accessFor([PERMISSIONS.SCHEDULING_READ])),
    );

    const kinds = new Set(sources.map((s) => s.kind));
    expect(kinds.has('follow_up')).toBe(false);
    expect(kinds.has('compliance')).toBe(false);
    expect(kinds.has('maintenance')).toBe(false);
  });

  it('hides CRM when crm module is disabled even with crm.read', async () => {
    await seedCrossModuleSources();
    const worker = await addOrgMember(database, orgId, 'cal-crm-off', 'worker');
    const range = { from: '2026-06-01', to: '2026-06-30' };
    const modules = resolveModuleVisibility([]);
    Object.keys(modules).forEach((key) => {
      (modules as Record<string, boolean>)[key] = true;
    });
    modules.crm = false;

    const sources = await database.asUser(worker.id, async (tx) =>
      listExistingDatedSources(tx, orgId, range, {
        hasPermission: (key) =>
          ([PERMISSIONS.SCHEDULING_READ, PERMISSIONS.CRM_READ] as const).includes(
            key as typeof PERMISSIONS.SCHEDULING_READ | typeof PERMISSIONS.CRM_READ,
          ),
        modules,
      }),
    );

    expect(sources.some((s) => s.kind === 'follow_up')).toBe(false);
  });

  it('shows CRM follow-ups when crm.read is granted', async () => {
    await seedCrossModuleSources();
    const worker = await addOrgMember(database, orgId, 'cal-crm', 'worker');
    const range = { from: '2026-06-01', to: '2026-06-30' };

    const sources = await database.asUser(worker.id, async (tx) =>
      listExistingDatedSources(tx, orgId, range, accessFor([PERMISSIONS.SCHEDULING_READ, PERMISSIONS.CRM_READ])),
    );

    expect(
      sources.some(
        (s) => s.kind === 'follow_up' && (s.href?.includes('/crm/opportunities/') ?? false),
      ),
    ).toBe(true);
  });
});
