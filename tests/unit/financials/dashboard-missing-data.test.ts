import { describe, expect, it } from 'vitest';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import {
  buildDashboardMissingDataItems,
  partitionDashboardCompletenessItems,
  resolveDashboardKpiAvailability,
} from '@/modules/financials/domain/dashboard-missing-data';
import { money } from '@/shared/money';

const ILS = 'ILS';

describe('buildDashboardMissingDataItems', () => {
  it('returns no items when confidence is high and pricing basis exists', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: { level: 'high', reasons: [] },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: null,
      openPriceProjectCount: 0,
      pricedProjectCount: 2,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });
    expect(items).toEqual([]);
  });

  it('emits workforce missing-cost items per project when signals exist', () => {
    const costCoverage = buildFinancialCoverage([], new Date(), [
      { reason: 'workforce_entries_missing_cost', count: 5 },
    ]);
    const items = buildDashboardMissingDataItems({
      dataConfidence: {
        level: 'needs_data',
        reasons: ['workforce_entries_missing_cost'],
      },
      costCoverage,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: null,
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [
        {
          projectId: 'p1',
          projectName: 'Alpha',
          missingCostEntryCount: 3,
        },
      ],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      code: 'workforce_entries_missing_cost',
      kind: 'missing',
      required: true,
      scope: 'project',
      projectId: 'p1',
      actionHref: '/projects/p1?tab=time',
    });
  });

  it('adds open-price contract basis when no priced projects remain', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: { level: 'high', reasons: [] },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: null,
      openPriceProjectCount: 2,
      pricedProjectCount: 0,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    const item = items.find((entry) => entry.code === 'open_price_contract_basis');
    expect(item).toMatchObject({ kind: 'missing' });
  });

  it('classifies unallocated remainder as attention, not missing information', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: { level: 'medium', reasons: ['unallocated_remainder'] },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: money('120.00', ILS),
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    expect(items[0]).toMatchObject({
      code: 'unallocated_remainder',
      kind: 'attention',
      required: false,
      severity: 'optional',
    });
  });

  it('classifies draft documents and open allocations as attention', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: {
        level: 'medium',
        reasons: ['open_draft_documents', 'open_allocations'],
      },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: null,
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    expect(items.every((item) => item.kind === 'attention')).toBe(true);
  });
});

describe('partitionDashboardCompletenessItems', () => {
  it('separates one missing item from two attention items', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: {
        level: 'needs_data',
        reasons: ['workforce_entries_missing_cost', 'open_draft_documents', 'open_allocations'],
      },
      costCoverage: buildFinancialCoverage([], new Date(), [
        { reason: 'workforce_entries_missing_cost', count: 2 },
      ]),
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: null,
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    const { missing, attention } = partitionDashboardCompletenessItems(items);
    expect(missing).toHaveLength(1);
    expect(missing[0]?.code).toBe('workforce_entries_missing_cost');
    expect(attention).toHaveLength(2);
    expect(attention.map((item) => item.code)).toEqual(
      expect.arrayContaining(['open_draft_documents', 'open_allocations']),
    );
  });
});

describe('resolveDashboardKpiAvailability', () => {
  it('marks contract and profit unavailable when all work is open-price', () => {
    const availability = resolveDashboardKpiAvailability({
      missingItems: [],
      openPriceProjectCount: 3,
      pricedProjectCount: 0,
      hasContractValue: true,
      hasProfitValue: true,
    });

    expect(availability.contractValue).toBe('unavailable');
    expect(availability.estimatedProfit).toBe('unavailable');
    expect(availability.unavailableReasonCode).toBe('open_price_contract_basis');
  });

  it('keeps KPIs available when priced projects exist', () => {
    const availability = resolveDashboardKpiAvailability({
      missingItems: [],
      openPriceProjectCount: 1,
      pricedProjectCount: 2,
      hasContractValue: true,
      hasProfitValue: true,
    });

    expect(availability.contractValue).toBe('value');
    expect(availability.estimatedProfit).toBe('value');
  });
});
