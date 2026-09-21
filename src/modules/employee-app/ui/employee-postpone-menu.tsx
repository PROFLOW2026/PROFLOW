'use client';

import { useRouter } from 'next/navigation';
import { employeePostponeTaskAction } from '@/app/[locale]/employee/(shell)/tasks/actions';
import { PostponeMenu } from '@/modules/tasks/ui/postpone-menu';
import { employeeSecondaryButtonClass } from './employee-surface-styles';
import { cn } from '@/shared/ui/cn';

interface EmployeePostponeMenuProps {
  readonly taskId: string;
  readonly dueDate: string | null;
  readonly today: string;
  readonly compact?: boolean;
}

export function EmployeePostponeMenu({ taskId, dueDate, today, compact }: EmployeePostponeMenuProps) {
  const router = useRouter();

  return (
    <PostponeMenu
      dueDate={dueDate}
      today={today}
      compact={compact}
      triggerClassName={cn(compact ? undefined : employeeSecondaryButtonClass)}
      onApply={async (nextDueDate) => {
        const result = await employeePostponeTaskAction(taskId, nextDueDate);
        if (!result.error) {
          router.refresh();
        }
      }}
    />
  );
}
