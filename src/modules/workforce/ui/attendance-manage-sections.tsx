'use client';

import type { manualAttendanceAction } from '@/app/[locale]/(app)/workforce/attendance/actions';
import type { attendanceOutcomeAction } from '@/app/[locale]/(app)/workforce/attendance/outcome-actions';
import { AttendanceEmployeeContext } from '@/modules/workforce/ui/attendance-employee-context';
import { AttendanceManualEntryForm } from '@/modules/workforce/ui/attendance-manual-entry-form';
import { AttendanceOutcomeForm } from '@/modules/workforce/ui/attendance-outcome-form';
import type { AttendanceEmployeeOption } from '@/modules/workforce/domain/attendance-canonical-employee';

interface ProjectOption {
  readonly id: string;
  readonly name: string;
}

export function AttendanceManageSections({
  employees,
  canonicalEmployeeId,
  searchParams,
  defaultDate,
  focusUpdate,
  defaultWeekdays,
  manualAction,
  outcomeAction,
  projects,
}: {
  readonly employees: readonly AttendanceEmployeeOption[];
  readonly canonicalEmployeeId: string | null;
  readonly searchParams: string;
  readonly defaultDate: string;
  readonly focusUpdate: boolean;
  readonly defaultWeekdays: readonly number[];
  readonly manualAction: typeof manualAttendanceAction;
  readonly outcomeAction: typeof attendanceOutcomeAction;
  readonly projects: readonly ProjectOption[];
}) {
  const fallbackEmployeeId = canonicalEmployeeId ?? employees[0]?.id ?? null;

  return (
    <>
      {fallbackEmployeeId ? (
        <AttendanceEmployeeContext
          canonicalEmployeeId={fallbackEmployeeId}
          searchParams={searchParams}
        >
          {({ employeeId, onEmployeeChange }) => (
            <>
              <AttendanceOutcomeForm
                key={`outcome-${employeeId}-${defaultDate}`}
                action={outcomeAction}
                employees={employees}
                defaultDate={defaultDate}
                defaultEmployeeId={employeeId}
                onEmployeeChange={onEmployeeChange}
              />
              <AttendanceManualEntryForm
                key={`manual-${employeeId}-${defaultDate}`}
                action={manualAction}
                employees={employees}
                projects={projects}
                defaultDate={defaultDate}
                defaultEmployeeId={employeeId}
                onEmployeeChange={onEmployeeChange}
                emphasize={focusUpdate}
                defaultWeekdays={defaultWeekdays}
              />
            </>
          )}
        </AttendanceEmployeeContext>
      ) : null}
    </>
  );
}
