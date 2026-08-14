import { describe, expect, it } from 'vitest';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

function catalog(locale: 'he-IL' | 'en', namespace: string) {
  return flattenLocaleCatalog(readLocaleCatalog(locale, namespace));
}

describe('financial basis labels distinguish invoice cash from net profit', () => {
  it('he-IL invoiced vs profit strings are distinct and mention VAT/net', () => {
    const financial = catalog('he-IL', 'financial');
    const dashboard = catalog('he-IL', 'dashboard');

    const invoiced = financial.get('invoiced') ?? '';
    const billed = financial.get('kpis.billed') ?? '';
    const billedHint = financial.get('kpis.billedHint') ?? '';
    const profit = financial.get('estimatedProfit') ?? '';
    const actualMargin = financial.get('kpis.actualMargin') ?? '';
    const actualMarginHint = financial.get('kpis.actualMarginHint') ?? '';
    const actualCost = financial.get('kpis.actualCost') ?? '';
    const outstanding = financial.get('kpis.outstanding') ?? '';
    const billingCash = financial.get('basis.billingCash') ?? '';
    const profitNet = financial.get('basis.profitNet') ?? '';

    expect(invoiced).toMatch(/חשבוניות/);
    expect(billed).toMatch(/חשבוניות/);
    expect(invoiced).not.toBe(profit);
    expect(billed).not.toBe(actualMargin);
    expect(billedHint).toMatch(/מע״מ/);
    expect(billedHint).toMatch(/לא הכנסה לחישוב רווח|לא הכנסה לרווח/);
    expect(profit).toMatch(/נטו/);
    expect(actualMargin).toMatch(/נטו/);
    expect(actualMarginHint).toMatch(/מע״מ/);
    expect(actualMarginHint).toMatch(/נטו/);
    expect(actualCost).toMatch(/נטו/);
    expect(outstanding).toMatch(/מזומן/);
    expect(billingCash).not.toBe(profitNet);
    expect(billingCash).toMatch(/מע״מ/);
    expect(profitNet).toMatch(/מע״מ/);
    expect(dashboard.get('businessSummary.invoicedThisMonth')).toMatch(/חשבוניות/);
    expect(dashboard.get('reports.columns.profit')).toMatch(/נטו/);
    expect(dashboard.get('reports.columns.invoiced')).not.toBe(
      dashboard.get('reports.columns.profit'),
    );
  });

  it('en invoiced vs profit strings are distinct and mention VAT/net', () => {
    const financial = catalog('en', 'financial');
    const dashboard = catalog('en', 'dashboard');

    const invoiced = financial.get('invoiced') ?? '';
    const billed = financial.get('kpis.billed') ?? '';
    const billedHint = financial.get('kpis.billedHint') ?? '';
    const profit = financial.get('estimatedProfit') ?? '';
    const actualMargin = financial.get('kpis.actualMargin') ?? '';
    const actualMarginHint = financial.get('kpis.actualMarginHint') ?? '';
    const actualCost = financial.get('kpis.actualCost') ?? '';
    const outstanding = financial.get('kpis.outstanding') ?? '';

    expect(invoiced.toLowerCase()).toMatch(/invoice/);
    expect(billed.toLowerCase()).toMatch(/invoice/);
    expect(invoiced).not.toBe(profit);
    expect(billed).not.toBe(actualMargin);
    expect(billedHint).toMatch(/VAT/i);
    expect(billedHint.toLowerCase()).toMatch(/not revenue for profit/);
    expect(profit.toLowerCase()).toMatch(/net/);
    expect(actualMargin.toLowerCase()).toMatch(/net/);
    expect(actualMarginHint).toMatch(/VAT/i);
    expect(actualCost.toLowerCase()).toMatch(/net/);
    expect(outstanding.toLowerCase()).toMatch(/collect|cash/);
    expect(dashboard.get('businessSummary.invoicedThisMonth')?.toLowerCase()).toMatch(/invoice/);
    expect(dashboard.get('reports.columns.profit')?.toLowerCase()).toMatch(/net/);
    expect(dashboard.get('reports.columns.invoiced')).not.toBe(
      dashboard.get('reports.columns.profit'),
    );
  });
});
