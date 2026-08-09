import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import {
  allocationRunLines,
  allocationRuns,
  costCategories,
  expenses,
  projects,
} from '@drizzle/schema';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';
import { insertAllocationRun } from '@/modules/expenses/data/allocation-runs.repository';
import { scheduleModeFromCategoryPeriodBehavior } from '@/modules/expenses/domain/allocation-schedule';

async function provisionTenant(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) => createOrganization(db, owner.id, { name, countryCode: 'IL' }));
}

describe('allocation run integrity (0018)', () => {
  let database: TestDatabase;
  let userA: TestUser;
  let userB: TestUser;
  let orgAId: string;
  let orgBId: string;
  let expenseAId: string;
  let projectAId: string;
  let projectBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);

    userA = await createTestUser(database, 'alloc-integrity-a@example.test');
    userB = await createTestUser(database, 'alloc-integrity-b@example.test');

    const orgA = await provisionTenant(database, userA, 'Integrity Org A');
    const orgB = await provisionTenant(database, userB, 'Integrity Org B');
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;

    await database.asService(async (db) => {
      const [projectA] = await db
        .insert(projects)
        .values({ organizationId: orgAId, name: 'Project A', status: 'active' })
        .returning({ id: projects.id });
      projectAId = projectA!.id;

      const [projectB] = await db
        .insert(projects)
        .values({ organizationId: orgBId, name: 'Project B', status: 'active' })
        .returning({ id: projects.id });
      projectBId = projectB!.id;

      const [category] = await db
        .insert(costCategories)
        .values({
          organizationId: orgAId,
          key: `overhead_${randomUUID().slice(0, 8)}`,
          name: 'Overhead',
          family: 'business_overhead',
          isSystem: false,
          sortOrder: 0,
        })
        .returning({ id: costCategories.id });

      const [expense] = await db
        .insert(expenses)
        .values({
          organizationId: orgAId,
          expenseDate: '2026-01-15',
          costFamily: 'business_overhead',
          costCategoryId: category!.id,
          netAmount: '24000',
          grossAmount: '24000',
          currency: 'ILS',
          status: 'draft',
          allocationPeriodStart: '2026-01-01',
          allocationPeriodEnd: '2026-12-31',
          allocationScheduleMode: 'annual',
          createdByUserId: userA.id,
        })
        .returning({ id: expenses.id });
      expenseAId = expense!.id;
    });
  });

  afterAll(async () => {
    await database.close();
  });

  it('maps category period behavior → schedule mode without ambiguity', () => {
    expect(scheduleModeFromCategoryPeriodBehavior('one_time')).toBe('one_time');
    expect(scheduleModeFromCategoryPeriodBehavior('monthly')).toBe('monthly');
    expect(scheduleModeFromCategoryPeriodBehavior('date_range')).toBe('custom');
    expect(scheduleModeFromCategoryPeriodBehavior(null)).toBeNull();
    // annual is expense-level only — not a category vocabulary value
  });

  it('rejects allocation_run.organization_id mismatched to expense org', async () => {
    await database.asService(async (db) => {
      await expect(
        db.insert(allocationRuns).values({
          organizationId: orgBId,
          expenseId: expenseAId,
          method: 'equal_split',
          status: 'draft',
          periodStart: '2026-01-01',
          periodEnd: '2026-01-31',
          sourceNetAmount: '24000',
          allocatableNetAmount: '2000',
          currency: 'ILS',
          amountBasis: 'net',
          explanation: {},
          scheduleMode: 'annual',
          sliceIndex: 0,
          sourcePeriodStart: '2026-01-01',
          sourcePeriodEnd: '2026-12-31',
        }),
      ).rejects.toThrow();
    });
  });

  it('rejects allocation_run_line.project from another organization', async () => {
    await database.asService(async (db) => {
      const runId = await insertAllocationRun(db, orgAId, {
        expenseId: expenseAId,
        method: 'equal_split',
        status: 'draft',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        sourceNetAmount: '24000',
        allocatableNetAmount: '2000',
        currency: 'ILS',
        amountBasis: 'net',
        explanation: { test: 'cross-tenant-line' },
        createdByUserId: userA.id,
        scheduleMode: 'annual',
        sliceIndex: 99,
        sourcePeriodStart: '2026-01-01',
        sourcePeriodEnd: '2026-12-31',
        lines: [],
      });

      await expect(
        db.insert(allocationRunLines).values({
          organizationId: orgAId,
          runId,
          projectId: projectBId,
          basisValue: '1',
          basisUnit: 'count',
          weightPercent: '100',
          amount: '2000',
          currency: 'ILS',
          sortOrder: 0,
        }),
      ).rejects.toThrow();

      await db
        .update(allocationRuns)
        .set({ status: 'superseded' })
        .where(eq(allocationRuns.id, runId));
    });
  });

  it('rejects duplicate active runs for the same expense + slice', async () => {
    await database.asService(async (db) => {
      const first = await insertAllocationRun(db, orgAId, {
        expenseId: expenseAId,
        method: 'equal_split',
        status: 'applied',
        periodStart: '2026-02-01',
        periodEnd: '2026-02-28',
        sourceNetAmount: '24000',
        allocatableNetAmount: '2000',
        currency: 'ILS',
        amountBasis: 'net',
        explanation: { test: 'dup-1' },
        createdByUserId: userA.id,
        scheduleMode: 'annual',
        sliceIndex: 1,
        sourcePeriodStart: '2026-01-01',
        sourcePeriodEnd: '2026-12-31',
        lines: [
          {
            projectId: projectAId,
            basisValue: '1',
            basisUnit: 'count',
            weightPercent: '100.0000',
            amount: '2000',
            currency: 'ILS',
            explanation: null,
            sortOrder: 0,
          },
        ],
      });

      await expect(
        insertAllocationRun(db, orgAId, {
          expenseId: expenseAId,
          method: 'equal_split',
          status: 'applied',
          periodStart: '2026-02-01',
          periodEnd: '2026-02-28',
          sourceNetAmount: '24000',
          allocatableNetAmount: '2000',
          currency: 'ILS',
          amountBasis: 'net',
          explanation: { test: 'dup-2' },
          createdByUserId: userA.id,
          scheduleMode: 'annual',
          sliceIndex: 1,
          sourcePeriodStart: '2026-01-01',
          sourcePeriodEnd: '2026-12-31',
          lines: [
            {
              projectId: projectAId,
              basisValue: '1',
              basisUnit: 'count',
              weightPercent: '100.0000',
              amount: '2000',
              currency: 'ILS',
              explanation: null,
              sortOrder: 0,
            },
          ],
        }),
      ).rejects.toThrow();

      // cleanup: supersede so later tests can reuse slices
      await db
        .update(allocationRuns)
        .set({ status: 'superseded' })
        .where(eq(allocationRuns.id, first));
    });
  });

  it('rejects duplicate project lines on the same run', async () => {
    await database.asService(async (db) => {
      await expect(
        insertAllocationRun(db, orgAId, {
          expenseId: expenseAId,
          method: 'equal_split',
          status: 'draft',
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
          sourceNetAmount: '24000',
          allocatableNetAmount: '2000',
          currency: 'ILS',
          amountBasis: 'net',
          explanation: { test: 'dup-line' },
          createdByUserId: userA.id,
          scheduleMode: 'annual',
          sliceIndex: 2,
          sourcePeriodStart: '2026-01-01',
          sourcePeriodEnd: '2026-12-31',
          lines: [
            {
              projectId: projectAId,
              basisValue: '1',
              basisUnit: 'count',
              weightPercent: '50.0000',
              amount: '1000',
              currency: 'ILS',
              explanation: null,
              sortOrder: 0,
            },
            {
              projectId: projectAId,
              basisValue: '1',
              basisUnit: 'count',
              weightPercent: '50.0000',
              amount: '1000',
              currency: 'ILS',
              explanation: null,
              sortOrder: 1,
            },
          ],
        }),
      ).rejects.toThrow();

      // Orphan draft run (lines insert failed) must not remain active.
      await db
        .update(allocationRuns)
        .set({ status: 'superseded' })
        .where(
          and(
            eq(allocationRuns.expenseId, expenseAId),
            eq(allocationRuns.sliceIndex, 2),
            eq(allocationRuns.status, 'draft'),
          ),
        );
    });
  });

  it('blocks silent UPDATE of applied snapshot amounts; allows status→superseded only', async () => {
    await database.asService(async (db) => {
      const runId = await insertAllocationRun(db, orgAId, {
        expenseId: expenseAId,
        method: 'equal_split',
        status: 'applied',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-30',
        sourceNetAmount: '24000',
        allocatableNetAmount: '2000',
        currency: 'ILS',
        amountBasis: 'net',
        explanation: { test: 'immutable' },
        createdByUserId: userA.id,
        scheduleMode: 'annual',
        sliceIndex: 3,
        sourcePeriodStart: '2026-01-01',
        sourcePeriodEnd: '2026-12-31',
        lines: [
          {
            projectId: projectAId,
            basisValue: '1',
            basisUnit: 'count',
            weightPercent: '100.0000',
            amount: '2000',
            currency: 'ILS',
            explanation: null,
            sortOrder: 0,
          },
        ],
      });

      await expect(
        db
          .update(allocationRuns)
          .set({ allocatableNetAmount: '1' })
          .where(eq(allocationRuns.id, runId)),
      ).rejects.toThrow();

      await expect(
        db
          .update(allocationRunLines)
          .set({ amount: '1' })
          .where(and(eq(allocationRunLines.runId, runId), eq(allocationRunLines.projectId, projectAId))),
      ).rejects.toThrow();

      await db
        .update(allocationRuns)
        .set({ status: 'superseded' })
        .where(eq(allocationRuns.id, runId));

      const [row] = await db
        .select({ amount: allocationRuns.allocatableNetAmount, status: allocationRuns.status })
        .from(allocationRuns)
        .where(eq(allocationRuns.id, runId));
      expect(row?.status).toBe('superseded');
      expect(row?.amount).toBe('2000.000000');
    });
  });

  it('blocks direct DELETE of applied runs', async () => {
    await database.asService(async (db) => {
      const runId = await insertAllocationRun(db, orgAId, {
        expenseId: expenseAId,
        method: 'equal_split',
        status: 'applied',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-31',
        sourceNetAmount: '24000',
        allocatableNetAmount: '2000',
        currency: 'ILS',
        amountBasis: 'net',
        explanation: { test: 'no-delete' },
        createdByUserId: userA.id,
        scheduleMode: 'annual',
        sliceIndex: 4,
        sourcePeriodStart: '2026-01-01',
        sourcePeriodEnd: '2026-12-31',
        lines: [
          {
            projectId: projectAId,
            basisValue: '1',
            basisUnit: 'count',
            weightPercent: '100.0000',
            amount: '2000',
            currency: 'ILS',
            explanation: null,
            sortOrder: 0,
          },
        ],
      });

      await expect(
        db.delete(allocationRuns).where(eq(allocationRuns.id, runId)),
      ).rejects.toThrow();

      await db
        .update(allocationRuns)
        .set({ status: 'superseded' })
        .where(eq(allocationRuns.id, runId));
    });
  });

  it('rejects malformed periodic metadata', async () => {
    await database.asService(async (db) => {
      await expect(
        db.insert(allocationRuns).values({
          organizationId: orgAId,
          expenseId: expenseAId,
          method: 'equal_split',
          status: 'draft',
          periodStart: '2026-06-01',
          periodEnd: '2026-06-30',
          sourceNetAmount: '24000',
          allocatableNetAmount: '2000',
          currency: 'ILS',
          amountBasis: 'net',
          explanation: {},
          scheduleMode: 'annual',
          sliceIndex: null,
          sourcePeriodStart: '2026-01-01',
          sourcePeriodEnd: '2026-12-31',
        }),
      ).rejects.toThrow();
    });
  });

  it('exposes 0018 integrity objects after clean migrate', async () => {
    await database.asService(async (db) => {
      const indexRows = resultRows<{ indexname: string }>(
        await db.execute(sql`
          select indexname from pg_indexes
          where schemaname = 'public'
            and indexname in (
              'allocation_runs_expense_slice_active_uq',
              'allocation_run_lines_run_project_uq',
              'expenses_id_organization_id_uq'
            )
        `),
      );
      expect(indexRows.map((row) => row.indexname).sort()).toEqual([
        'allocation_run_lines_run_project_uq',
        'allocation_runs_expense_slice_active_uq',
        'expenses_id_organization_id_uq',
      ]);

      const constraintRows = resultRows<{ conname: string }>(
        await db.execute(sql`
          select conname from pg_constraint
          where conname in (
            'allocation_runs_expense_org_fk',
            'allocation_run_lines_run_org_fk',
            'allocation_run_lines_project_org_fk',
            'allocation_runs_periodic_fields_consistent'
          )
          order by conname
        `),
      );
      expect(constraintRows.map((row) => row.conname)).toEqual([
        'allocation_run_lines_project_org_fk',
        'allocation_run_lines_run_org_fk',
        'allocation_runs_expense_org_fk',
        'allocation_runs_periodic_fields_consistent',
      ]);
    });
  });
});
