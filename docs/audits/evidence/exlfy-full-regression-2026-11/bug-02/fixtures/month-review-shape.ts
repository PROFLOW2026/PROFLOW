import type { EmployeeMonthCostRow } from '@/modules/workforce/data/employee-month-costs.repository';
import type { MonthlyEmployerCostReview } from '@/modules/workforce/application/employer-month-costs';

/**
 * Drizzle `timestamp(..., { mode: 'date' })` rows as returned from PG.
 * Mirrors employee_month_costs + employer-month-costs loader shape.
 */
export function buildMonthCostRow(overrides: Partial<EmployeeMonthCostRow> = {}): EmployeeMonthCostRow {
  const now = new Date('2026-10-01T12:00:00.000Z');
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    organizationId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    employeeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    yearMonth: '2026-10',
    currency: 'ILS',
    estimatedAmount: '8250.000000',
    actualAmount: null,
    knownAmount: '8250.000000',
    knownQuality: 'estimated',
    source: 'compensation_derived',
    recognitionSource: 'monthly_allocated',
    status: 'applied',
    notes: null,
    lockedAt: new Date('2026-10-15T08:00:00.000Z'),
    adjustsMonthId: null,
    createdAt: now,
    updatedAt: new Date('2026-10-02T06:00:00.000Z'),
    ...overrides,
  };
}

export function buildMonthlyEmployerCostReviewWithDates(): MonthlyEmployerCostReview {
  const month = buildMonthCostRow();
  const historyMonth = buildMonthCostRow({
    id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
    yearMonth: '2026-09',
    createdAt: new Date('2026-09-01T12:00:00.000Z'),
    updatedAt: new Date('2026-09-02T12:00:00.000Z'),
  });
  return {
    available: true,
    employeeId: month.employeeId,
    yearMonth: month.yearMonth,
    month,
    run: {
      id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
      organizationId: month.organizationId,
      employeeMonthCostId: month.id,
      method: 'hours',
      status: 'applied',
      currency: 'ILS',
      allocatedAmount: '8250.000000',
      unallocatedAmount: '0.000000',
      companyOnlyAmount: '0.000000',
      explanation: null,
      supersedesRunId: null,
      appliedAt: new Date('2026-10-20T10:00:00.000Z'),
      createdAt: new Date('2026-10-18T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    },
    lines: [],
    preview: {
      knownAmount: '8250.00',
      knownQuality: 'estimated',
      allocatedAmount: '8250.00',
      unallocatedAmount: '0.00',
      status: 'balanced',
    },
    months: [month, historyMonth],
    pendingSubmittedHours: '0',
  };
}

/** Same review after serialize-task-cards-style coercion (strings, no Date instances). */
export function buildSerializedMonthReviewForClient(
  review: MonthlyEmployerCostReview,
): Record<string, unknown> {
  const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value);

  const mapRow = (row: EmployeeMonthCostRow) => ({
    ...row,
    lockedAt: row.lockedAt ? iso(row.lockedAt) : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  });

  return {
    ...review,
    month: review.month ? mapRow(review.month) : null,
    months: review.months.map(mapRow),
    run: review.run
      ? {
          ...review.run,
          appliedAt: review.run.appliedAt ? iso(review.run.appliedAt) : null,
          createdAt: iso(review.run.createdAt),
          updatedAt: iso(review.run.updatedAt),
        }
      : null,
  };
}
