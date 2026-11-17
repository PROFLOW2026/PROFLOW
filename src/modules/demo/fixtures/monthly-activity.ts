import { demoDay } from '@/modules/demo/domain/session-clock';
import type { DemoCycleParams } from './cycle-params';
import type {
  DemoFixtureBilling,
  DemoFixtureExpense,
  DemoFixturePayment,
  DemoFixtureTimeEntry,
  DemoFixtureVendorBill,
} from './fixture-builder';

export interface DemoFixturePayrollPaymentRow {
  readonly employeeKey: string;
  readonly yearMonth: string;
  readonly expectedAmount: string;
  readonly paidAmount: string;
  readonly paidAt: string;
  readonly dueDate: string;
}

export interface DemoFixtureEmployerMonthCostRow {
  readonly employeeKey: string;
  readonly yearMonth: string;
  readonly knownAmount: string;
}

const MONTH_START = '2026-01';

const offsetCacheByAnchor = new WeakMap<Date, Map<string, number>>();

function offsetCache(anchor: Date): Map<string, number> {
  let cache = offsetCacheByAnchor.get(anchor);
  if (!cache) {
    cache = new Map();
    for (let offset = -400; offset <= 200; offset += 1) {
      cache.set(demoDay(anchor, offset), offset);
    }
    offsetCacheByAnchor.set(anchor, cache);
  }
  return cache;
}

export function offsetForDemoDate(anchor: Date, isoDate: string): number {
  const hit = offsetCache(anchor).get(isoDate);
  if (hit === undefined) throw new Error(`demoDay offset not found for ${isoDate}`);
  return hit;
}

/** Calendar YYYY-MM-DD in Jerusalem session, validated against demoDay scan. */
export function dateInMonth(anchor: Date, yearMonth: string, dayOfMonth: number): string {
  const target = `${yearMonth}-${String(dayOfMonth).padStart(2, '0')}`;
  offsetForDemoDate(anchor, target);
  return target;
}

