import { toStoredCalendarDate } from './aggregate';

export type PlanningLinkedTaskSnapshot = {
  readonly taskId: string | null;
  readonly linkedTaskDueDate: string | Date | null;
  readonly linkedTaskStatus: string | null;
};

/** True when the linked UWM task is shown on the org calendar and the planning row should be hidden (C1). */
export function planningSuppressedByLinkedTask(
  row: PlanningLinkedTaskSnapshot,
  range: { readonly from: string; readonly to: string },
): boolean {
  if (!row.taskId || !row.linkedTaskDueDate) return false;
  if (row.linkedTaskStatus === 'done' || row.linkedTaskStatus === 'cancelled') return false;
  const due = toStoredCalendarDate(row.linkedTaskDueDate);
  if (!due || due < range.from || due > range.to) return false;
  return true;
}
