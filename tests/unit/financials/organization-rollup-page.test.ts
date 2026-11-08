import { describe, expect, it } from 'vitest';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import { presentOrganizationRollup } from '@/modules/financials/domain/organization-rollup-page';
import { money } from '@/shared/money';

const ILS = 'ILS';
const PAGE_SIZE = 100;
const PROJECT_COUNT = PAGE_SIZE + 1;

function amount(value: string) {
  return money(value, ILS);
}

function row(index: number): ProjectRollupRow {
  return {
    projectId: `p-${index}`,
    name: `Project ${index}`,
    status: 'active',
    workKind: 'project',
    pricingMode: 'fixed',
    priceNotSet: false,
    currency: ILS,
    originalContract: amount('20'),
    approvedAdditions: amount('0'),
    approvedReductions: amount('0'),
    currentContract: amount('20'),
    pendingChanges: amount('0'),
    invoiced: amount('8'),
    paid: amount('5'),
    outstanding: amount('3'),
    actualCost: amount('5'),
    laborActual: amount('1'),
    vendorActual: amount('2'),
    overheadActual: amount('2'),
    committedOpen: amount('1'),
    openApPayable: amount('1'),
    expectedRemainingCost: amount('1'),
    estimatedFinalCost: amount('6'),
    assetCapitalActual: amount('0'),
    estimatedProfit: amount('14'),
    marginPercent: '70.00',
    actualProfit: amount('15'),
    actualMarginPercent: '75.00',
    progressPercent: '10',
    profitable: true,
  };
}

describe('organization rollup page', () => {
  it('totals every project when the list is longer than the page', () => {
    const eligible = Array.from({ length: PROJECT_COUNT }, (_, index) => row(index));
    const presented = presentOrganizationRollup(eligible, {
      currency: ILS,
      offset: 0,
      limit: PAGE_SIZE,
      canReadCommercial: true,
    });

    expect(presented.rows).toHaveLength(PAGE_SIZE);
    expect(presented.eligibleRows).toHaveLength(PROJECT_COUNT);
    expect(presented.showing).toEqual({ from: 1, to: PAGE_SIZE, total: PROJECT_COUNT });

    const full = (count: number, each: string) => money(String(count * Number(each)), ILS).amount;
    expect(presented.totals.profit.actualProfit?.value.amount).toBe(full(PROJECT_COUNT, '15'));
    expect(presented.totals.profit.estimatedProfit?.value.amount).toBe(full(PROJECT_COUNT, '14'));
    expect(presented.totals.cost.actual?.value.amount).toBe(full(PROJECT_COUNT, '5'));
    expect(presented.totals.cost.overhead?.value.amount).toBe(full(PROJECT_COUNT, '2'));
    expect(presented.totals.cash.outstanding.value.amount).toBe(full(PROJECT_COUNT, '3'));
    expect(presented.totals.commercial.current.value.amount).toBe(full(PROJECT_COUNT, '20'));
    expect(presented.totals.recognizedCompanyRevenue?.amount).toBe(full(PROJECT_COUNT, '20'));

    const pageOnly = presentOrganizationRollup(presented.rows, {
      currency: ILS,
      canReadCommercial: true,
    });
    expect(pageOnly.totals.profit.actualProfit?.value.amount).toBe(full(PAGE_SIZE, '15'));
    expect(pageOnly.totals.profit.actualProfit?.value.amount).not.toBe(
      presented.totals.profit.actualProfit?.value.amount,
    );
  });
});
