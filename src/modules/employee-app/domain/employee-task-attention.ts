const CLOSED_STATUSES = new Set(['done', 'cancelled']);

export type EmployeeTaskAttentionKind = 'overdue' | 'dueToday' | 'reminder';

export interface EmployeeTaskAttentionInput {
  readonly id: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly status: string;
  readonly projectLabel?: string | null;
}

export interface EmployeeTaskAttentionItem {
  readonly taskId: string;
  readonly title: string;
  readonly dueDate: string | null;
  readonly projectLabel: string | null;
  readonly kind: EmployeeTaskAttentionKind;
  readonly href: string;
}

const KIND_ORDER: Record<EmployeeTaskAttentionKind, number> = {
  overdue: 0,
  dueToday: 1,
  reminder: 2,
};

/**
 * Short employee list: overdue, due today, and fired reminders.
 * Links stay on `/employee/tasks/[id]`. A task already overdue or due today
 * is not repeated as a reminder.
 */
export function buildEmployeeTaskAttentionItems(input: {
  readonly tasks: readonly EmployeeTaskAttentionInput[];
  readonly reminderTaskIds: ReadonlySet<string>;
  readonly today: string;
  readonly limit?: number;
}): EmployeeTaskAttentionItem[] {
  const limit = input.limit ?? 6;
  const items: EmployeeTaskAttentionItem[] = [];

  for (const task of input.tasks) {
    if (CLOSED_STATUSES.has(task.status)) continue;
    let kind: EmployeeTaskAttentionKind | null = null;
    if (task.dueDate && task.dueDate < input.today) kind = 'overdue';
    else if (task.dueDate === input.today) kind = 'dueToday';
    else if (input.reminderTaskIds.has(task.id)) kind = 'reminder';
    if (!kind) continue;
    items.push({
      taskId: task.id,
      title: task.title,
      dueDate: task.dueDate,
      projectLabel: task.projectLabel ?? null,
      kind,
      href: `/employee/tasks/${task.id}`,
    });
  }

  items.sort((a, b) => {
    const rank = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (rank !== 0) return rank;
    return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  });

  return items.slice(0, limit);
}
