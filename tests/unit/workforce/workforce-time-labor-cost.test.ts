import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  hourlyEmployerCostFromMonthlyTotal,
  laborCostFromMonthlyEmployerTotal,
  resolveLaborCostFromCompensation,
} from '@/modules/workforce/domain/compensation-labor-cost';
import {
  allocateDailyExcessAcrossEntries,
  breakdownDailyHours,
  contributesApprovedLaborCost,
  isEmployeeDailyStandardValid,
  isExactDuplicateCandidate,
  isExcessStatusCouplingValid,
  isExcessWithinEntryHours,
  normalizeExcessFieldsForInsert,
  reconcileExcessApprovalStatus,
} from '@/modules/workforce/domain/daily-time-integrity';
import {
  ensureValidClientRequestId,
  isValidClientRequestId,
} from '@/modules/workforce/domain/client-request-id';
import {
  resolveDailyFrameworkHours,
  resolveWorkCalendarRatesForCosting,
} from '@/modules/workforce/domain/work-calendar';
import { calculateLaborCostTotal } from '@/modules/workforce/domain/labor-cost';

describe('work calendar — explicit configuration only', () => {
  it('derives monthly standard hours from explicit org settings (182 example)', () => {
    const result = resolveWorkCalendarRatesForCosting({
      org: { standardHoursPerDay: '8', workingDaysPerMonth: '22.75' },
    });
    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.rates.standardHoursPerMonth).toBe('182');
    }
  });

  it('uses employee override over org for costing daily hours', () => {
    const result = resolveWorkCalendarRatesForCosting({
      employeeStandardHoursPerDay: '7.5',
      org: { standardHoursPerDay: '8', workingDaysPerMonth: '20' },
    });
    expect(result.configured).toBe(true);
    if (result.configured) {
      expect(result.rates.standardHoursPerDay).toBe('7.5');
      expect(result.rates.standardHoursPerMonth).toBe('150');
    }
  });

  it('returns missing when org has no configured denominator (no silent 160h)', () => {
    const result = resolveWorkCalendarRatesForCosting({
      org: { standardHoursPerDay: null, workingDaysPerMonth: null },
    });
    expect(result.configured).toBe(false);
    if (!result.configured) {
      expect(result.missing).toContain('standardHoursPerDay');
      expect(result.missing).toContain('workingDaysPerMonth');
    }
  });

  it('employee override beats org for daily framework', () => {
    const framework = resolveDailyFrameworkHours({
      employeeStandardHoursPerDay: '6',
      orgStandardHoursPerDay: '8',
    });
    expect(framework.configured).toBe(true);
    if (framework.configured) expect(framework.standardHoursPerDay).toBe('6');
  });
});

describe('monthly compensation → labor cost', () => {
  const configured = resolveWorkCalendarRatesForCosting({
    org: { standardHoursPerDay: '8', workingDaysPerMonth: '22.75' },
  });
  const calendar = configured.configured ? configured.rates : null;

  it('converts monthly employer cost to hourly (18000 / 182)', () => {
    expect(calendar).not.toBeNull();
    const hourly = hourlyEmployerCostFromMonthlyTotal({
      monthlyEmployerCost: money('18000', 'ILS'),
      calendar: calendar!,
    });
    expect(Number(hourly?.amount).toFixed(2)).toBe('98.90');
  });

  it('computes project labor for 6 hours', () => {
    const total = laborCostFromMonthlyEmployerTotal({
      monthlyEmployerCost: money('18000', 'ILS'),
      hours: '6',
      calendar: calendar!,
    });
    expect(Number(total?.amount).toFixed(2)).toBe('593.40');
  });

  it('routes monthly rate to monthly_allocation (no entry snapshot ÷ hours)', () => {
    const resolution = resolveLaborCostFromCompensation({
      hours: '6',
      calendar: null,
      rateVersion: {
        id: 'rv-1',
        baseRate: '18000',
        currency: 'ILS',
        rateUnit: 'monthly',
        burdenPercent: null,
      },
      components: [],
      monthlyEmployerCost: null,
    });
    expect(resolution.kind).toBe('monthly_allocation');
    expect(resolution.costAmount).toBeNull();
  });

  it('still exposes deprecated monthly÷hours helper for display-only math', () => {
    const resolution = laborCostFromMonthlyEmployerTotal({
      monthlyEmployerCost: money('18000', 'ILS'),
      hours: '6',
      calendar: calendar!,
    });
    expect(Number(resolution?.amount).toFixed(2)).toBe('593.40');
  });
});

describe('0066 DB integrity mirrors', () => {
  it('blocks invalid employee daily standards', () => {
    expect(isEmployeeDailyStandardValid(null)).toBe(true);
    expect(isEmployeeDailyStandardValid('8')).toBe(true);
    expect(isEmployeeDailyStandardValid('0')).toBe(false);
    expect(isEmployeeDailyStandardValid('-1')).toBe(false);
    expect(isEmployeeDailyStandardValid('25')).toBe(false);
  });

  it('blocks excess above entry hours', () => {
    expect(isExcessWithinEntryHours('8', '10')).toBe(false);
    expect(isExcessWithinEntryHours('10', '2')).toBe(true);
  });

  it('enforces excess/status coupling', () => {
    expect(isExcessStatusCouplingValid({ excessHours: null, excessApprovalStatus: null })).toBe(true);
    expect(isExcessStatusCouplingValid({ excessHours: '0', excessApprovalStatus: null })).toBe(true);
    expect(isExcessStatusCouplingValid({ excessHours: '2', excessApprovalStatus: 'pending' })).toBe(true);
    expect(isExcessStatusCouplingValid({ excessHours: '2', excessApprovalStatus: null })).toBe(false);
    expect(isExcessStatusCouplingValid({ excessHours: null, excessApprovalStatus: 'approved' })).toBe(false);
    expect(isExcessStatusCouplingValid({ excessHours: '0', excessApprovalStatus: 'approved' })).toBe(false);
  });

  it('normalizes insert fields for pending excess', () => {
    const normalized = normalizeExcessFieldsForInsert({
      hours: '10',
      excessHours: '2',
      excessApprovalStatus: 'pending',
    });
    expect(normalized.excessHours).toBe('2');
    expect(normalized.excessApprovalStatus).toBe('pending');
  });
});

