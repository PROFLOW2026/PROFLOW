import {
  addDays,
  addMonths,
  businessDate,
  compareBusinessDates,
  type BusinessDate,
} from '@/shared/dates';
import { ValidationError } from '@/shared/errors';

export const POSTPONEMENT_OPTIONS = ['day', 'week', 'month', 'custom'] as const;
export type PostponementOption = (typeof POSTPONEMENT_OPTIONS)[number];

export function isPostponementOption(value: string): value is PostponementOption {
  return (POSTPONEMENT_OPTIONS as readonly string[]).includes(value);
}

/**
 * Base date for predefined postponement options:
 * current due date when today or future; otherwise today.
 */
export function resolvePostponementBaseDate(
  currentDueDate: string | null,
  today: BusinessDate,
): BusinessDate {
  if (currentDueDate) {
    const due = businessDate(currentDueDate);
    if (compareBusinessDates(due, today) >= 0) {
      return due;
    }
  }
  return today;
}

export function computePostponedDueDate(
  option: PostponementOption,
  currentDueDate: string | null,
  today: BusinessDate,
  customDate?: string | null,
): BusinessDate {
  if (option === 'custom') {
    if (!customDate?.trim()) {
      throw new ValidationError([{ path: 'customDate', message: 'Custom date is required' }]);
    }
    const parsed = businessDate(customDate.trim());
    if (compareBusinessDates(parsed, today) <= 0) {
      throw new ValidationError([
        { path: 'customDate', message: 'Custom date must be in the future' },
      ]);
    }
    return parsed;
  }

  const base = resolvePostponementBaseDate(currentDueDate, today);
  switch (option) {
    case 'day':
      return addDays(base, 1);
    case 'week':
      return addDays(base, 7);
    case 'month':
      return addMonths(base, 1);
    default:
      throw new ValidationError([{ path: 'option', message: 'Invalid postponement option' }]);
  }
}
