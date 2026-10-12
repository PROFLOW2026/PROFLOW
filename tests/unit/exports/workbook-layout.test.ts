import { describe, expect, it } from 'vitest';
import {
  MONEY_NUM_FMT,
  roundMoney2,
  writeMoneyCell,
} from '@/modules/exports/application/financial-year-book/workbook-layout';
import ExcelJS from 'exceljs';

describe('workbook-layout', () => {
  it('rounds money to 2 decimal places', () => {
    expect(roundMoney2(123.456)).toBe(123.46);
    expect(roundMoney2(123.4)).toBe(123.4);
  });

  it('applies consistent money numFmt on cells', () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('t');
    writeMoneyCell(sheet.getCell(1, 1), 94685.75);
    expect(sheet.getCell(1, 1).numFmt).toBe(MONEY_NUM_FMT);
    expect(sheet.getCell(1, 1).value).toBe(94685.75);
  });
});
