import Decimal from 'decimal.js';
import type { TimeEntryListItem } from './types';

export interface TimeEntryDateGroup {
  readonly workDate: string;
  readonly entries: readonly TimeEntryListItem[];
  readonly dayTotalHours: string;
}

/** Groups a date-sorted list by workDate (desc order preserved). */
export function groupTimeEntriesByDate(
  entries: readonly TimeEntryListItem[],
): readonly TimeEntryDateGroup[] {
  const groups: TimeEntryDateGroup[] = [];
  let currentDate: string | null = null;
  let bucket: TimeEntryListItem[] = [];

  for (const entry of entries) {
    if (entry.workDate !== currentDate) {
      if (bucket.length > 0 && currentDate) {
        groups.push(buildDateGroup(currentDate, bucket));
      }
      currentDate = entry.workDate;
      bucket = [entry];
    } else {
      bucket.push(entry);
    }
  }

  if (bucket.length > 0 && currentDate) {
    groups.push(buildDateGroup(currentDate, bucket));
  }

  return groups;
}

function buildDateGroup(workDate: string, entries: TimeEntryListItem[]): TimeEntryDateGroup {
  const total = entries.reduce(
    (sum, entry) => sum.plus(entry.hours || '0'),
    new Decimal(0),
  );
  return {
    workDate,
    entries,
    dayTotalHours: total.toString(),
  };
}

export function dailySummaryKey(employeeId: string, workDate: string): string {
  return `${employeeId}:${workDate}`;
}
