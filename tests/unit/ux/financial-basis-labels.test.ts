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

    expect(invoiced).toMatch(/חיוב/);
    expect(billed).toMatch(/חיוב/);
    expect(invoiced).not.toBe(profit);
    expect(billed).not.toBe(actualMargin);
    expect(billedHint).toMatch(/הסכום שכבר חויב ללקוח/);
    expect(profit).toMatch(/רווח/);
    expect(actualMargin).toMatch(/רווח/);
    expect(actualMarginHint).toMatch(/הרווח המשוער/);
    expect(actualCost).toMatch(/עלות/);
    expect(outstanding).toMatch(/יתרה פתוחה/);
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

    expect(invoiced.toLowerCase()).toMatch(/bill/);
    expect(billed.toLowerCase()).toMatch(/bill/);
    expect(invoiced).not.toBe(profit);
    expect(billed).not.toBe(actualMargin);
    expect(billedHint.toLowerCase()).toMatch(/already billed|billed to the client/);
    expect(profit.toLowerCase()).toMatch(/profit/);
    expect(actualMargin.toLowerCase()).toMatch(/profit/);
    expect(actualMarginHint.toLowerCase()).toMatch(/estimated profit|data entered/);
    expect(actualCost.toLowerCase()).toMatch(/cost/);
    expect(outstanding.toLowerCase()).toMatch(/outstanding|open/);
    expect(dashboard.get('businessSummary.invoicedThisMonth')?.toLowerCase()).toMatch(/invoice/);
    expect(dashboard.get('reports.columns.profit')?.toLowerCase()).toMatch(/net/);
    expect(dashboard.get('reports.columns.invoiced')).not.toBe(
      dashboard.get('reports.columns.profit'),
    );
  });
});
