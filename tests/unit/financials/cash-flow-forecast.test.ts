import { describe, expect, it } from 'vitest';
import {
  buildCashFlowOutlook,
} from '@/modules/financials/domain/cash-flow';
import {
  buildCashFlowForecast,
  certaintyForDatedSource,
  type CashFlowForecastItem,
} from '@/modules/financials/domain/cash-flow-forecast';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

describe('cash flow forecast certainty', () => {
  it('never invents a date - missing due dates stay uncertain/undated', () => {
    expect(certaintyForDatedSource({ dueDate: null, recorded: true })).toBe('uncertain');
    expect(certaintyForDatedSource({ dueDate: businessDate('2026-08-12'), recorded: true })).toBe(
      'confirmed',
    );
    expect(certaintyForDatedSource({ dueDate: businessDate('2026-08-12'), recorded: false })).toBe(
      'expected',
    );
  });

  it('keeps undated items out of timed buckets and labels recurring drafts as expected', () => {
    const outlook = buildCashFlowOutlook({
      currency: 'ILS',
      asOf: businessDate('2026-08-09'),
      outstandingRecords: [],
      payments: [],
      openApBills: [],
    });

    const items: CashFlowForecastItem[] = [
      {
        id: '1',
        href: '/billing/1',
        label: 'Invoice',
        amount: money('100', 'ILS'),
        dueDate: null,
        certainty: 'uncertain',
        direction: 'in',
        sourceType: 'issued_billing',
      },
      {
        id: '2',
        href: '/recurring-drafts/2',
        label: 'Monthly vendor draft',
        amount: money('40', 'ILS'),
        dueDate: businessDate('2026-08-15'),
        certainty: 'expected',
        direction: 'out',
        sourceType: 'recurring_draft',
      },
    ];

    const forecast = buildCashFlowForecast({
      outlook,
      items,
      showInflows: true,
      showOutflows: true,
    });

    expect(forecast.periods.find((p) => p.key === 'undated')?.expectedIn.amount).toBe('100.000000');
    expect(forecast.periods.find((p) => p.key === 'next_7')?.expectedOut.amount).toBe('40.000000');
    expect(forecast.incomingByCertainty.uncertain.amount).toBe('100.000000');
    expect(forecast.outgoingByCertainty.expected.amount).toBe('40.000000');
    expect(forecast.items.every((item) => item.dueDate !== undefined)).toBe(true);
    expect(forecast.items.find((item) => item.id === '1')?.dueDate).toBeNull();
  });

  it('hides inflow or outflow sections without permission flags', () => {
    const outlook = buildCashFlowOutlook({
      currency: 'ILS',
      asOf: businessDate('2026-08-09'),
      outstandingRecords: [],
      payments: [],
    });

    const forecast = buildCashFlowForecast({
      outlook,
      items: [
        {
          id: 'in',
          href: '/billing/1',
          label: 'In',
          amount: money('10', 'ILS'),
          dueDate: businessDate('2026-08-10'),
          certainty: 'confirmed',
          direction: 'in',
          sourceType: 'client_outstanding',
        },
        {
          id: 'out',
          href: '/procurement/ap/1',
          label: 'Out',
          amount: money('20', 'ILS'),
          dueDate: businessDate('2026-08-10'),
          certainty: 'confirmed',
          direction: 'out',
          sourceType: 'vendor_bill',
        },
      ],
      showInflows: true,
      showOutflows: false,
    });

    expect(forecast.items).toHaveLength(1);
    expect(forecast.items[0]?.direction).toBe('in');
    expect(forecast.periods.every((p) => p.expectedOut.amount === '0.000000')).toBe(true);
  });
});
