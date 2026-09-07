'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  attendanceEmployeeSearchHref,
  type AttendanceEmployeeOption,
} from '@/modules/workforce/domain/attendance-canonical-employee';

export function AttendanceEmployeeSelectorBar({
  employees,
  canonicalEmployeeId,
  searchParams,
}: {
  readonly employees: readonly AttendanceEmployeeOption[];
  readonly canonicalEmployeeId: string | null;
  readonly searchParams: string;
}) {
  const t = useTranslations('workforce.attendance');
  const router = useRouter();
  const pathname = usePathname();

  if (employees.length === 0) return null;

  const value = canonicalEmployeeId ?? employees[0]!.id;

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <label htmlFor="attendance-employee-context" className="text-sm font-medium">
        {t('manual.employee')}
      </label>
      <Select
        value={value}
        onValueChange={(employeeId) => {
          const current = new URLSearchParams(searchParams);
          router.replace(attendanceEmployeeSearchHref(pathname, current, employeeId), {
            scroll: false,
          });
        }}
      >
        <SelectTrigger id="attendance-employee-context" className="min-w-[14rem]">
          <SelectValue placeholder={t('manual.employeePlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {employees.map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              {employee.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
