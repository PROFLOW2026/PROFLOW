'use client';

import { useSoftRouter } from '@/shared/i18n/soft-navigation';

export function AttendanceMonthlyGridFilter({
  yearMonth,
  employees,
  selectedEmployeeId,
  missingOnly,
  labels,
}: {
  readonly yearMonth: string;
  readonly employees: readonly { id: string; name: string }[];
  readonly selectedEmployeeId: string | null;
  readonly missingOnly: boolean;
  readonly labels: {
    readonly employee: string;
    readonly allEmployees: string;
    readonly missingOnly: string;
    readonly apply: string;
  };
}) {
  const router = useSoftRouter();

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams();
        params.set('month', yearMonth);
        const employeeId = String(data.get('employeeId') ?? '').trim();
        if (employeeId) params.set('employeeId', employeeId);
        if (data.get('missingOnly') === '1') params.set('missingOnly', '1');
        router.replace(`/workforce/attendance/monthly?${params.toString()}`);
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[12rem] flex-col gap-1 text-sm">
          <span>{labels.employee}</span>
          <select
            name="employeeId"
            defaultValue={selectedEmployeeId ?? ''}
            className="h-11 rounded-md border border-[var(--pf-border-default)] bg-transparent px-3"
          >
            <option value="">{labels.allEmployees}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="missingOnly" value="1" defaultChecked={missingOnly} />
          <span>{labels.missingOnly}</span>
        </label>
        <button
          type="submit"
          className="h-11 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
        >
          {labels.apply}
        </button>
      </div>
    </form>
  );
}
