import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async (opts: string | { locale?: string; namespace?: string }) => {
    const ns = typeof opts === 'string' ? opts : (opts.namespace ?? '');
    const messages: Record<string, Record<string, string>> = {
      'financial.overview': {
        pageTitle: 'סקירה עסקית',
        printPeriod: 'תקופת הדוח: {from} – {to}',
        pageHint: 'hint',
        costsTitle: 'עלויות',
        revenueTitle: 'הכנסות',
        cashOutTitle: 'יציאות',
        recognizedActual: 'עלות מוכרת',
        recognizedActualHint: 'r',
        cashPaid: 'שולם',
        cashPaidHint: 'c',
        openPayables: 'ap',
        openPayablesHint: 'a',
        commitments: 'commit',
        commitmentsHint: 'm',
        upcomingDue: 'due',
        upcomingDueHint: 'd',
        billed: 'billed',
        billedHint: 'b',
        collected: 'collected',
        collectedHint: 'c',
        openReceivables: 'ar',
        openReceivablesHint: 'a',
        overdueAr: 'od',
        overdueArHint: 'o',
        upcomingCashOut: 'uco',
        upcomingCashOutHint: 'u',
      },
      'financial.overview.detailedReport': {
        pageTitle: 'סקירה עסקית — דוח מפורט',
        scopeHint: 'scope',
        snapshotNotice: 'snap',
        upcomingWindowNotice: 'win',
        executiveTitle: 'exec',
        recognizedSummaryTitle: 'rs',
        recognizedLinesTitle: 'rl',
        cashSummaryTitle: 'cs',
        cashLinesTitle: 'cl',
        rollupByPartyTitle: 'rp',
        rollupByProjectTitle: 'rpr',
        rollupBySourceTitle: 'rsr',
        rollupByMonthTitle: 'rm',
        rollupCashByPartyTitle: 'rcp',
        rollupCashBySourceTitle: 'rcs',
        rollupGroup: 'g',
        rollupCount: 'n',
        rollupMonth: 'm',
        rollupUnassigned: 'u',
        billingInPeriodTitle: 'bi',
        collectionsInPeriodTitle: 'ci',
        openReceivablesTitle: 'or',
        openApTitle: 'oa',
        commitmentsByProjectTitle: 'cp',
        upcomingApTitle: 'ua',
        expectedCashTitle: 'ec',
        billingIssueDate: 'id',
        billingDueDate: 'dd',
        billingClient: 'cl',
        billingProject: 'pr',
        billingReference: 'ref',
        billingNet: 'net',
        billingVat: 'vat',
        billingGross: 'gr',
        collectionDate: 'cd',
        collectionClient: 'cc',
        collectionProject: 'cp',
        collectionMethod: 'cm',
        collectionAmount: 'ca',
        openArOutstanding: 'oo',
        apVendor: 'v',
        apReference: 'r',
        apDueDate: 'd',
        apOutstanding: 'o',
        projectName: 'p',
        commitmentOpen: 'co',
        expectedDueDate: 'ed',
        expectedParty: 'ep',
        expectedRemaining: 'er',
        expectedStatus: 'es',
      },
      'financial.overview.recognizedBreakdown': {
        parityWarning: 'parity',
        columnNet: 'net',
        columnVat: 'vat',
        columnGross: 'gross',
        columnRecognitionDate: 'date',
        columnSource: 'src',
        columnParty: 'party',
        columnDescription: 'desc',
        columnAllocation: 'alloc',
        'source.expense': 'expense',
        emcDescription: '{month}',
        installmentDescription: '{text}',
        fallbackExpense: 'exp',
        'allocation.project': '{name}',
        'allocation.overhead': 'oh',
        'allocation.apCompany': 'ap',
        'allocation.employerCost': 'em',
        'allocation.unassigned': 'un',
        'allocation.costFamily': '{family}',
      },
      'financial.overview.cashPaidBreakdown': {
        columnNet: 'net',
        columnVat: 'vat',
        columnGross: 'gross',
        columnPaymentDate: 'pd',
        columnSource: 'src',
        columnParty: 'party',
        columnDocument: 'doc',
        'source.payroll': 'payroll',
        'source.expense': 'expense',
        'source.ap': 'ap',
        'source.subcontract_advance': 'sub',
      },
    };
    const bag = messages[ns] ?? {};
    return (key: string, values?: Record<string, string | number>) => {
      let out = bag[key] ?? key;
      if (values) {
        for (const [k, v] of Object.entries(values)) {
          out = out.replace(`{${k}}`, String(v));
        }
      }
      return out;
    };
  },
}));

import { buildFinancialOverviewPrintPayload } from '@/modules/financials/application/build-financial-print-reports';
import { buildFinancialOverviewDetailedPrintPayload } from '@/modules/financials/application/build-financial-overview-detailed-print-payload';
import type { FinancialsOverviewData } from '@/modules/financials/application/get-financials-overview';
import type { FinancialOverviewDetailedReportData } from '@/modules/financials/application/load-financial-overview-detailed-report-data';
import { businessDate } from '@/shared/dates';
import { money, zeroMoney } from '@/shared/money';

