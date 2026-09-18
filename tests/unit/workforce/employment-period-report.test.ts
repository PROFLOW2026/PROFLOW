import { describe, expect, it, vi, beforeEach } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  effectiveEmploymentBoundsInRange,
  employmentOverlapsDateRange,
  isWithinEmploymentRange,
} from '@/modules/workforce/domain/employment-active-range';
import { employeeRequiresAttendanceReporting } from '@/modules/workforce/domain/attendance-requirement';
import { buildMonthlyWorkforceReport } from '@/modules/reports/application/generate-monthly-workforce-report';
import { getReportsCopy } from '@/modules/reports/domain/copy';
import type { OrgContext } from '@/shared/auth/context';

vi.mock('server-only', () => ({}));

const gridRows = vi.hoisted(() => ({
  rows: [] as Array<{
    employeeId: string;
    employeeName: string;
    missingCount: number;
  }>,
}));

vi.mock('@/modules/workforce', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getMonthlyAttendanceGrid: vi.fn(async () => ({
      yearMonth: '2026-01',
      fromDate: businessDate('2026-01-01'),
      toDate: businessDate('2026-01-31'),
      days: [],
      rows: gridRows.rows,
    })),
    findEmployeeById: vi.fn(
      async (
        _db: unknown,
        _orgId: string,
        employeeId: string,
      ) => employeesById[employeeId] ?? null,
    ),
  };
});

vi.mock('@/modules/workforce/application/employee-period-summary', () => ({
  getEmployeePeriodSummary: vi.fn(
    async (
      _context: unknown,
      input: { employeeId: string; fromDate: string; toDate: string },
    ) => ({
    employeeId: input.employeeId,
    fromDate: input.fromDate,
    toDate: input.toDate,
    totalDays: 0,
    totalHours: 0,
    approvedTotalHours: 0,
    approvedRegularHours: null,
    approvedOvertimeHours: null,
    canSplitRegularOvertime: false,
    projectBreakdown: [],
    unallocatedDays: 0,
    unallocatedHours: 0,
    unallocatedCost: null,
    missingDays: [],
    pendingApprovalCount: 0,
    approvedCount: 0,
    currency: 'ILS',
  })),
}));

const employeesById: Record<
  string,
  {
    id: string;
    name: string;
    compensationClass: 'standard' | 'owner_manager';
    employmentBasis: string | null;
    hireDate: string | null;
    endDate: string | null;
  }
> = {};

const context = {
  organizationId: 'org-1',
  organization: { timezone: 'Asia/Jerusalem', baseCurrency: 'ILS' },
  db: {},
  permissions: new Set(['workforce.cost.read', 'attendance.manage']),
} as unknown as OrgContext;

const copy = getReportsCopy('he-IL');
const buildCtx = {
  locale: 'he-IL',
  copy,
  generatedAt: new Date('2026-09-17T00:00:00.000Z'),
  companyName: 'Test Co',
};

describe('employment period overlap', () => {
  it('A excludes employee hired after report month', () => {
    expect(
      employmentOverlapsDateRange(
        { hireDate: businessDate('2026-02-01'), endDate: null },
        businessDate('2026-01-01'),
        businessDate('2026-01-31'),
      ),
    ).toBe(false);
  });

  it('B excludes employee whose employment ended before report month', () => {
    expect(
      employmentOverlapsDateRange(
        { hireDate: businessDate('2025-01-01'), endDate: businessDate('2026-02-28') },
        businessDate('2026-03-01'),
        businessDate('2026-03-31'),
      ),
    ).toBe(false);
  });

  it('C clamps mid-month hire to effective bounds', () => {
    expect(
      effectiveEmploymentBoundsInRange(
        { hireDate: businessDate('2026-01-20'), endDate: null },
        businessDate('2026-01-01'),
        businessDate('2026-01-31'),
      ),
    ).toEqual({
      fromDate: businessDate('2026-01-20'),
      toDate: businessDate('2026-01-31'),
    });
  });

  it('D clamps mid-month end to effective bounds', () => {
    expect(
      effectiveEmploymentBoundsInRange(
        { hireDate: businessDate('2025-01-01'), endDate: businessDate('2026-01-10') },
        businessDate('2026-01-01'),
        businessDate('2026-01-31'),
      ),
    ).toEqual({
      fromDate: businessDate('2026-01-01'),
      toDate: businessDate('2026-01-10'),
    });
  });

  it('E includes former employee employed in historical month regardless of overlap math', () => {
    expect(
      employmentOverlapsDateRange(
        { hireDate: businessDate('2025-06-01'), endDate: businessDate('2026-01-15') },
        businessDate('2026-01-01'),
        businessDate('2026-01-31'),
      ),
    ).toBe(true);
  });

  it('marks pre-hire workdays as not applicable for missing attendance', () => {
    const employment = { hireDate: businessDate('2026-01-20'), endDate: null };
    expect(isWithinEmploymentRange(businessDate('2026-01-19'), employment)).toBe(false);
    expect(isWithinEmploymentRange(businessDate('2026-01-20'), employment)).toBe(true);
  });

  it('marks post-end workdays as not applicable for missing attendance', () => {
    const employment = { hireDate: null, endDate: businessDate('2026-01-10') };
    expect(isWithinEmploymentRange(businessDate('2026-01-11'), employment)).toBe(false);
    expect(isWithinEmploymentRange(businessDate('2026-01-10'), employment)).toBe(true);
  });
});

