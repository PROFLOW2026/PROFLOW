import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import {
  EMPLOYEE_ATTENDANCE_ALIAS_PATH,
  EMPLOYEE_ATTENDANCE_CANONICAL_PATH,
  revalidateEmployeeAttendancePaths,
} from '@/modules/employee-app/application/revalidate-employee-attendance-paths';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

describe('revalidateEmployeeAttendancePaths (UI-003)', () => {
  it('revalidates canonical /employee/time and the /employee/attendance alias', () => {
    revalidateEmployeeAttendancePaths();

    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith(EMPLOYEE_ATTENDANCE_CANONICAL_PATH);
    expect(revalidatePath).toHaveBeenCalledWith(EMPLOYEE_ATTENDANCE_ALIAS_PATH);
  });

  it('correction action uses the shared attendance revalidation helper', () => {
    const source = readFileSync(
      'src/app/[locale]/employee/(shell)/attendance/correction-actions.ts',
      'utf8',
    );
    expect(source).toContain('revalidateEmployeeAttendancePaths');
    expect(source).not.toContain("revalidatePath('/employee/attendance')");
  });
});
