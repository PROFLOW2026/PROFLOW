/**
 * Integration: UI FormData → parse → range save contract (generic, not April-specific).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import {
  AttendanceOutcomeFormValidationError,
  parseAttendanceOutcomeFormPayload,
} from '@/app/[locale]/(app)/workforce/attendance/parse-attendance-outcome-form-payload';
import {
  filterEligibleWorkDatesInRange,
  saveAttendanceOutcomeRange,
} from '@/modules/workforce/application/attendance-outcomes';
import { adjustMonthlyCompensationForUnpaidAbsence } from '@/modules/workforce/domain/employment-active-range';

vi.mock('@/modules/tenancy', () => ({
  getLaborCostDefaultsForApply: vi.fn(async () => ({ workWeekdays: [0, 1, 2, 3, 4] })),
  resolveOrgWorkWeekdays: vi.fn(() => [0, 1, 2, 3, 4]),
}));

vi.mock('@/shared/permissions/assert', () => ({
  assertPermission: vi.fn(),
}));

function uiFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function mockContext(db: OrgContext['db']): OrgContext {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    organization: {
      id: 'org-1',
      timezone: 'Asia/Jerusalem',
      name: 'Test',
      baseCurrency: 'ILS',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(),
    roleKeys: [],
    db,
  } as unknown as OrgContext;
}

describe('UI payload → action parse', () => {
  it('vacation + unpaid: action receives unpaid, reason stays vacation', () => {
    const payload = parseAttendanceOutcomeFormPayload(
      uiFormData({
        employeeId: 'emp-1',
        entryMode: 'range',
        fromDate: '2026-04-01',
        toDate: '2026-04-09',
        outcome: 'not_worked',
        absenceReason: 'vacation',
        absenceCompensation: 'unpaid',
      }),
    );
    expect(payload.absenceCompensation).toBe('unpaid');
    expect(payload.absenceReason).toBe('vacation');
    expect(payload.outcome).toBe('not_worked');
  });

  it('vacation + paid: remains paid', () => {
    const payload = parseAttendanceOutcomeFormPayload(
      uiFormData({
        employeeId: 'emp-1',
        entryMode: 'range',
        outcome: 'not_worked',
        absenceReason: 'vacation',
        absenceCompensation: 'paid',
      }),
    );
    expect(payload.absenceCompensation).toBe('paid');
    expect(payload.absenceReason).toBe('vacation');
  });

  it('missing compensation throws — no silent paid default', () => {
    expect(() =>
      parseAttendanceOutcomeFormPayload(
        uiFormData({
          employeeId: 'emp-1',
          outcome: 'not_worked',
          absenceReason: 'vacation',
        }),
      ),
    ).toThrow(AttendanceOutcomeFormValidationError);
  });

  it('unpaid_leave forces unpaid even if UI sent paid', () => {
    const payload = parseAttendanceOutcomeFormPayload(
      uiFormData({
        employeeId: 'emp-1',
        outcome: 'not_worked',
        absenceReason: 'unpaid_leave',
        absenceCompensation: 'paid',
      }),
    );
    expect(payload.absenceCompensation).toBe('unpaid');
  });
});

describe('range save integration (mock DB)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('historical range vacation+unpaid → 7 eligible rows, vacation+unpaid stored, Apr 9 included', async () => {
    const inserts: Record<string, unknown>[] = [];
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ hireDate: null, endDate: null }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((row: Record<string, unknown>) => {
          inserts.push(row);
          return {
            onConflictDoUpdate: vi.fn(async () => undefined),
          };
        }),
      })),
    } as unknown as OrgContext['db'];

    const payload = parseAttendanceOutcomeFormPayload(
      uiFormData({
        employeeId: 'emp-1',
        entryMode: 'range',
        fromDate: '2026-04-01',
        toDate: '2026-04-09',
        outcome: 'not_worked',
        absenceReason: 'vacation',
        absenceCompensation: 'unpaid',
      }),
    );

    const count = await saveAttendanceOutcomeRange(mockContext(db), {
      employeeId: payload.employeeId,
      fromDate: businessDate('2026-04-01'),
      toDate: businessDate('2026-04-09'),
      outcome: payload.outcome,
      absenceReason: payload.absenceReason,
      absenceCompensation: payload.absenceCompensation,
    });

    const eligible = filterEligibleWorkDatesInRange({
      fromDate: businessDate('2026-04-01'),
      toDate: businessDate('2026-04-09'),
      workWeekdays: [0, 1, 2, 3, 4],
      employment: { hireDate: null, endDate: null },
    });

    expect(count).toBe(7);
    expect(eligible).toContain('2026-04-09');
    expect(inserts).toHaveLength(7);
    expect(inserts.every((r) => r.absenceReason === 'vacation')).toBe(true);
    expect(inserts.every((r) => r.absenceCompensation === 'unpaid')).toBe(true);
    expect(inserts.map((r) => r.workDate)).toEqual(eligible);
    expect(inserts.some((r) => r.workDate === '2026-04-03' || r.workDate === '2026-04-04')).toBe(false);
  });

  it('vacation+paid range does not reduce monthly salary in proration math', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: '8250',
        relevantWorkDays: 22,
        unpaidAbsenceDays: 0,
      }),
    ).toBe('8250');
  });

  it('7 unpaid workdays → recognized 5625 and payroll expectation', () => {
    const recognized = adjustMonthlyCompensationForUnpaidAbsence({
      baseAmount: '8250',
      relevantWorkDays: 22,
      unpaidAbsenceDays: 7,
    });
    expect(recognized).toBe('5625.000000');
  });
});
