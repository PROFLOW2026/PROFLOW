import { describe, expect, it } from 'vitest';
import {
  buildDashboardMissingDataItems,
} from '@/modules/financials/domain/dashboard-missing-data';
import { mapDashboardMissingDataToView } from '@/modules/financials/ui/map-dashboard-missing-data-view';
import { money } from '@/shared/money';

const ILS = 'ILS';

describe('unallocated attention actionability', () => {
  it('routes unallocated remainder to filtered expenses list', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: { level: 'medium', reasons: ['unallocated_remainder'] },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: money('25149', ILS),
      unallocatedExpensePreview: {
        count: 4,
        amount: money('25149', ILS),
        samples: [
          {
            id: 'exp-1',
            expenseDate: '2026-08-27',
            description: 'השכרת מחסן',
            supplierName: null,
            vendorName: 'אשלט ניהול בע״מ',
            netAmount: '12600',
            currency: ILS,
          },
        ],
      },
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    expect(items[0]?.actionHref).toBe('/expenses?unallocated=true');
    expect(items[0]?.count).toBe(4);
    expect(items[0]?.expenseSamples).toHaveLength(1);
  });

  it('maps Hebrew unallocated view with stats, rows, and filtered CTA', () => {
    const item = buildDashboardMissingDataItems({
      dataConfidence: { level: 'medium', reasons: ['unallocated_remainder'] },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: money('8286', ILS),
      unallocatedExpensePreview: {
        count: 2,
        amount: money('8286', ILS),
        samples: [
          {
            id: 'exp-2',
            expenseDate: '2026-08-27',
            description: null,
            supplierName: null,
            vendorName: 'דלק',
            netAmount: '8286',
            currency: ILS,
          },
        ],
      },
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    })[0]!;

    const t = (key: string, values?: Record<string, string | number>) => {
      if (key === 'missingData.items.unallocated_remainder.action') {
        return 'הצגת ההוצאות שדורשות חלוקה';
      }
      if (key === 'missingData.unallocatedStatsLine') {
        return `${values?.count} הוצאות · ${values?.amount}`;
      }
      if (key === 'missingData.unallocatedNotMissing') {
        return 'ההוצאה קיימת בעלות העסק, אבל עדיין לא חולקה לפרויקטים.';
      }
      if (key === 'missingData.items.unallocated_remainder.title') {
        return 'הוצאות כלליות שעדיין לא חולקו לפרויקטים';
      }
      if (key === 'missingData.items.unallocated_remainder.description') {
        return 'יש הוצאות כלליות שעדיין לא חולקו לפרויקטים.';
      }
      if (key === 'missingData.items.unallocated_remainder.why') {
        return 'ההוצאות כבר נספרות בעלות של העסק, אבל הן עדיין לא משויכות לפרויקטים. לכן רווחיות הפרויקטים יכולה להיות חלקית.';
      }
      return key;
    };

    const [view] = mapDashboardMissingDataToView([item], t, { locale: 'he-IL' });
    expect(view).toBeDefined();

    expect(view!.actionHref).toBe('/expenses?unallocated=true');
    expect(view!.actionLabel).toBe('הצגת ההוצאות שדורשות חלוקה');
    expect(view!.statsLine).toContain('2 הוצאות');
    expect(view!.expenseRows?.[0]?.href).toBe(
      '/expenses/exp-2?focus=allocation&returnTo=%2Fexpenses%3Funallocated%3Dtrue',
    );
    expect(view!.expenseRows?.[0]?.label).toContain('דלק');
    expect(view!.clarification).toContain('ההוצאה קיימת בעלות העסק');
    expect(view!.title).not.toContain('עלויות עסק שלא הוקצו');
  });

  it('formats remaining expenses line with ICU count', () => {
    const item = buildDashboardMissingDataItems({
      dataConfidence: { level: 'medium', reasons: ['unallocated_remainder'] },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: money('20000', ILS),
      unallocatedExpensePreview: {
        count: 6,
        amount: money('20000', ILS),
        samples: Array.from({ length: 5 }, (_, index) => ({
          id: `exp-${index}`,
          expenseDate: '2026-08-27',
          description: null,
          supplierName: 'דלק',
          vendorName: null,
          netAmount: '1000',
          currency: ILS,
        })),
      },
      openPriceProjectCount: 0,
      pricedProjectCount: 1,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    })[0]!;

    const t = (key: string, values?: Record<string, string | number>) => {
      if (key === 'missingData.remainingExpensesLabel') {
        return `ועוד ${values?.count} הוצאות`;
      }
      if (key.startsWith('missingData.items.unallocated_remainder.')) {
        return key;
      }
      if (key === 'missingData.unallocatedNotMissing') return '';
      return key;
    };

    const [view] = mapDashboardMissingDataToView([item], t, { locale: 'he-IL' });
    expect(view).toBeDefined();
    expect(view!.remainingExpensesMore).toBe('ועוד 1 הוצאות');
  });
});
