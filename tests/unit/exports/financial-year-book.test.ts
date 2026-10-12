import { describe, expect, it } from 'vitest';
import {
  assertWorkbookHasNoUuids,
  buildFinancialYearBookWorkbook,
} from '@/modules/exports/application/financial-year-book/build-workbook';
import { MONEY_NUM_FMT } from '@/modules/exports/application/financial-year-book/workbook-layout';
import { workbookSheetViews } from '@/modules/exports/domain/xlsx';
import ExcelJS from 'exceljs';
import { sanitizeBusinessText } from '@/modules/financials/domain/financial-year-book/format';
import {
  monthSheetName,
  resolveYearBookMonths,
} from '@/modules/financials/domain/financial-year-book/periods';
import type { FinancialYearBookData } from '@/modules/financials/domain/financial-year-book/types';
import { businessDate } from '@/shared/dates';
import { money, zeroMoney } from '@/shared/money';

function emptyMonth(yearMonth: string, month: number, phase: 'complete' | 'partial' | 'future') {
  const currency = 'ILS';
  return {
    period: {
      yearMonth,
      month,
      sheetTitle: monthSheetName(month),
      from: businessDate(`${yearMonth}-01`),
      to: businessDate(phase === 'partial' ? `${yearMonth}-15` : `${yearMonth}-28`),
      phase,
    },
    payments: [],
    receipts: [],
    recognizedCosts: [],
    employerCosts: [],
    payrollCash: [],
    overhead: [],
    billings: [],
    commitments: [],
    summary: {
      netInvoiced: zeroMoney(currency),
      grossCollected: zeroMoney(currency),
      recognizedCostNet: zeroMoney(currency),
      recognizedCostVat: zeroMoney(currency),
      cashPaidGross: zeroMoney(currency),
      employerCostNet: null,
      expectedCommitmentsGross: zeroMoney(currency),
      netCashActual: zeroMoney(currency),
      operationalProfitNet: zeroMoney(currency),
    },
    cashFlow: null,
  };
}

function sampleBook(): FinancialYearBookData {
  const currency = 'ILS';
  return {
    year: 2026,
    organizationName: 'דוגמה בע״מ',
    currency,
    generatedAt: '2026-10-12',
    canReadBilling: true,
    overview: [
      {
        monthLabel: 'ינואר',
        recognizedNet: 100,
        cashPaidGross: 118,
        employerNet: 50,
        netInvoiced: 200,
        grossCollected: 236,
        paymentCount: 1,
        receiptCount: 1,
      },
    ],
    months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const ym = `2026-${String(month).padStart(2, '0')}`;
      const phase = month === 12 ? 'future' : month === 10 ? 'partial' : 'complete';
      return emptyMonth(ym, month, phase);
    }) as FinancialYearBookData['months'],
  };
}

describe('financial year book helpers', () => {
  it('strips uuid from business text', () => {
    const raw = 'ספק 0ccf325e-b66a-4a35-97a7-3961a21c3f1f';
    expect(sanitizeBusinessText(raw)).toBe('ספק');
  });

  it('always resolves 12 Hebrew month sheets', () => {
    const months = resolveYearBookMonths(2026, 'Asia/Jerusalem');
    expect(months).toHaveLength(12);
    expect(months[0]?.sheetTitle).toBe('01 ינואר');
    expect(months[11]?.sheetTitle).toBe('12 דצמבר');
  });

  it('builds RTL multi-sheet workbook without uuid leakage', async () => {
    const base = sampleBook();
    const jan = base.months[0]!;
    const data: FinancialYearBookData = {
      ...base,
      months: base.months.map((month, index) =>
        index === 0
          ? {
              ...jan,
              payments: [
                ...jan.payments,
                {
                  date: '2026-01-10',
                  party: 'ספק',
                  description: 'חומרים',
                  project: 'פרויקט א',
                  net: money('100', 'ILS'),
                  vat: money('18', 'ILS'),
                  gross: money('118', 'ILS'),
                  nature: 'actual',
                },
              ],
            }
          : month,
      ),
    };
    const buffer = await buildFinancialYearBookWorkbook(data);
    expect(assertWorkbookHasNoUuids(buffer)).toBe(true);
    const views = await workbookSheetViews(buffer);
    expect(views.length).toBe(14);
    expect(views.every((v) => v.rightToLeft)).toBe(true);
    expect(views.map((v) => v.name)).toContain('סקירה שנתית');
    expect(views.map((v) => v.name)).toContain('01 ינואר');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buffer) as unknown as ExcelJS.Buffer);
    const overview = wb.getWorksheet('סקירה שנתית');
    expect(overview).toBeTruthy();
    const moneyCell = overview!.getCell(5, 2);
    expect(moneyCell.numFmt).toBe(MONEY_NUM_FMT);
    expect(overview!.getColumn(2).width).toBeLessThanOrEqual(21);
    expect(overview!.getColumn(2).width).toBeGreaterThanOrEqual(17);
    expect(overview!.getCell(5, 1).value).toBe('ינואר');
  });
});