describe('buildMonthlyWorkforceReport employment filtering', () => {
  beforeEach(() => {
    gridRows.rows = [];
    for (const key of Object.keys(employeesById)) {
      delete employeesById[key];
    }
  });

  it('excludes not-yet-hired employees from sections and employee count', async () => {
    employeesById['future-hire'] = {
      id: 'future-hire',
      name: 'Future Hire',
      compensationClass: 'standard',
      employmentBasis: 'employee',
      hireDate: '2026-02-01',
      endDate: null,
    };
    employeesById['jan-worker'] = {
      id: 'jan-worker',
      name: 'Jan Worker',
      compensationClass: 'standard',
      employmentBasis: 'employee',
      hireDate: '2025-01-01',
      endDate: null,
    };
    gridRows.rows = [
      { employeeId: 'future-hire', employeeName: 'Future Hire', missingCount: 21 },
      { employeeId: 'jan-worker', employeeName: 'Jan Worker', missingCount: 0 },
    ];

    const payload = await buildMonthlyWorkforceReport(context, '2026-01', buildCtx);
    const summary = payload.sections.find((section) => section.id === 'summary');
    expect(summary?.rows?.find((row) => row.label === 'עובדים בדוח')?.value).toBe('1');
    expect(payload.sections.some((section) => section.heading === 'Future Hire')).toBe(false);
    expect(payload.sections.some((section) => section.heading === 'Jan Worker')).toBe(true);
  });

  it('does not emit missing-attendance text for excluded employees', async () => {
    employeesById['future-hire'] = {
      id: 'future-hire',
      name: 'Future Hire',
      compensationClass: 'standard',
      employmentBasis: 'employee',
      hireDate: '2026-02-01',
      endDate: null,
    };
    gridRows.rows = [{ employeeId: 'future-hire', employeeName: 'Future Hire', missingCount: 21 }];

    const payload = await buildMonthlyWorkforceReport(context, '2026-01', buildCtx);
    expect(JSON.stringify(payload)).not.toContain('חסרים');
    expect(JSON.stringify(payload)).not.toContain('Future Hire');
  });

  it('G preserves owner/manager exemption when employed in month', async () => {
    employeesById['owner'] = {
      id: 'owner',
      name: 'Owner',
      compensationClass: 'owner_manager',
      employmentBasis: 'employee',
      hireDate: '2020-01-01',
      endDate: null,
    };
    gridRows.rows = [{ employeeId: 'owner', employeeName: 'Owner', missingCount: 0 }];

    expect(employeeRequiresAttendanceReporting({ compensationClass: 'owner_manager' })).toBe(false);

    const payload = await buildMonthlyWorkforceReport(context, '2026-01', buildCtx);
    const ownerSection = payload.sections.find((section) => section.heading === 'Owner');
    expect(ownerSection).toBeDefined();
    expect(ownerSection?.rows?.find((row) => row.label === 'סיווג')?.value).toContain('פטור');
    expect(ownerSection?.paragraphs).toBeUndefined();
  });
});