export function listYearMonthsInclusive(fromYm: string, toYm: string): string[] {
  const [fromY, fromM] = fromYm.split('-').map(Number);
  const [toY, toM] = toYm.split('-').map(Number);
  const out: string[] = [];
  let y = fromY!;
  let m = fromM!;
  while (y < toY! || (y === toY && m <= toM!)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function lastNYearMonths(anchorYm: string, n: number): string[] {
  const [y0, m0] = anchorYm.split('-').map(Number);
  const out: string[] = [];
  let y = y0!;
  let m = m0!;
  for (let i = 0; i < n; i += 1) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`);
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function quietMonthsForCycle(cycle: DemoCycleParams): string[] {
  if (cycle.quietMonthOffsetFromJan === null) return [];
  const month = cycle.quietMonthOffsetFromJan + 1;
  return [`2026-${String(month).padStart(2, '0')}`];
}

export function activityYearMonths(anchorDay: string, quietMonths: readonly string[]): string[] {
  const endYm = anchorDay.slice(0, 7);
  const quiet = new Set(quietMonths);
  return listYearMonthsInclusive(MONTH_START, endYm).filter((ym) => !quiet.has(ym));
}

export function money(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

export function grossFromNet(net: number): string {
  return (Math.round(net * 1.18 * 100) / 100).toFixed(2);
}

export function taxFromNet(net: number): string {
  return (Number(grossFromNet(net)) - net).toFixed(2);
}

export function scaled(scale: number, amount: number): number {
  return Math.round(amount * scale);
}

export function expensesPerMonth(density: DemoCycleParams['expenseDensity']): number {
  if (density === 'low') return 1;
  if (density === 'medium') return 2;
  return 3;
}

export interface MonthlyCashContext {
  readonly anchor: Date;
  readonly anchorDay: string;
  readonly cycle: DemoCycleParams;
  readonly scale: number;
  readonly activityMonths: readonly string[];
  readonly expenseLabels: readonly string[];
  readonly billingPrefixes: readonly string[];
  readonly profileKey: string;
}

export function buildMonthlyBillingAndPayments(
  ctx: MonthlyCashContext,
): { billing: DemoFixtureBilling[]; payments: DemoFixturePayment[] } {
  const billing: DemoFixtureBilling[] = [];
  const payments: DemoFixturePayment[] = [];
  ctx.activityMonths.forEach((ym, index) => {
    const variation = (index % 5) * 0.03;
    const net = scaled(ctx.scale, ctx.cycle.billingNetBase * (0.85 + variation));
    const billingKey = `b-m-${ym}`;
    const issueDate = dateInMonth(ctx.anchor, ym, 5);
    billing.push({
      key: billingKey,
      projectKey: 'p-active',
      clientKey: 'c1',
      reference: `${ctx.billingPrefixes[index % ctx.billingPrefixes.length]!}-M${ym.replace('-', '')}`,
      subtotalAmount: money(net),
      totalAmount: grossFromNet(net),
      issueDate,
    });
    const payNet = Math.round(net * 0.7);
    payments.push({
      billingKey,
      projectKey: 'p-active',
      clientKey: 'c1',
      amount: money(payNet),
      paymentDate: dateInMonth(ctx.anchor, ym, 18),
      reference: `REC-M-${ym}`,
    });
  });
  return { billing, payments };
}

export function buildMonthlyExpenses(
  ctx: MonthlyCashContext,
  vendorsCount: number,
): DemoFixtureExpense[] {
  const perMonth = expensesPerMonth(ctx.cycle.expenseDensity);
  const expenses: DemoFixtureExpense[] = [];
  const projectKeys = ['p-active', 'p-active', 'p-active-2', 'p-hold', 'p-service'] as const;
  let seq = 0;
  for (const ym of ctx.activityMonths) {
    for (let slot = 0; slot < perMonth; slot += 1) {
      const baseNet = ctx.cycle.expenseNetBase * (0.9 + (seq % 4) * 0.05);
      const net = scaled(ctx.scale, baseNet / perMonth);
      const expenseDate = dateInMonth(ctx.anchor, ym, 8 + slot * 4);
      const paidAt = dateInMonth(ctx.anchor, ym, 12 + slot);
      expenses.push({
        projectKey: projectKeys[seq % projectKeys.length]!,
        vendorKey: `v${(seq % vendorsCount) + 1}`,
        description: `${ctx.expenseLabels[seq % ctx.expenseLabels.length]!} — ${ym}`,
        netAmount: money(net),
        grossAmount: grossFromNet(net),
        taxAmount: taxFromNet(net),
        expenseDate,
        dueDate: dateInMonth(ctx.anchor, ym, 25),
        paymentStatus: 'paid',
        paidAt,
      });
      seq += 1;
    }
  }
  return expenses;
}

export function buildMonthlyVendorBillsPaid(
  ctx: MonthlyCashContext,
): DemoFixtureVendorBill[] {
  const bills: DemoFixtureVendorBill[] = [];
  const recent = ctx.activityMonths.slice(-6);
  recent.forEach((ym, index) => {
    const net = scaled(ctx.scale, ctx.cycle.expenseNetBase * 0.35);
    const billDate = dateInMonth(ctx.anchor, ym, 6);
    const paidDate = dateInMonth(ctx.anchor, ym, 15);
    bills.push({
      key: `ap-paid-${ym}`,
      projectKey: index % 2 === 0 ? 'p-active' : 'p-active-2',
      vendorKey: 'v3',
      reference: `AP-${ctx.profileKey.slice(0, 4)}-P${ym.replace('-', '')}`,
      netAmount: money(net),
      grossAmount: grossFromNet(net),
      taxAmount: taxFromNet(net),
      billDate,
      dueDate: dateInMonth(ctx.anchor, ym, 28),
      status: 'matched',
      paidGross: grossFromNet(net),
      paidDate,
    });
  });
  return bills;
}

export function buildMonthlyTimeEntries(
  ctx: MonthlyCashContext,
  employeeKeys: readonly string[],
  hourlyRates: ReadonlyMap<string, number>,
): DemoFixtureTimeEntry[] {
  const entries: DemoFixtureTimeEntry[] = [];
  const projectKeys = ['p-active', 'p-active-2', 'p-service', 'p-hold'];
  let seq = 0;
  for (const ym of ctx.activityMonths) {
    const employeeKey = employeeKeys[seq % employeeKeys.length]!;
    const workDate = dateInMonth(ctx.anchor, ym, 10 + (seq % 3));
    entries.push({
      employeeKey,
      projectKey: projectKeys[seq % projectKeys.length]!,
      workDate,
      hours: (7 + (seq % 3) * 0.5).toFixed(2),
      description: `דיווח שעות חודשי — ${ym}`,
      hourlyRate: hourlyRates.get(employeeKey) ?? 0,
    });
    if (ctx.cycle.expenseDensity !== 'low') {
      const employeeKey2 = employeeKeys[(seq + 1) % employeeKeys.length]!;
      entries.push({
        employeeKey: employeeKey2,
        projectKey: projectKeys[(seq + 1) % projectKeys.length]!,
        workDate: dateInMonth(ctx.anchor, ym, 16),
        hours: '6.00',
        description: `דיווח שעות — ${ym}`,
        hourlyRate: hourlyRates.get(employeeKey2) ?? 0,
      });
    }
    seq += 1;
  }
  return entries;
}

export function buildPayrollAndEmployerCosts(
  anchor: Date,
  anchorDay: string,
  cycle: DemoCycleParams,
  employees: readonly { key: string; hourlyRate: number }[],
): {
  payrollPayments: DemoFixturePayrollPaymentRow[];
  employerMonthCosts: DemoFixtureEmployerMonthCostRow[];
} {
  const yearMonths = lastNYearMonths(anchorDay.slice(0, 7), 6);
  const skipIndices = new Set([0, 2]);
  const paidMonths = yearMonths.filter((_, index) => !skipIndices.has(index));
  const hoursPerEmployee = cycle.payrollHoursPerMonth / Math.max(employees.length, 1);

  const payrollPayments: DemoFixturePayrollPaymentRow[] = [];
  const employerMonthCosts: DemoFixtureEmployerMonthCostRow[] = [];

  for (const employee of employees) {
    const paidAmount = money(hoursPerEmployee * employee.hourlyRate);
    for (const ym of paidMonths) {
      const paidAt = dateInMonth(anchor, ym, 12);
      const dueDate = dateInMonth(anchor, ym, 10);
      payrollPayments.push({
        employeeKey: employee.key,
        yearMonth: ym,
        expectedAmount: paidAmount,
        paidAmount,
        paidAt,
        dueDate,
      });
      employerMonthCosts.push({
        employeeKey: employee.key,
        yearMonth: ym,
        knownAmount: money(Number(paidAmount) * 1.25),
      });
    }
  }

  return { payrollPayments, employerMonthCosts };
}

export function buildAttendanceDates(anchor: Date, anchorDay: string): string[] {
  const months = lastNYearMonths(anchorDay.slice(0, 7), 6);
  const dates: string[] = [];
  for (const ym of months) {
    dates.push(dateInMonth(anchor, ym, 4));
    dates.push(dateInMonth(anchor, ym, 18));
  }
  return dates;
}