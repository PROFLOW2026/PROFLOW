import 'server-only';

import type { BusinessDate } from '@/shared/dates';
import {
  calendarMonthGridBounds,
  resolveCalendarMonthDueWindow,
} from '../domain/calendar-month-window';
import type { TaskListFilters } from '../domain/types';
import { parseWorkTaskListFilters } from '../domain/work-task-search-params';

export interface WorkLensCalendarQuery {
  readonly monthKey: string;
  readonly anchorFrom: BusinessDate;
  readonly anchorTo: BusinessDate;
  readonly listFilters: TaskListFilters;
}

/** Server-side filters for /work/calendar — visible grid month + URL lens filters. */
export function resolveWorkLensCalendarQuery(
  urlParams: Record<string, string | string[] | undefined>,
  today: BusinessDate,
): WorkLensCalendarQuery {
  const monthWindow = resolveCalendarMonthDueWindow(urlParams, today);
  const { gridFrom, gridTo } = calendarMonthGridBounds(monthWindow.dueFrom, monthWindow.dueTo);
  const base = parseWorkTaskListFilters(urlParams);

  return {
    monthKey: monthWindow.monthKey,
    anchorFrom: gridFrom,
    anchorTo: gridTo,
    listFilters: {
      ...base,
      anchorFrom: gridFrom,
      anchorTo: gridTo,
    },
  };
}
