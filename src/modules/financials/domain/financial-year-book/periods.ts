import { businessDate, endOfMonth, todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { yearMonthFromParts } from '@/shared/dates/year-month';

export type YearBookMonthPhase = 'complete' | 'partial' | 'future';

export interface YearBookMonthPeriod {
  readonly yearMonth: string;
  readonly month: number;
  readonly sheetTitle: string;
  readonly from: BusinessDate;
  readonly to: BusinessDate;
  readonly phase: YearBookMonthPhase;
}

const HEBREW_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
] as const;

export function hebrewMonthLabel(month: number): string {
  return HEBREW_MONTHS[month - 1] ?? String(month);
}

export function monthSheetName(month: number): string {
  return `${String(month).padStart(2, '0')} ${hebrewMonthLabel(month)}`;
}

export function resolveYearBookMonths(
  year: number,
  timezone: string,
): readonly YearBookMonthPeriod[] {
  const today = todayInTimeZone(timezone);
  const todayYm = today.slice(0, 7);

  const out: YearBookMonthPeriod[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const yearMonth = yearMonthFromParts(year, month);
    const from = businessDate(`${yearMonth}-01`);
    const monthEnd = endOfMonth(from);
    let phase: YearBookMonthPhase = 'complete';
    let to: BusinessDate = monthEnd;
    if (yearMonth > todayYm) {
      phase = 'future';
    } else if (yearMonth === todayYm) {
      phase = 'partial';
      to = today;
    }
    out.push({
      yearMonth,
      month,
      sheetTitle: monthSheetName(month),
      from,
      to,
      phase,
    });
  }
  return out;
}

export function isDateInInclusiveRange(
  value: BusinessDate,
  from: BusinessDate,
  to: BusinessDate,
): boolean {
  return value >= from && value <= to;
}
