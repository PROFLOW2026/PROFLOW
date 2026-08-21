import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAsset, recordEquipmentUsage, recordMaterialUsage } from '@/modules/assets';
import { getExpense } from '@/modules/expenses/application/queries';
import { loadProjectExpenseContributions } from '@/modules/financials/data/expenses.repository';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import {
  createLinkedExpenseFromOpsRecord,
  expenseStatusContributesToActual,
  getActiveOpsExpenseLink,
  setOpsFinancePersistenceReadyForTests,
} from '@/modules/ops-finance';
import { createProject } from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { zeroMoney } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../projects/setup';

describe('usage records → linked expense (draft only, integration)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    setOpsFinancePersistenceReadyForTests(null);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    setOpsFinancePersistenceReadyForTests(true);
  });

  async function assertDraftOnlyForUsage(input: {
    readonly opsRecordKind: 'material_usage_record' | 'equipment_usage_record';
    readonly opsRecordId: string;
    readonly projectId: string;
    readonly userId: string;
    readonly organizationId: string;
    readonly amount: string;
  }) {
    await database.asUser(input.userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: input.userId,
        organizationId: input.organizationId,
        locale: 'en',
      });

      const linked = await createLinkedExpenseFromOpsRecord(context, {
        opsRecordKind: input.opsRecordKind,
        opsRecordId: input.opsRecordId,
        amount: input.amount,
        currency: 'ILS',
      });

      expect(linked.expenseStatus).toBe('draft');
      expect(expenseStatusContributesToActual(linked.expenseStatus)).toBe(false);

      const expense = await getExpense(context, linked.expenseId);
      expect(expense.status).toBe('draft');

      const persistedLink = await getActiveOpsExpenseLink(
        context,
        input.opsRecordKind,
        input.opsRecordId,
      );
      expect(persistedLink?.expenseId).toBe(linked.expenseId);

      const contributions = await loadProjectExpenseContributions(
        context.db,
        context.organizationId,
        input.projectId,
      );
      expect(contributions).toHaveLength(0);

      const aggregated = aggregateProjectCosts(contributions, null, 'ILS');
      expect(aggregated.cost.actualCostToDate).toEqual(zeroMoney('ILS'));

      await expect(
        createLinkedExpenseFromOpsRecord(context, {
          opsRecordKind: input.opsRecordKind,
          opsRecordId: input.opsRecordId,
          amount: input.amount,
          currency: 'ILS',
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  }

  it('material_usage_record creates DRAFT expense, blocks duplicate link, never Actual', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const fixture = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Material Usage Site' });
      const usage = await recordMaterialUsage(context, {
        projectId,
        description: 'Rebar bundle',
        quantity: '12',
        unit: 'ea',
        usageDate: '2026-08-14',
      });
      return { projectId, usageId: usage.id };
    });

    await assertDraftOnlyForUsage({
      opsRecordKind: 'material_usage_record',
      opsRecordId: fixture.usageId,
      projectId: fixture.projectId,
      userId: userA.id,
      organizationId: orgA.organization.id,
      amount: '4800',
    });
  });

  it('equipment_usage_record creates DRAFT expense, blocks duplicate link, never Actual', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const fixture = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Equipment Usage Site' });
      const { asset } = await createAsset(context, { name: 'Tower Crane', assetKind: 'equipment' });
      const usage = await recordEquipmentUsage(context, {
        projectId,
        assetId: asset.id,
        usageDate: '2026-08-14',
        hours: '8',
      });
      return { projectId, usageId: usage.id };
    });

    await assertDraftOnlyForUsage({
      opsRecordKind: 'equipment_usage_record',
      opsRecordId: fixture.usageId,
      projectId: fixture.projectId,
      userId: userA.id,
      organizationId: orgA.organization.id,
      amount: '3200',
    });
  });

  it('rejects createExpense callback that returns non-draft status', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const usageId = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Guard Site' });
      const usage = await recordMaterialUsage(context, {
        projectId,
        description: 'Cement bags',
        quantity: '40',
        unit: 'bag',
        usageDate: '2026-08-15',
      });
      return usage.id;
    });

    await expect(
      database.asUser(userA.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        await createLinkedExpenseFromOpsRecord(
          context,
          {
            opsRecordKind: 'material_usage_record',
            opsRecordId: usageId,
            amount: '900',
            currency: 'ILS',
          },
          {
            createExpense: async () => ({ id: randomUUID(), status: 'finalized' }),
          },
        );
      }),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
