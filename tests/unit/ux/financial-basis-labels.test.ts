import { describe, expect, it } from 'vitest';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

function catalog(locale: 'he-IL' | 'en', namespace: string) {
  return flattenLocaleCatalog(readLocaleCatalog(locale, namespace));
}

describe('financial basis labels distinguish invoice cash from net profit', () => {
  it('he-IL invoiced vs profit strings are distinct without VAT ambiguity on billing KPIs', () => {
    const financial = catalog('he-IL', 'financial');
    const dashboard = catalog('he-IL', 'dashboard');

    const invoiced = financial.get('invoiced') ?? '';
    const billed = financial.get('kpis.billed') ?? '';
    const billedHint = financial.get('kpis.billedHint') ?? '';
    const paid = financial.get('kpis.paid') ?? '';
    const paidHint = financial.get('kpis.paidHint') ?? '';
    const profit = financial.get('estimatedProfit') ?? '';
    const actualMargin = financial.get('kpis.actualMargin') ?? '';
    const actualMarginHint = financial.get('kpis.actualMarginHint') ?? '';
    const actualCost = financial.get('kpis.actualCost') ?? '';
    const outstanding = financial.get('kpis.outstanding') ?? '';
    const outstandingCash = financial.get('basis.outstandingCash') ?? '';
    const billingCash = financial.get('basis.billingCash') ?? '';
    const profitNet = financial.get('basis.profitNet') ?? '';

    expect(invoiced).toMatch(/חיוב/);
    expect(billed).toMatch(/חיוב/);
    expect(invoiced).not.toBe(profit);
    expect(billed).not.toBe(actualMargin);
    expect(billedHint).toMatch(/לפני מע״מ|הכנסת הפרויקט/);
    expect(billedHint).toMatch(/מע״מ אינו חלק מהרווח/);
    expect(paid).toMatch(/סכום שהתקבל בפועל|תשלומים שהתקבלו/);
    expect(paidHint).toMatch(/מזומן שהתקבל|סכום שהתקבל בפועל/);
    expect(outstandingCash).toMatch(/יתרה לגבייה כולל מע״מ|עדיין חייב/);
    expect(profit).toMatch(/רווח/);
    expect(actualMargin).toMatch(/רווח/);
    expect(actualMarginHint).toMatch(/הרווח המשוער/);
    expect(actualCost).toMatch(/עלות/);
    expect(outstanding).toMatch(/יתרה לגבייה כולל מע״מ/);
    expect(billingCash).not.toBe(profitNet);
    expect(billingCash).not.toMatch(/מע״מ|הכנסה לרווח|חיוב מזומן/);
    expect(paidHint).not.toMatch(/הכנסה לרווח/);
    expect(profitNet).toMatch(/מע״מ/);
    expect(financial.get('basis.billingNet') ?? '').toMatch(/לפני מע״מ|הכנסת הפרויקט/);
    expect(financial.get('kpis.billedGross') ?? '').toMatch(/סה״כ לגבייה כולל מע״מ/);
    expect(financial.get('kpis.billedVat') ?? '').toMatch(/מע״מ/);
    expect(dashboard.get('businessSummary.invoicedThisMonth')).toMatch(/חשבוניות/);
    expect(dashboard.get('reports.columns.profit')).toMatch(/נטו/);
    expect(dashboard.get('reports.columns.invoiced')).not.toBe(
      dashboard.get('reports.columns.profit'),
    );
  });

  it('en invoiced vs profit strings are distinct without VAT ambiguity on billing KPIs', () => {
    const financial = catalog('en', 'financial');
    const dashboard = catalog('en', 'dashboard');

    const invoiced = financial.get('invoiced') ?? '';
    const billed = financial.get('kpis.billed') ?? '';
    const billedHint = financial.get('kpis.billedHint') ?? '';
    const paidHint = financial.get('kpis.paidHint') ?? '';
    const profit = financial.get('estimatedProfit') ?? '';
    const actualMargin = financial.get('kpis.actualMargin') ?? '';
    const actualMarginHint = financial.get('kpis.actualMarginHint') ?? '';
    const actualCost = financial.get('kpis.actualCost') ?? '';
    const outstanding = financial.get('kpis.outstanding') ?? '';
    const billingCash = financial.get('basis.billingCash') ?? '';

    expect(invoiced.toLowerCase()).toMatch(/bill/);
    expect(billed.toLowerCase()).toMatch(/bill/);
    expect(invoiced).not.toBe(profit);
    expect(billed).not.toBe(actualMargin);
    expect(billedHint.toLowerCase()).toMatch(/before vat|project revenue/);
    expect(billedHint.toLowerCase()).toMatch(/vat is not profit/);
    expect(paidHint.toLowerCase()).toMatch(/cash actually received|received from clients/);
    expect(billingCash.toLowerCase()).not.toMatch(/including vat|not revenue for profit/);
    expect(profit.toLowerCase()).toMatch(/profit/);
    expect(actualMargin.toLowerCase()).toMatch(/profit/);
    expect(actualMarginHint.toLowerCase()).toMatch(/estimated profit|data entered/);
    expect(actualCost.toLowerCase()).toMatch(/cost/);
    expect(outstanding.toLowerCase()).toMatch(/outstanding including vat/);
    expect(financial.get('basis.billingNet')?.toLowerCase()).toMatch(/before vat|project revenue/);
    expect(financial.get('kpis.billedGross')?.toLowerCase()).toMatch(/including vat/);
    expect(dashboard.get('businessSummary.invoicedThisMonth')?.toLowerCase()).toMatch(/invoice/);
    expect(dashboard.get('reports.columns.profit')?.toLowerCase()).toMatch(/net/);
    expect(dashboard.get('reports.columns.invoiced')).not.toBe(
      dashboard.get('reports.columns.profit'),
    );
  });
});