const currency = 'ILS';
const period = { fromDate: businessDate('2026-10-01'), toDate: businessDate('2026-10-31') };

function overviewStub(): FinancialsOverviewData {
  const z = zeroMoney(currency);
  const kpi = (value: typeof z) => ({ value, href: '/' });
  return {
    currency,
    today: businessDate('2026-10-31'),
    period,
    canReadCosts: true,
    canReadAp: true,
    canReadBilling: true,
    costs: {
      recognizedActual: kpi(money('1000', currency)),
      cashPaid: kpi(money('800', currency)),
      openPayables: kpi(money('200', currency)),
      commitments: kpi(money('300', currency)),
      upcomingDue: kpi(money('50', currency)),
    },
    revenue: {
      billed: kpi(money('5000', currency)),
      collected: kpi(money('4000', currency)),
      openReceivables: kpi(money('1000', currency)),
      overdueAr: kpi(z),
    },
    upcomingCashOut: kpi(money('150', currency)),
  };
}

describe('financial overview detailed report', () => {
  it('keeps short report title and section shape unchanged', async () => {
    const overview = overviewStub();
    const short = await buildFinancialOverviewPrintPayload('he-IL', 'Test Org', overview);
    expect(short.title).toBe('סקירה עסקית');
    expect(short.sections.map((s) => s.id)).toEqual(['costs', 'revenue', 'cash-out']);
  });

  it('includes every recognized and cash line in detailed payload tables', async () => {
    const overview = overviewStub();
    const net = money('100', currency);
    const detailed: FinancialOverviewDetailedReportData = {
      period,
      today: overview.today,
      recognized: {
        currency,
        period,
        lines: [
          {
            id: '1',
            sourceKind: 'expense',
            recognitionDate: period.fromDate,
            yearMonth: '2026-10',
            description: 'Line A',
            party: 'Vendor',
            projectName: 'P1',
            costFamily: null,
            installmentCount: 1,
            net,
            gross: net,
            vat: zeroMoney(currency),
            href: '/',
          },
          {
            id: '2',
            sourceKind: 'expense',
            recognitionDate: period.toDate,
            yearMonth: '2026-10',
            description: 'Line B',
            party: 'Vendor',
            projectName: null,
            costFamily: null,
            installmentCount: 1,
            net,
            gross: net,
            vat: zeroMoney(currency),
            href: '/',
          },
        ],
        totalNet: money('200', currency),
        totalGross: money('200', currency),
        totalVat: zeroMoney(currency),
        kpiNet: money('200', currency),
      },
      cashPaid: {
        currency,
        period,
        flow: {
          collectionsActual: zeroMoney(currency),
          paidActual: money('800', currency),
          expectedOutgoing: zeroMoney(currency),
          netCash: zeroMoney(currency),
          forecastAfterRemaining: zeroMoney(currency),
          paidLines: [
            {
              id: 'c1',
              source: 'expense',
              party: 'Vendor',
              document: 'DOC',
              paymentDate: period.fromDate,
              amount: money('800', currency),
              reference: null,
            },
          ],
          expectedLines: [],
          display: {
            collections: { net: zeroMoney(currency), vat: zeroMoney(currency), gross: zeroMoney(currency) },
            paid: {
              net: money('800', currency),
              vat: zeroMoney(currency),
              gross: money('800', currency),
            },
            expected: { net: zeroMoney(currency), vat: zeroMoney(currency), gross: zeroMoney(currency) },
            netCash: { net: zeroMoney(currency), vat: zeroMoney(currency), gross: zeroMoney(currency) },
            forecast: { net: zeroMoney(currency), vat: zeroMoney(currency), gross: zeroMoney(currency) },
          },
        },
        paidLines: [
          {
            id: 'c1',
            source: 'expense',
            party: 'Vendor',
            document: 'DOC',
            paymentDate: period.fromDate,
            amount: money('800', currency),
            reference: null,
          },
        ],
        kpiPaid: money('800', currency),
      },
      billingInPeriod: [],
      collectionsInPeriod: [],
      billingSnapshot: [],
      receivablesSnapshot: null,
      apPayables: null,
      projectRollup: null,
    };

    const payload = await buildFinancialOverviewDetailedPrintPayload(
      'he-IL',
      'Test Org',
      overview,
      detailed,
    );

    expect(payload.title).toContain('מפורט');
    const recognizedTable = payload.sections.find((s) => s.id === 'recognized-lines')?.tables?.[0];
    expect(recognizedTable?.rows).toHaveLength(2);
    const cashTable = payload.sections.find((s) => s.id === 'cash-lines')?.tables?.[0];
    expect(cashTable?.rows).toHaveLength(1);
    const executive = payload.sections.find((s) => s.id === 'executive');
    expect(executive?.rows?.length).toBeGreaterThan(5);
  });
});
