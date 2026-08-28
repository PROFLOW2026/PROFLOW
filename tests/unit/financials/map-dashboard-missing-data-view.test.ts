import { describe, expect, it } from 'vitest';
import heDashboard from '@/locales/he-IL/dashboard.json';
import { mapDashboardMissingDataToView } from '@/modules/financials/ui/map-dashboard-missing-data-view';
import type { DashboardMissingDataItem } from '@/modules/financials/domain/dashboard-missing-data';
import { money } from '@/shared/money';

const t = (key: string, values?: Record<string, string | number>) => {
  const parts = key.split('.');
  let current: unknown = heDashboard;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return key;
    current = (current as Record<string, unknown>)[part];
  }
  if (typeof current !== 'string') return key;
  return current.replace(/\{(\w+)\}/g, (_, token: string) => String(values?.[token] ?? `{${token}}`));
};

describe('mapDashboardMissingDataToView unallocated attention', () => {
  it('maps count, amount, expense rows, and filtered CTA for unallocated remainder', () => {
    const item: DashboardMissingDataItem = {
      code: 'unallocated_remainder',
      kind: 'attention',
      required: false,
      severity: 'optional',
      scope: 'organization',
      projectId: null,
      projectName: null,
      count: 2,
      affectedMetrics: ['actual_cost', 'forecast_cost'],
      actionHref: '/expenses?unallocated=true',
      amount: money('25149', 'ILS'),
      expenseSamples: [
        {
          id: 'exp-1',
          expenseDate: '2026-08-27',
          description: 'השכרת מחסן',
          supplierName: null,
          vendorName: 'אשלט ניהול בע״מ',
          netAmount: '12600',
          currency: 'ILS',
        },
      ],
    };

    const [view] = mapDashboardMissingDataToView([item], t, { locale: 'he-IL' });
    expect(view).toBeDefined();

    expect(view!.title).toBe(heDashboard.missingData.items.unallocated_remainder.title);
    expect(view!.statsLine).toContain('2');
    expect(view!.statsLine).toContain('₪');
    expect(view!.actionHref).toBe('/expenses?unallocated=true');
    expect(view!.actionLabel).toBe('הצגת ההוצאות שדורשות חלוקה');
    expect(view!.clarification).toBe(heDashboard.missingData.unallocatedNotMissing);
    expect(view!.expenseRows?.[0]?.href).toBe(
      '/expenses/exp-1?focus=allocation&returnTo=%2Fexpenses%3Funallocated%3Dtrue',
    );
    expect(view!.expenseRows?.[0]?.label).toContain('אשלט ניהול בע״מ');
    expect(view!.expenseRows?.[0]?.label).not.toContain('General');
  });
});
