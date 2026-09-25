import { describe, expect, it } from 'vitest';
import { aggregateClientProfitability } from '@/modules/clients/domain/client-profitability';
import type { ClientProfitProjectInput } from '@/modules/clients/domain/client-profitability';
import { money } from '@/shared/money';

function project(overrides: Partial<ClientProfitProjectInput> & Pick<ClientProfitProjectInput, 'projectId' | 'name'>): ClientProfitProjectInput {
  return {
    status: 'active',
    currency: 'ILS',
    excludedForeignCurrency: false,
    priceNotSet: false,
    withheldProfit: false,
    profitabilityMode: 'direct',
    currentContract: money('100', 'ILS'),
    netBilled: money('40', 'ILS'),
    collected: money('10', 'ILS'),
    openAr: money('30', 'ILS'),
    directActual: money('70', 'ILS'),
    allocatedOverhead: money('5', 'ILS'),
    fullActual: money('75', 'ILS'),
    actualProfit: money('30', 'ILS'),
    marginPercent: '30.00',
    ...overrides,
  };
}

describe('aggregateClientProfitability', () => {
  it('returns an empty snapshot when the client has no projects', () => {
    const snapshot = aggregateClientProfitability([], 'ILS');
    expect(snapshot.hasProjects).toBe(false);
    expect(snapshot.profit).toBeNull();
    expect(snapshot.currentContract).toBeNull();
    expect(snapshot.projects).toEqual([]);
  });

  it('sums engine actual profit and keeps billed and collected apart', () => {
    const snapshot = aggregateClientProfitability(
      [
        project({
          projectId: 'a',
          name: 'A',
          currentContract: money('200', 'ILS'),
          netBilled: money('80', 'ILS'),
          collected: money('20', 'ILS'),
          actualProfit: money('50', 'ILS'),
          directActual: money('140', 'ILS'),
          allocatedOverhead: money('10', 'ILS'),
          fullActual: money('150', 'ILS'),
        }),
        project({
          projectId: 'b',
          name: 'B',
          currentContract: money('100', 'ILS'),
          netBilled: money('10', 'ILS'),
          collected: money('5', 'ILS'),
          actualProfit: money('-25', 'ILS'),
          directActual: money('120', 'ILS'),
          allocatedOverhead: money('5', 'ILS'),
          fullActual: money('125', 'ILS'),
        }),
      ],
      'ILS',
    );

    expect(snapshot.currentContract?.amount).toBe('300.000000');
    expect(snapshot.netBilled?.amount).toBe('90.000000');
    expect(snapshot.collected?.amount).toBe('25.000000');
    expect(snapshot.directActual?.amount).toBe('260.000000');
    expect(snapshot.allocatedOverhead?.amount).toBe('15.000000');
    expect(snapshot.fullActual?.amount).toBe('275.000000');
    expect(snapshot.profit?.amount).toBe('25.000000');
    expect(snapshot.marginPercent).toBe('8.33');
    expect(snapshot.projects.map((row) => row.projectId)).toEqual(['a', 'b']);
  });

  it('does not treat a missing price as zero profit', () => {
    const snapshot = aggregateClientProfitability(
      [
        project({ projectId: 'priced', name: 'Priced', actualProfit: money('40', 'ILS') }),
        project({
          projectId: 'open',
          name: 'Open',
          priceNotSet: true,
          currentContract: null,
          actualProfit: null,
          marginPercent: null,
        }),
      ],
      'ILS',
    );
    expect(snapshot.profit?.amount).toBe('40.000000');
    expect(snapshot.priceNotSetCount).toBe(1);
    expect(snapshot.marginPercent).toBe('40.00');
  });

  it('leaves foreign-currency projects out of the totals', () => {
    const snapshot = aggregateClientProfitability(
      [
        project({ projectId: 'ils', name: 'ILS', actualProfit: money('10', 'ILS') }),
        project({
          projectId: 'usd',
          name: 'USD',
          currency: 'USD',
          excludedForeignCurrency: true,
          currentContract: money('999', 'USD'),
          actualProfit: money('999', 'USD'),
        }),
      ],
      'ILS',
    );
    expect(snapshot.profit?.amount).toBe('10.000000');
    expect(snapshot.currentContract?.amount).toBe('100.000000');
    expect(snapshot.excludedForeignCurrencyCount).toBe(1);
    expect(snapshot.projects.find((row) => row.projectId === 'usd')?.profit).toBeNull();
  });

  it('sums each project actual profit when modes differ and withholds a blended margin when profit is missing', () => {
    const mixed = aggregateClientProfitability(
      [
        project({
          projectId: 'direct',
          name: 'Direct',
          profitabilityMode: 'direct',
          actualProfit: money('20', 'ILS'),
        }),
        project({
          projectId: 'full',
          name: 'Full',
          profitabilityMode: 'include_general',
          actualProfit: money('5', 'ILS'),
        }),
      ],
      'ILS',
    );
    expect(mixed.mixedProfitabilityModes).toBe(true);
    expect(mixed.profit?.amount).toBe('25.000000');

    const incomplete = aggregateClientProfitability(
      [
        project({ projectId: 'ok', name: 'Ok', actualProfit: money('10', 'ILS') }),
        project({
          projectId: 'held',
          name: 'Held',
          withheldProfit: true,
          actualProfit: null,
          marginPercent: null,
        }),
      ],
      'ILS',
    );
    expect(incomplete.profitIncomplete).toBe(true);
    expect(incomplete.profit?.amount).toBe('10.000000');
    expect(incomplete.marginPercent).toBeNull();
  });
});
