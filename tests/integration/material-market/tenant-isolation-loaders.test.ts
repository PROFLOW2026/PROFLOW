import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { materialItems, materialPressureSnapshots, materialVendorPrices } from '@drizzle/schema';
import { createVendor } from '@/modules/vendors';
import { loadMaterialMarketDashboard } from '@/modules/material-market';
import { loadSupplierSignalsByTrade, upsertSnapshots } from '@/modules/material-market/data/repositories';
import { METHODOLOGY_VERSION, type TradeSnapshotRow } from '@/modules/material-market/domain/types';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTwoTenantScenario } from '../../setup/fixtures';

describe('material market tenant isolation (loaders)', () => {
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

  it('Org B cannot see Org A vendor price signals via context.db loaders', async () => {
    const { orgA, orgB, userA, userB } = await createTwoTenantScenario(database);
    const secretMonth = '2026-06';
    const secretPrice = '88888.000000';

    await database.asUser(userA.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const vendor = await createVendor(ctx, { name: 'Org A Secret Supplier Ltd' });
      const [item] = await tx
        .insert(materialItems)
        .values({
          organizationId: orgA.organization.id,
          name: 'Rebar 12mm',
          unit: 'ton',
          trade: 'steel_rebar',
          currency: 'ILS',
        })
        .returning({ id: materialItems.id });
      await tx.insert(materialVendorPrices).values({
        organizationId: orgA.organization.id,
        materialItemId: item!.id,
        vendorId: vendor.id,
        unitPrice: secretPrice,
        currency: 'ILS',
        effectiveFrom: `${secretMonth}-15`,
      });
    });

    const orgASignals = await database.asUser(userA.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      return loadSupplierSignalsByTrade(ctx.db);
    });

    const orgBSignals = await database.asUser(userB.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'he-IL',
      });
      return loadSupplierSignalsByTrade(ctx.db);
    });

    expect(orgASignals.steel_rebar?.[secretMonth]).toBeCloseTo(88888, 0);
    expect(orgBSignals.steel_rebar?.[secretMonth]).toBeUndefined();
  });

  it('global pressure snapshots remain visible to both orgs', async () => {
    const { orgA, orgB, userA, userB } = await createTwoTenantScenario(database);
    const snap: TradeSnapshotRow = {
      trade: 'electrical',
      snapshotDate: '2026-06-01',
      pressureScore: 42,
      pressureDirection: 'up',
      confidence: 'medium',
      pressureScore1mChange: 1,
      pressureScore3mChange: 2,
      pressureMomentum: 'rising',
      localConfirmation: 'not_confirmed',
      weightedDataCoverage: 0.8,
      components: {},
      driversUp: [],
      driversDown: [],
      methodologyVersion: METHODOLOGY_VERSION,
    };

    await database.asService(async (db) => {
      await upsertSnapshots(db, [snap]);
    });

    const dashA = await database.asUser(userA.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      return loadMaterialMarketDashboard(ctx.db);
    });
    const dashB = await database.asUser(userB.id, async (tx) => {
      const ctx = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'he-IL',
      });
      return loadMaterialMarketDashboard(ctx.db);
    });

    const entryA = dashA.find((e) => e.trade === 'electrical')?.snapshot;
    const entryB = dashB.find((e) => e.trade === 'electrical')?.snapshot;
    expect(entryA?.pressureScore).toBe(42);
    expect(entryB?.pressureScore).toBe(42);

    const count = await database.asService(async (db) => {
      const rows = await db.select().from(materialPressureSnapshots).limit(5);
      return rows.length;
    });
    expect(count).toBeGreaterThan(0);
  });
});
