import { isBusinessDate } from '@/shared/dates';
import type { CalendarItem, DatedCalendarSource } from './types';

/**
 * Accepts only a real YYYY-MM-DD (or a valid Date). Does not default to today,
 * createdAt, or a sibling field when the requested date is missing.
 */
export function toStoredCalendarDate(value: string | Date | null | undefined): string | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const iso = value.toISOString().slice(0, 10);
    return isBusinessDate(iso) ? iso : null;
  }
  const trimmed = String(value).trim();
  const day = /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
  if (!day || !isBusinessDate(day)) return null;
  return day;
}

export function aggregateCalendarItems(
  sources: readonly DatedCalendarSource[],
): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const source of sources) {
    const date = toStoredCalendarDate(source.date);
    if (!date) continue;
    items.push({
      id: source.id,
      source: source.source,
      kind: source.kind,
      title: source.title,
      date,
      allDay: source.allDay ?? true,
      href: source.href ?? null,
      projectId: source.projectId ?? null,
      notes: source.notes ?? null,
    });
  }
  return items.sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) return byDate;
    return left.title.localeCompare(right.title);
  });
}

export function itemsInRange(
  items: readonly CalendarItem[],
  from: string,
  to: string,
): CalendarItem[] {
  return items.filter((item) => item.date >= from && item.date <= to);
}
