'use client';

import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pressableClassName } from '@/components/ui/pressable';
import { useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { useEmployeeDetailHasUnsaved } from './employee-detail-unsaved-context';

export interface EmployeeSwitcherOption {
  readonly id: string;
  readonly name: string;
}

interface EmployeeEmployeeSwitcherProps {
  readonly currentEmployeeId: string;
  readonly currentName: string;
  readonly employees: readonly EmployeeSwitcherOption[];
}

export function EmployeeEmployeeSwitcher({
  currentEmployeeId,
  currentName,
  employees,
}: EmployeeEmployeeSwitcherProps) {
  const t = useTranslations('workforce');
  const router = useRouter();
  const hasUnsaved = useEmployeeDetailHasUnsaved();

  if (employees.length <= 1) {
    return <span className="break-words">{currentName}</span>;
  }

  function navigate(nextId: string) {
    if (nextId === currentEmployeeId) return;
    if (hasUnsaved && !window.confirm(t('employees.detail.unsavedSwitchConfirm'))) {
      return;
    }
    router.push(`/workforce/employees/${nextId}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('employees.detail.switchEmployeeAria', { name: currentName })}
        className={cn(
          pressableClassName,
          'inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-transparent px-1 py-0.5 text-start',
          'hover:bg-[var(--pf-bg-muted)] active:bg-[var(--pf-action-subtle-active)]',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        )}
      >
        <span className="min-w-0 break-words text-xl font-semibold sm:text-2xl">{currentName}</span>
        <ChevronDown className="size-5 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-[min(100vw-2rem,20rem)]">
        {employees.map((employee) => (
          <DropdownMenuItem
            key={employee.id}
            className={cn(employee.id === currentEmployeeId && 'font-semibold')}
            onSelect={() => navigate(employee.id)}
          >
            <span className="min-w-0 truncate">{employee.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