describe('daily time integrity', () => {
  it('splits regular vs excess', () => {
    const breakdown = breakdownDailyHours({
      standardHoursPerDay: '8',
      reportedSoFar: '8',
      newHours: '2',
    });
    expect(breakdown.excessHours).toBe('2');
  });

  it('detects exact duplicates', () => {
    expect(
      isExactDuplicateCandidate({
        candidate: {
          employeeId: 'e1',
          workDate: '2026-01-05',
          kind: 'project',
          projectId: 'p1',
          hours: '8',
        },
        existing: {
          id: 't1',
          projectId: 'p1',
          workDate: '2026-01-05',
          hours: '8',
        },
      }),
    ).toBe(true);
  });

  it('excludes unapproved excess from approved labor cost', () => {
    expect(
      contributesApprovedLaborCost({
        status: 'recorded',
        approvalStatus: 'approved',
        excessHours: '2',
        excessApprovalStatus: 'pending',
      }),
    ).toBe(false);
  });
});

describe('hourly compensation', () => {
  it('uses hourly rate without calendar', () => {
    const total = calculateLaborCostTotal({
      baseRate: '100',
      currency: 'ILS',
      rateUnit: 'hourly',
      hours: '6',
      burdenPercent: null,
    });
    expect(Number(total.amount).toFixed(2)).toBe('600.00');
  });
});

describe('client_request_id — always valid UUID', () => {
  it('accepts a valid client-provided UUID', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    expect(isValidClientRequestId(id)).toBe(true);
    expect(ensureValidClientRequestId(id)).toBe(id);
  });

  it('rejects local timestamp fallback and generates a UUID', () => {
    expect(isValidClientRequestId(`local-${Date.now()}`)).toBe(false);
    const generated = ensureValidClientRequestId(`local-${Date.now()}`);
    expect(isValidClientRequestId(generated)).toBe(true);
  });

  it('generates UUID when missing', () => {
    const generated = ensureValidClientRequestId(null);
    expect(isValidClientRequestId(generated)).toBe(true);
  });
});

function allocationMap(
  entries: readonly { id: string; hours: string; sortKey: string }[],
  framework = '8',
) {
  const rows = allocateDailyExcessAcrossEntries({ standardHoursPerDay: framework, entries });
  return new Map(rows.map((row) => [row.entryId, row.excessHours]));
}

describe('daily excess reconciliation — insertion-order independent', () => {
  const entryA = { id: 'a', hours: '6', sortKey: '2026-01-05T08:00:00.000Z#a' };
  const entryB = { id: 'b', hours: '4', sortKey: '2026-01-05T09:00:00.000Z#b' };
  const entryC = { id: 'c', hours: '6', sortKey: '2026-01-05T10:00:00.000Z#c' };

  it('6h + 4h on 8h framework → 2h excess on later entry', () => {
    const map = allocationMap([entryA, entryB]);
    expect(map.get('a')).toBeNull();
    expect(map.get('b')).toBe('2');
  });

  it('delete 6h entry → remaining 4h has no excess', () => {
    const map = allocationMap([entryB]);
    expect(map.get('b')).toBeNull();
  });

  it('4h + new 6h → total 10h → 2h authoritative excess', () => {
    const map = allocationMap([entryB, entryC]);
    expect(map.get('b')).toBeNull();
    expect(map.get('c')).toBe('2');
  });

  it('correction 6h → 3h reconciles daily total/excess', () => {
    const correctedA = { ...entryA, hours: '3' };
    const map = allocationMap([correctedA, entryB]);
    expect(map.get('a')).toBeNull();
    expect(map.get('b')).toBeNull();
  });

  it('multiple projects same day remain supported', () => {
    const project1 = { id: 'p1', hours: '5', sortKey: '2026-01-05T08:00:00.000Z#p1' };
    const project2 = { id: 'p2', hours: '5', sortKey: '2026-01-05T09:00:00.000Z#p2' };
    const map = allocationMap([project1, project2]);
    expect(map.get('p1')).toBeNull();
    expect(map.get('p2')).toBe('2');
  });

  it('clears stale approval when excess removed', () => {
    const nextStatus = reconcileExcessApprovalStatus({
      previousExcessHours: '2',
      previousStatus: 'approved',
      nextExcessHours: null,
    });
    expect(nextStatus).toBeNull();
  });

  it('requires approval when new excess appears', () => {
    const nextStatus = reconcileExcessApprovalStatus({
      previousExcessHours: null,
      previousStatus: null,
      nextExcessHours: '2',
    });
    expect(nextStatus).toBe('pending');
  });

  it('cleared excess restores full labor Actual eligibility', () => {
    expect(
      contributesApprovedLaborCost({
        status: 'recorded',
        approvalStatus: 'approved',
        excessHours: null,
        excessApprovalStatus: null,
      }),
    ).toBe(true);
  });
});
