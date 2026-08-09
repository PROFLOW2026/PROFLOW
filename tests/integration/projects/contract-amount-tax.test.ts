import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resolveOrgContext } from '@/modules/tenancy';
import { createProject, getProjectDetail, updateProject } from '@/modules/projects';
import { computeProfitPosition } from '@/modules/financials/domain/profit';
import { money, zeroMoney } from '@/shared/money';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('project contract amount tax mode', () => {
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

  it('stores net contract value when amount excludes VAT', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const detail = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name: 'Excluding VAT job',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      return getProjectDetail(context, projectId);
    });

    expect(detail.contract?.amountIncludesTax).toBe(false);
    expect(detail.contract?.enteredValueAmount).toBe('100000.000000');
    expect(detail.contract?.originalValueAmount).toBe('100000.000000');
    expect(detail.contract?.originalTaxAmount).toBe('18000.000000');
    expect(detail.contract?.originalGrossAmount).toBe('118000.000000');
    expect(detail.currentContractValue?.amount).toBe('100000.000000');
    expect(Number(detail.contract?.taxSnapshot?.ratePercent)).toBe(18);
  });

  it('derives net from an including-VAT amount using the configured tax rule', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const detail = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name: 'Including VAT job',
        contractValueAmount: '118000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: true,
      });
      return getProjectDetail(context, projectId);
    });

    expect(detail.contract?.amountIncludesTax).toBe(true);
    expect(detail.contract?.enteredValueAmount).toBe('118000.000000');
    expect(detail.contract?.originalValueAmount).toBe('100000.000000');
    expect(detail.contract?.originalTaxAmount).toBe('18000.000000');
    expect(detail.contract?.originalGrossAmount).toBe('118000.000000');
    expect(detail.currentContractValue?.amount).toBe('100000.000000');
  });

  it('preserves VAT mode on edit and recalculates when the mode changes', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const afterCreate = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name: 'Edit VAT job',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      return getProjectDetail(context, projectId);
    });

    expect(afterCreate.contract?.amountIncludesTax).toBe(false);

    const afterModeFlip = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      await updateProject(context, {
        projectId: afterCreate.project.id,
        contractValueAmount: '118000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: true,
      });
      return getProjectDetail(context, afterCreate.project.id);
    });

    expect(afterModeFlip.contract?.amountIncludesTax).toBe(true);
    expect(afterModeFlip.contract?.enteredValueAmount).toBe('118000.000000');
    expect(afterModeFlip.contract?.originalValueAmount).toBe('100000.000000');
    expect(afterModeFlip.currentContractValue?.amount).toBe('100000.000000');

    const afterPreserve = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      await updateProject(context, {
        projectId: afterCreate.project.id,
        name: 'Edit VAT job renamed',
        contractValueAmount: '118000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: true,
      });
      return getProjectDetail(context, afterCreate.project.id);
    });

    expect(afterPreserve.project.name).toBe('Edit VAT job renamed');
    expect(afterPreserve.contract?.amountIncludesTax).toBe(true);
    expect(afterPreserve.contract?.originalValueAmount).toBe('100000.000000');
    expect(afterPreserve.contract?.taxSnapshot?.capturedAt).toBe(
      afterModeFlip.contract?.taxSnapshot?.capturedAt,
    );
  });

  it('does not treat VAT as profit / revenue in profitability math', async () => {
    const contractNet = money('100000', 'ILS');
    const costs = money('40000', 'ILS');
    const profit = computeProfitPosition(contractNet, costs);

    expect(profit.estimatedProfit.amount).toBe('60000.000000');

    // Gross 118000 must never be the profitability base.
    const wrongBase = computeProfitPosition(money('118000', 'ILS'), costs);
    expect(wrongBase.estimatedProfit.amount).not.toBe(profit.estimatedProfit.amount);

    const zeroCost = computeProfitPosition(contractNet, zeroMoney('ILS'));
    expect(zeroCost.estimatedProfit.amount).toBe('100000.000000');
  });
});
