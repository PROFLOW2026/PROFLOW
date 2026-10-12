import type ExcelJS from 'exceljs';

/** ILS amounts — always 2 decimals, thousands separator, shekel suffix. */
export const MONEY_NUM_FMT = '#,##0.00" ₪"';

export const INTEGER_NUM_FMT = '0';

/** Compact column widths (Excel character units). */
export const COL_WIDTH = {
  date: 14,
  monthLabel: 14,
  money: 19,
  count: 13,
  status: 13,
  party: 20,
  description: 28,
  project: 22,
  category: 18,
  reference: 16,
  summaryLabel: 32,
} as const;

export const OVERVIEW_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.monthLabel,
  2: COL_WIDTH.money,
  3: COL_WIDTH.money,
  4: COL_WIDTH.money,
  5: COL_WIDTH.money,
  6: COL_WIDTH.money,
  7: COL_WIDTH.count,
  8: COL_WIDTH.count,
};

/** 8-column payment / receipt / commitment tables. */
export const PAYMENT_TABLE_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.date,
  2: COL_WIDTH.party,
  3: COL_WIDTH.description,
  4: COL_WIDTH.project,
  5: COL_WIDTH.money,
  6: COL_WIDTH.money,
  7: COL_WIDTH.money,
  8: COL_WIDTH.status,
};

export const RECOGNIZED_TABLE_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.date,
  2: COL_WIDTH.party,
  3: COL_WIDTH.description,
  4: COL_WIDTH.project,
  5: COL_WIDTH.category,
  6: COL_WIDTH.money,
  7: COL_WIDTH.money,
  8: COL_WIDTH.money,
};

export const EMPLOYER_TABLE_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.monthLabel,
  2: COL_WIDTH.party,
  3: COL_WIDTH.project,
  4: COL_WIDTH.money,
  5: COL_WIDTH.status,
};

export const OVERHEAD_TABLE_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.description,
  2: COL_WIDTH.money,
};

export const BILLING_TABLE_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.date,
  2: COL_WIDTH.project,
  3: COL_WIDTH.reference,
  4: COL_WIDTH.money,
  5: COL_WIDTH.money,
  6: COL_WIDTH.money,
  7: COL_WIDTH.status,
};

export const SUMMARY_TABLE_COLUMN_WIDTHS: Record<number, number> = {
  1: COL_WIDTH.summaryLabel,
  2: COL_WIDTH.money,
};

export function mergeColumnWidths(
  ...maps: ReadonlyArray<Readonly<Record<number, number>>>
): Record<number, number> {
  const merged: Record<number, number> = {};
  for (const map of maps) {
    for (const [colKey, width] of Object.entries(map)) {
      const col = Number(colKey);
      merged[col] = Math.max(merged[col] ?? 0, width);
    }
  }
  return merged;
}

/** Month sheets mix several table shapes — per-column max width, no autofit. */
export const MONTH_SHEET_COLUMN_WIDTHS = mergeColumnWidths(
  PAYMENT_TABLE_COLUMN_WIDTHS,
  RECOGNIZED_TABLE_COLUMN_WIDTHS,
  EMPLOYER_TABLE_COLUMN_WIDTHS,
  OVERHEAD_TABLE_COLUMN_WIDTHS,
  BILLING_TABLE_COLUMN_WIDTHS,
  SUMMARY_TABLE_COLUMN_WIDTHS,
);

export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function writeMoneyCell(cell: ExcelJS.Cell, value: number | null | undefined): void {
  if (value == null || !Number.isFinite(value)) {
    cell.value = '';
    return;
  }
  cell.value = roundMoney2(value);
  cell.numFmt = MONEY_NUM_FMT;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

export function writeIntegerCell(cell: ExcelJS.Cell, value: number | null | undefined): void {
  if (value == null || !Number.isFinite(value)) {
    cell.value = '';
    return;
  }
  cell.value = Math.trunc(value);
  cell.numFmt = INTEGER_NUM_FMT;
  cell.alignment = { horizontal: 'right', vertical: 'middle' };
}

export function setColumnWidths(
  sheet: ExcelJS.Worksheet,
  widthsByColumn: Readonly<Record<number, number>>,
): void {
  for (const [colKey, width] of Object.entries(widthsByColumn)) {
    sheet.getColumn(Number(colKey)).width = width;
  }
}

export function writeSectionTitle(
  sheet: ExcelJS.Worksheet,
  row: number,
  title: string,
  colSpan: number,
): void {
  if (!title.trim()) return;
  const cell = sheet.getCell(row, 1);
  cell.value = title;
  cell.font = { bold: true, size: 12 };
  cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  if (colSpan > 1) {
    sheet.mergeCells(row, 1, row, colSpan);
  }
}

export function writeTextCell(
  cell: ExcelJS.Cell,
  value: string,
  options: { wrap?: boolean } = {},
): void {
  cell.value = value;
  cell.alignment = {
    horizontal: 'right',
    vertical: 'middle',
    wrapText: options.wrap ?? false,
  };
}
