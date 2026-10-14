import { ValidationError } from '@/shared/errors';

export function assertStartBeforeDue(
  startDate: string | null | undefined,
  dueDate: string | null | undefined,
): void {
  if (!startDate || !dueDate) return;
  if (startDate > dueDate) {
    throw new ValidationError([
      {
        path: 'startDate',
        message: 'Start date must be on or before the due date',
      },
    ]);
  }
}
