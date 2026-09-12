import { describe, expect, it } from 'vitest';
import { employeeRequiresAttendanceReporting } from '@/modules/workforce/domain/attendance-requirement';

describe('employeeRequiresAttendanceReporting', () => {
  it('exempts owner_manager from required attendance (CASE 1/2)', () => {
    expect(employeeRequiresAttendanceReporting({ compensationClass: 'owner_manager' })).toBe(false);
  });

  it('requires attendance for standard employees (CASE 4)', () => {
    expect(employeeRequiresAttendanceReporting({ compensationClass: 'standard' })).toBe(true);
    expect(employeeRequiresAttendanceReporting({ compensationClass: undefined })).toBe(true);
    expect(employeeRequiresAttendanceReporting({ compensationClass: null })).toBe(true);
  });
});
