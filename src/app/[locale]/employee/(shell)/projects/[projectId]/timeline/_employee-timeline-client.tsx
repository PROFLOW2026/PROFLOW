'use client';

import { useRouter } from '@/shared/i18n/navigation';
import { TaskTimelineView } from '@/modules/tasks/ui/task-timeline-view';
import type { TaskCardData } from '@/modules/tasks/ui/task-api';

export function EmployeeProjectTimelineClient({
  tasks,
  today,
}: {
  tasks: TaskCardData[];
  today: string;
}) {
  const router = useRouter();

  return (
    <TaskTimelineView
      tasks={tasks}
      today={today}
      showProject={false}
      onOpenTask={(taskId) => router.push(`/employee/tasks/${taskId}`)}
    />
  );
}
