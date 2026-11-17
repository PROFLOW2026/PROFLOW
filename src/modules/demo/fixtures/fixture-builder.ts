import { demoDay } from '@/modules/demo/domain/session-clock';
import {
  ONBOARDING_BUSINESS_TYPES,
  type OnboardingBusinessType,
} from '@/modules/tenancy/domain/onboarding-experience';
import { getCycleParams, type DemoArchetypeId } from './cycle-params';
import {
  activityYearMonths,
  buildAttendanceDates,
  buildMonthlyBillingAndPayments,
  buildMonthlyExpenses,
  buildMonthlyTimeEntries,
  buildMonthlyVendorBillsPaid,
  buildPayrollAndEmployerCosts,
  dateInMonth,
  grossFromNet,
  lastNYearMonths,
  money,
  quietMonthsForCycle,
  scaled,
  taxFromNet,
} from './monthly-activity';
import { getProfileBlueprint, type DemoWorkKind, type ProfileBlueprint } from './profile-blueprints';

export type { DemoArchetypeId };

export type DemoFixtureTaskStatus =
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'blocked'
  | 'done'
  | 'cancelled';

export interface DemoFixtureProject {
  readonly key: string;
  readonly name: string;
  readonly status: 'draft' | 'active' | 'on_hold' | 'completed';
  readonly clientKey: string;
  readonly startedDate: string;
  readonly targetEndDate: string;
  readonly actualEndDate?: string;
  readonly progressPercent: number;
  readonly workKind: DemoWorkKind;
  /** Fixed/open for jobs & work orders; null for classic projects. */
  readonly pricingMode: 'fixed' | 'open' | null;
  readonly location: string;
}

export interface DemoFixtureExpense {
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly description: string;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly taxAmount: string;
  readonly expenseDate: string;
  readonly dueDate: string;
  readonly paymentStatus: 'paid' | 'due' | 'upcoming' | 'overdue';
  readonly paidAt?: string;
}

export interface DemoFixtureBilling {
  readonly key: string;
  readonly projectKey: string;
  readonly clientKey: string;
  readonly reference: string;
  readonly subtotalAmount: string;
  readonly totalAmount: string;
  readonly issueDate: string;
}

export interface DemoFixtureContract {
  readonly key: string;
  readonly projectKey: string;
  readonly clientKey: string;
  readonly name: string;
  readonly originalValueNet: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly status: 'active' | 'closed';
}

export interface DemoFixturePayment {
  readonly billingKey: string;
  readonly projectKey: string;
  readonly clientKey: string;
  readonly amount: string;
  readonly paymentDate: string;
  readonly reference: string;
}

export interface DemoFixtureVendorBill {
  readonly key: string;
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly reference: string;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly taxAmount: string;
  readonly billDate: string;
  readonly dueDate: string;
  readonly status: 'open' | 'partially_matched' | 'matched';
  readonly paidGross?: string;
  readonly paidDate?: string;
}

export interface DemoFixtureTimeEntry {
  readonly employeeKey: string;
  readonly projectKey: string;
  readonly workDate: string;
  readonly hours: string;
  readonly description: string;
  readonly hourlyRate: number;
}

export interface DemoFixtureEmployee {
  readonly key: string;
  readonly name: string;
  readonly jobTitle: string;
  readonly hourlyRate: number;
}

export interface DemoFixtureVendor {
  readonly key: string;
  readonly name: string;
  readonly type: 'supplier' | 'subcontractor';
}

export interface DemoFixtureTask {
  readonly title: string;
  readonly projectKey: string;
  readonly status: DemoFixtureTaskStatus;
  readonly employeeKey?: string;
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly completionDate?: string;
}

export interface DemoFixturePurchaseOrder {
  readonly key: string;
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly reference: string;
  readonly committedNet: string;
  readonly orderedOn: string;
  readonly expectedCashDate: string;
  readonly lineDescription: string;
}

export interface DemoFixtureSubcontract {
  readonly key: string;
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly parentContractKey: string;
  readonly title: string;
  readonly originalAmount: string;
  readonly startDate: string;
  readonly endDate?: string;
}

export interface DemoFixtureBudget {
  readonly projectKey: string;
  readonly name: string;
  readonly totalBudgetAmount: string;
}

export interface DemoFixtureNotification {
  readonly type: 'task_overdue' | 'billing_overdue' | 'ap_due_soon' | 'timesheet_waiting';
  readonly title: string;
  readonly body: string;
  readonly severity: 'info' | 'warning' | 'urgent';
  readonly dedupeKey: string;
}

export interface DemoFixtureMilestone {
  readonly projectKey: string;
  readonly name: string;
  readonly targetDate: string;
  readonly status: 'planned' | 'achieved';
  readonly sortOrder: number;
}

export interface DemoFixturePayrollPayment {
  readonly employeeKey: string;
  readonly yearMonth: string;
  readonly expectedAmount: string;
  readonly paidAmount: string;
  readonly paidAt: string;
  readonly dueDate: string;
}

export interface DemoFixtureEmployerMonthCost {
  readonly employeeKey: string;
  readonly yearMonth: string;
  readonly knownAmount: string;
}

export interface DemoFixtureCoordinationEvent {
  readonly projectKey: string;
  readonly title: string;
  readonly startsAtDate: string;
  readonly kind: 'meeting' | 'installation' | 'inspection' | 'other';
}

export interface DemoFixture {
  readonly profileKey: OnboardingBusinessType;
  readonly archetypeId: DemoArchetypeId;
  readonly organizationName: string;
  readonly anchorDay: string;
  readonly moneyScale: number;
  readonly quietMonths: readonly string[];
  readonly clients: readonly { readonly key: string; readonly name: string }[];
  readonly employees: readonly DemoFixtureEmployee[];
  readonly vendors: readonly DemoFixtureVendor[];
  readonly projects: readonly DemoFixtureProject[];
  readonly tasks: readonly DemoFixtureTask[];
  readonly expenses: readonly DemoFixtureExpense[];
  readonly billing: readonly DemoFixtureBilling[];
  readonly contracts: readonly DemoFixtureContract[];
  readonly payments: readonly DemoFixturePayment[];
  readonly vendorBills: readonly DemoFixtureVendorBill[];
  readonly timeEntries: readonly DemoFixtureTimeEntry[];
  readonly documents: readonly { readonly fileName: string; readonly projectKey: string }[];
  readonly boqItems: readonly { readonly description: string; readonly projectKey: string; readonly unitPrice: string }[];
  readonly attendanceDates: readonly string[];
  readonly notifications: readonly DemoFixtureNotification[];
  readonly assignments: readonly {
    readonly employeeKey: string;
    readonly projectKey: string;
    readonly role: string;
    readonly startDate: string;
  }[];
  readonly purchaseOrders: readonly DemoFixturePurchaseOrder[];
  readonly subcontracts: readonly DemoFixtureSubcontract[];
  readonly budgets: readonly DemoFixtureBudget[];
  readonly milestones: readonly DemoFixtureMilestone[];
  readonly payrollPayments: readonly DemoFixturePayrollPayment[];
  readonly employerMonthCosts: readonly DemoFixtureEmployerMonthCost[];
  readonly coordinationEvents: readonly DemoFixtureCoordinationEvent[];
}

const WORKFORCE_CLONE_SUFFIXES = [' · ב\'', ' · ג\'', ' · ד\'', ' · ה\'', ' · ו\'', ' · ז\'', ' · ח\'', ' · ט\''] as const;

function pricingModeFor(workKind: DemoWorkKind): 'fixed' | 'open' | null {
  if (workKind === 'job' || workKind === 'work_order') return 'fixed';
  return null;
}

function buildWorkforceEmployees(blueprint: ProfileBlueprint, workforceSize: number): DemoFixtureEmployee[] {
  const target = Math.max(4, workforceSize);
  const base = blueprint.employees;
  const rows: DemoFixtureEmployee[] = [];
  for (let index = 0; index < target; index += 1) {
    if (index < base.length) {
      rows.push({
        key: `e${index + 1}`,
        name: base[index]!.name,
        jobTitle: base[index]!.jobTitle,
        hourlyRate: base[index]!.hourlyRate,
      });
    } else {
      const template = base[base.length - 1]!;
      const cloneIndex = index - base.length;
      rows.push({
        key: `e${index + 1}`,
        name: `${template.name}${WORKFORCE_CLONE_SUFFIXES[cloneIndex % WORKFORCE_CLONE_SUFFIXES.length]!}`,
        jobTitle: template.jobTitle,
        hourlyRate: template.hourlyRate,
      });
    }
  }
  return rows;
}

function taskAssigneeKey(index: number, employeeCount: number): string {
  const cap = Math.min(4, employeeCount);
  return `e${(index % cap) + 1}`;
}

export function fixtureQuietMonths(profileKey: OnboardingBusinessType): string[] {
  return quietMonthsForCycle(getCycleParams(profileKey));
}

export function buildDemoFixture(
  profileKey: OnboardingBusinessType,
  anchor: Date = new Date(),
): DemoFixture {
  const blueprint = getProfileBlueprint(profileKey);
  const cycle = getCycleParams(profileKey);
  const scale = blueprint.moneyScale;
  const day = (offset: number) => demoDay(anchor, offset);
  const anchorDay = day(0);
  const quietMonths = quietMonthsForCycle(cycle);
  const activityMonths = activityYearMonths(anchorDay, quietMonths);

  const clients = blueprint.clients.map((name, index) => ({
    key: `c${index + 1}`,
    name,
  }));

  const employees = buildWorkforceEmployees(blueprint, cycle.workforceSize);

  const vendors: DemoFixtureVendor[] = blueprint.vendors.map((row, index) => ({
    key: `v${index + 1}`,
    name: row.name,
    type: row.type,
  }));

  const projects: DemoFixtureProject[] = blueprint.projects.map((row) => ({
    key: row.key,
    name: row.name,
    status: row.status,
    clientKey: `c${row.clientIndex + 1}`,
    startedDate: day(row.startOffset),
    targetEndDate: day(row.targetEndOffset),
    actualEndDate: row.actualEndOffset !== undefined ? day(row.actualEndOffset) : undefined,
    progressPercent: row.progressPercent,
    workKind: row.workKind,
    pricingMode: pricingModeFor(row.workKind),
    location: row.location,
  }));

  const monthlyCtx = {
    anchor,
    anchorDay,
    cycle,
    scale,
    activityMonths,
    expenseLabels: blueprint.expenseLabels,
    billingPrefixes: blueprint.billingPrefixes,
    profileKey,
  };

  const monthlyBillingPayments = buildMonthlyBillingAndPayments(monthlyCtx);
  const monthlyExpenses = buildMonthlyExpenses(monthlyCtx, vendors.length);
  const monthlyApPaid = buildMonthlyVendorBillsPaid(monthlyCtx);

  const billingDefs = [
    { key: 'b-active-1', net: 165_000, projectKey: 'p-active', clientKey: 'c1', offset: -150, idx: 1 },
    { key: 'b-active-2', net: 78_000, projectKey: 'p-active', clientKey: 'c1', offset: -105, idx: 2 },
    { key: 'b-active-3', net: 54_000, projectKey: 'p-active', clientKey: 'c1', offset: -60, idx: 3 },
    { key: 'b-active-4', net: 36_000, projectKey: 'p-active', clientKey: 'c1', offset: -20, idx: 4 },
    { key: 'b-active2-1', net: 62_000, projectKey: 'p-active-2', clientKey: 'c2', offset: -85, idx: 5 },
    { key: 'b-active2-2', net: 28_000, projectKey: 'p-active-2', clientKey: 'c2', offset: -30, idx: 6 },
    { key: 'b-done-1', net: 98_000, projectKey: 'p-done', clientKey: 'c4', offset: -160, idx: 7 },
    { key: 'b-done-2', net: 42_000, projectKey: 'p-done', clientKey: 'c4', offset: -90, idx: 8 },
    { key: 'b-hold-1', net: 24_000, projectKey: 'p-hold', clientKey: 'c2', offset: -40, idx: 9 },
    { key: 'b-service-1', net: 12_500, projectKey: 'p-service', clientKey: 'c3', offset: -45, idx: 10 },
    { key: 'b-service-2', net: 9_800, projectKey: 'p-service', clientKey: 'c3', offset: -12, idx: 11 },
    { key: 'b-archive-1', net: 55_000, projectKey: 'p-archive', clientKey: 'c1', offset: -280, idx: 12 },
  ].map((row) => ({ ...row, net: scaled(scale, row.net) }));

  const legacyBilling: DemoFixtureBilling[] = billingDefs.map((row) => ({
    key: row.key,
    projectKey: row.projectKey,
    clientKey: row.clientKey,
    reference: `${blueprint.billingPrefixes[row.idx % blueprint.billingPrefixes.length]!}-${String(row.idx).padStart(3, '0')}`,
    subtotalAmount: money(row.net),
    totalAmount: grossFromNet(row.net),
    issueDate: day(row.offset),
  }));

  const billing: DemoFixtureBilling[] = [...legacyBilling, ...monthlyBillingPayments.billing];

  const paymentDefs: Array<{
    billingKey: string;
    projectKey: string;
    clientKey: string;
    netPaid: number;
    offset: number;
    ref: string;
  }> = [
    { billingKey: 'b-active-1', projectKey: 'p-active', clientKey: 'c1', netPaid: 120_000, offset: -130, ref: 'REC-A1' },
    { billingKey: 'b-active-1', projectKey: 'p-active', clientKey: 'c1', netPaid: 45_000, offset: -95, ref: 'REC-A2' },
    { billingKey: 'b-active-2', projectKey: 'p-active', clientKey: 'c1', netPaid: 78_000, offset: -80, ref: 'REC-A3' },
    { billingKey: 'b-active-3', projectKey: 'p-active', clientKey: 'c1', netPaid: 30_000, offset: -35, ref: 'REC-A4' },
    { billingKey: 'b-active2-1', projectKey: 'p-active-2', clientKey: 'c2', netPaid: 40_000, offset: -55, ref: 'REC-B1' },
    { billingKey: 'b-active2-2', projectKey: 'p-active-2', clientKey: 'c2', netPaid: 15_000, offset: -10, ref: 'REC-B2' },
    { billingKey: 'b-done-1', projectKey: 'p-done', clientKey: 'c4', netPaid: 98_000, offset: -140, ref: 'REC-C1' },
    { billingKey: 'b-done-2', projectKey: 'p-done', clientKey: 'c4', netPaid: 42_000, offset: -70, ref: 'REC-C2' },
    { billingKey: 'b-service-1', projectKey: 'p-service', clientKey: 'c3', netPaid: 12_500, offset: -30, ref: 'REC-S1' },
    { billingKey: 'b-archive-1', projectKey: 'p-archive', clientKey: 'c1', netPaid: 55_000, offset: -250, ref: 'REC-Z1' },
  ];

  const legacyPayments: DemoFixturePayment[] = paymentDefs.map((row) => ({
    billingKey: row.billingKey,
    projectKey: row.projectKey,
    clientKey: row.clientKey,
    amount: money(scaled(scale, row.netPaid)),
    paymentDate: day(row.offset),
    reference: row.ref,
  }));

  const payments: DemoFixturePayment[] = [...legacyPayments, ...monthlyBillingPayments.payments];

  const vendorBillDefs = [
    { key: 'ap-1', projectKey: 'p-active', vendorKey: 'v3', net: 22_000, offset: -55, status: 'partially_matched' as const, paidNet: 12_000 },
    { key: 'ap-2', projectKey: 'p-active', vendorKey: 'v1', net: 14_500, offset: -33, status: 'matched' as const, paidNet: 14_500 },
    { key: 'ap-5', projectKey: 'p-done', vendorKey: 'v3', net: 11_400, offset: -100, status: 'matched' as const, paidNet: 11_400 },
  ];

  const legacyVendorBills: DemoFixtureVendorBill[] = vendorBillDefs.map((row, index) => {
    const net = scaled(scale, row.net);
    return {
      key: row.key,
      projectKey: row.projectKey,
      vendorKey: row.vendorKey,
      reference: `AP-${profileKey.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`,
      netAmount: money(net),
      grossAmount: grossFromNet(net),
      taxAmount: taxFromNet(net),
      billDate: day(row.offset),
      dueDate: day(row.offset + 20),
      status: row.status,
      paidGross: row.paidNet !== undefined ? grossFromNet(scaled(scale, row.paidNet)) : undefined,
      paidDate: row.paidNet !== undefined ? day(row.offset + 12) : undefined,
    };
  });

  const openApDefs = [
    { key: 'ap-open-1', projectKey: 'p-active', vendorKey: 'v1', net: 16_500, billOffset: -12, dueOffset: 10, ref: 'O1' },
    { key: 'ap-open-2', projectKey: 'p-active-2', vendorKey: 'v4', net: 9_200, billOffset: -8, dueOffset: 20, ref: 'O2' },
    { key: 'ap-open-3', projectKey: 'p-hold', vendorKey: 'v2', net: 7_800, billOffset: -5, dueOffset: 35, ref: 'O3' },
    { key: 'ap-3', projectKey: 'p-active-2', vendorKey: 'v4', net: 9_800, billOffset: -18, dueOffset: 12, ref: '03' },
    { key: 'ap-4', projectKey: 'p-hold', vendorKey: 'v2', net: 7_200, billOffset: -25, dueOffset: 8, ref: '04' },
    { key: 'ap-6', projectKey: 'p-service', vendorKey: 'v5', net: 3_600, billOffset: -8, dueOffset: 15, ref: '06' },
  ];

  const openVendorBills: DemoFixtureVendorBill[] = openApDefs.map((row) => {
    const net = scaled(scale, row.net);
    return {
      key: row.key,
      projectKey: row.projectKey,
      vendorKey: row.vendorKey,
      reference: `AP-${profileKey.slice(0, 4)}-${row.ref}`,
      netAmount: money(net),
      grossAmount: grossFromNet(net),
      taxAmount: taxFromNet(net),
      billDate: day(row.billOffset),
      dueDate: day(row.dueOffset),
      status: 'open',
    };
  });

  const vendorBills: DemoFixtureVendorBill[] = [
    ...legacyVendorBills,
    ...openVendorBills,
    ...monthlyApPaid,
  ];

  const contracts: DemoFixtureContract[] = [
    {
      key: 'ct-primary',
      projectKey: 'p-active',
      clientKey: 'c1',
      name: `הסכם ראשי — ${blueprint.projects[1]!.name}`,
      originalValueNet: money(scaled(scale, 480_000)),
      startDate: day(-150),
      endDate: day(30),
      status: 'active',
    },
    {
      key: 'ct-secondary',
      projectKey: 'p-active-2',
      clientKey: 'c2',
      name: `הסכם משלים — ${blueprint.projects[2]!.name}`,
      originalValueNet: money(scaled(scale, 210_000)),
      startDate: day(-95),
      endDate: day(55),
      status: 'active',
    },
    {
      key: 'ct-service',
      projectKey: 'p-service',
      clientKey: 'c3',
      name: 'הסכם שירות שוטף',
      originalValueNet: money(scaled(scale, 18_500)),
      startDate: day(-40),
      endDate: day(140),
      status: 'active',
    },
    {
      key: 'ct-hold',
      projectKey: 'p-hold',
      clientKey: 'c2',
      name: `הסכם מושהה — ${blueprint.projects[3]!.name}`,
      originalValueNet: money(scaled(scale, 95_000)),
      startDate: day(-175),
      endDate: day(90),
      status: 'active',
    },
    {
      key: 'ct-closed',
      projectKey: 'p-done',
      clientKey: 'c4',
      name: 'הסכם שהסתיים',
      originalValueNet: money(scaled(scale, 240_000)),
      startDate: day(-210),
      endDate: day(-40),
      status: 'closed',
    },
    {
      key: 'ct-archive',
      projectKey: 'p-archive',
      clientKey: 'c1',
      name: `הסכם ארכיון — ${blueprint.projects.find((row) => row.key === 'p-archive')?.name ?? 'ארכיון'}`,
      originalValueNet: money(scaled(scale, 120_000)),
      startDate: day(-300),
      endDate: day(-120),
      status: 'closed',
    },
  ];

  const taskStatuses: DemoFixtureTaskStatus[] = [
    'done',
    'done',
    'done',
    'done',
    'done',
    'done',
    'done',
    'done',
    'in_progress',
    'in_progress',
    'in_progress',
    'in_review',
    'todo',
    'todo',
    'todo',
    'blocked',
    'todo',
    'in_progress',
    'done',
    'todo',
    'in_progress',
    'blocked',
  ];
  const taskProjects = [
    'p-active',
    'p-active',
    'p-active',
    'p-active',
    'p-active-2',
    'p-active-2',
    'p-done',
    'p-done',
    'p-active',
    'p-active-2',
    'p-service',
    'p-hold',
    'p-active',
    'p-pipeline',
    'p-service',
    'p-hold',
    'p-active',
    'p-active-2',
    'p-archive',
    'p-draft',
    'p-service',
    'p-active',
  ];

  const taskMonths =
    activityMonths.length > 0
      ? activityMonths
      : lastNYearMonths(anchorDay.slice(0, 7), 6);

  const tasks: DemoFixtureTask[] = blueprint.taskTitles.slice(0, 22).map((title, index) => {
    const status = taskStatuses[index]!;
    const projectKey = taskProjects[index]!;
    const ym = taskMonths[index % taskMonths.length]!;
    const opened = dateInMonth(anchor, ym, 2 + (index % 5));
    const dueDay = 12 + (index % 10);
    const calendarDue = dateInMonth(anchor, ym, Math.min(dueDay, 28));
    const finalDue =
      status === 'todo' && index % 3 === 0 ? day(-4 - (index % 5)) : calendarDue;
    const completion = status === 'done' ? dateInMonth(anchor, ym, 15 + (index % 8)) : undefined;
    return {
      title,
      projectKey,
      status,
      employeeKey: taskAssigneeKey(index, employees.length),
      startDate: opened,
      dueDate: finalDue,
      completionDate: completion,
    };
  });

  const hourlyRates = new Map(employees.map((row) => [row.key, row.hourlyRate]));
  const monthlyTime = buildMonthlyTimeEntries(
    monthlyCtx,
    employees.map((row) => row.key),
    hourlyRates,
  );

  const legacyTimeOffsets = [-150, -135, -120, -105, -90, -75, -60, -45, -38, -30, -22, -15, -10, -7, -4, -2, -1, 0];
  const timeProjects = ['p-active', 'p-active', 'p-active-2', 'p-service', 'p-active', 'p-active-2', 'p-hold', 'p-done'];
  const legacyTime: DemoFixtureTimeEntry[] = legacyTimeOffsets.map((offset, index) => {
    const employee = employees[index % employees.length]!;
    return {
      employeeKey: employee.key,
      projectKey: timeProjects[index % timeProjects.length]!,
      workDate: day(offset),
      hours: (6.5 + (index % 3) * 0.5).toFixed(2),
      description: `דיווח שעות — ${blueprint.expenseLabels[index % blueprint.expenseLabels.length]!}`,
      hourlyRate: employee.hourlyRate,
    };
  });

  const timeEntries: DemoFixtureTimeEntry[] = [...legacyTime, ...monthlyTime];

  const attendanceDates = buildAttendanceDates(anchor, anchorDay);

  const documents = blueprint.documentNames.map((fileName, index) => ({
    fileName,
    projectKey: (['p-active', 'p-active-2', 'p-hold', 'p-done'] as const)[index % 4]!,
  }));

  const boqItems = cycle.boqEnabled
    ? [1, 2, 3, 4].map((n) => ({
        description: `סעיף ${n} — ${blueprint.projects[1]!.name}`,
        projectKey: n <= 2 ? 'p-active' : 'p-active-2',
        unitPrice: money(scaled(scale, 1_200 * n)),
      }))
    : [];

  const assignments = [
    { employeeKey: 'e1', projectKey: 'p-active', role: employees[0]!.jobTitle, startDate: day(-150) },
    { employeeKey: 'e2', projectKey: 'p-active', role: employees[1]!.jobTitle, startDate: day(-140) },
    { employeeKey: 'e3', projectKey: 'p-active', role: employees[2]!.jobTitle, startDate: day(-130) },
    { employeeKey: 'e4', projectKey: 'p-active', role: employees[3]!.jobTitle, startDate: day(-120) },
    { employeeKey: 'e2', projectKey: 'p-active-2', role: employees[1]!.jobTitle, startDate: day(-90) },
    { employeeKey: 'e3', projectKey: 'p-active-2', role: employees[2]!.jobTitle, startDate: day(-85) },
    { employeeKey: 'e4', projectKey: 'p-hold', role: employees[3]!.jobTitle, startDate: day(-100) },
    ...(employees[4]
      ? [{ employeeKey: 'e5', projectKey: 'p-service', role: employees[4]!.jobTitle, startDate: day(-40) }]
      : []),
    ...(employees[5]
      ? [{ employeeKey: 'e6', projectKey: 'p-service', role: employees[5]!.jobTitle, startDate: day(-35) }]
      : []),
    { employeeKey: 'e1', projectKey: 'p-done', role: employees[0]!.jobTitle, startDate: day(-210) },
  ];

  const supplierVendor = vendors.find((row) => row.type === 'supplier') ?? vendors[0]!;
  const subVendor = vendors.find((row) => row.type === 'subcontractor') ?? vendors[vendors.length - 1]!;

  const purchaseOrders: DemoFixturePurchaseOrder[] = [
    {
      key: 'po-1',
      projectKey: 'p-active',
      vendorKey: supplierVendor.key,
      reference: `PO-${profileKey.slice(0, 4)}-01`,
      committedNet: money(scaled(scale, 28_500)),
      orderedOn: day(-70),
      expectedCashDate: day(14),
      lineDescription: `הזמנת חומרים — ${blueprint.projects[1]!.name}`,
    },
    {
      key: 'po-2',
      projectKey: 'p-active-2',
      vendorKey: supplierVendor.key,
      reference: `PO-${profileKey.slice(0, 4)}-02`,
      committedNet: money(scaled(scale, 12_400)),
      orderedOn: day(-35),
      expectedCashDate: day(28),
      lineDescription: `הזמנת ציוד — ${blueprint.projects[2]!.name}`,
    },
  ];

  const subcontractProjects = ['p-active', 'p-active-2', 'p-active', 'p-active-2'] as const;
  const subcontractParents = ['ct-primary', 'ct-secondary', 'ct-primary', 'ct-secondary'] as const;
  const subcontracts: DemoFixtureSubcontract[] = [];
  for (let index = 0; index < cycle.subcontractIntensity; index += 1) {
    subcontracts.push({
      key: `sc-${index + 1}`,
      projectKey: subcontractProjects[index % subcontractProjects.length]!,
      vendorKey: subVendor.key,
      parentContractKey: subcontractParents[index % subcontractParents.length]!,
      title: `הסכם קבלן משנה ${index + 1} — ${subVendor.name}`,
      originalAmount: money(scaled(scale, 72_000 + index * 18_000)),
      startDate: day(-140 + index * 10),
      endDate: day(20 + index * 15),
    });
  }

  const budgets: DemoFixtureBudget[] = contracts
    .filter((row) => row.status === 'active')
    .map((row) => ({
      projectKey: row.projectKey,
      name: `תקציב — ${projects.find((project) => project.key === row.projectKey)?.name ?? row.projectKey}`,
      totalBudgetAmount: money(Math.round(Number(row.originalValueNet) * 0.92 * 100) / 100),
    }));

  const milestones: DemoFixtureMilestone[] = [
    {
      projectKey: 'p-active',
      name: 'השלמת שלד',
      targetDate: dateInMonth(anchor, lastNYearMonths(anchorDay.slice(0, 7), 3)[1] ?? anchorDay.slice(0, 7), 15),
      status: 'achieved',
      sortOrder: 1,
    },
    {
      projectKey: 'p-active',
      name: 'מסירה זמנית',
      targetDate: day(25),
      status: 'planned',
      sortOrder: 2,
    },
    {
      projectKey: 'p-active-2',
      name: 'אישור לקוח',
      targetDate: dateInMonth(anchor, lastNYearMonths(anchorDay.slice(0, 7), 2)[0] ?? anchorDay.slice(0, 7), 12),
      status: 'achieved',
      sortOrder: 1,
    },
    {
      projectKey: 'p-service',
      name: 'ביקורת שירות רבעונית',
      targetDate: dateInMonth(anchor, anchorDay.slice(0, 7), 22),
      status: 'planned',
      sortOrder: 1,
    },
  ];

  const coordinationEvents: DemoFixtureCoordinationEvent[] = [
    {
      projectKey: 'p-active',
      title: 'ישיבת תיאום שבועית — אתר ראשי',
      startsAtDate: day(-3),
      kind: 'meeting',
    },
    {
      projectKey: 'p-active',
      title: 'ביקורת התקנות — שלב ב',
      startsAtDate: day(7),
      kind: 'inspection',
    },
  ];

  const { payrollPayments, employerMonthCosts } = buildPayrollAndEmployerCosts(anchor, anchorDay, cycle, employees);

  const expenseOffsets = [-165, -140, -118, -95, -78, -62, -48, -35, -28, -18, -11, -5, -150, -100, -70, -40, -22, -9];
  const expenseProjects = [
    'p-active',
    'p-active',
    'p-active',
    'p-active',
    'p-active',
    'p-active-2',
    'p-active-2',
    'p-active-2',
    'p-hold',
    'p-hold',
    'p-done',
    'p-done',
    'p-service',
    'p-service',
    'p-archive',
    'p-active',
    'p-active-2',
    'p-service',
  ];
  const expenseNets = [42_000, 18_500, 12_800, 9_600, 7_400, 15_200, 8_100, 5_600, 6_800, 4_200, 11_000, 3_900, 2_800, 1_950, 2_400, 5_500, 3_200, 1_700].map(
    (net) => scaled(scale, net),
  );

  const historicalExpenses: DemoFixtureExpense[] = expenseNets.map((net, index) => {
    const offset = expenseOffsets[index]!;
    const paid = index % 5 !== 0;
    const dueOffset = offset + 14;
    return {
      projectKey: expenseProjects[index]!,
      vendorKey: `v${(index % vendors.length) + 1}`,
      description: `${blueprint.expenseLabels[index % blueprint.expenseLabels.length]!} — היסטוריה ${index + 1}`,
      netAmount: money(net),
      grossAmount: grossFromNet(net),
      taxAmount: taxFromNet(net),
      expenseDate: day(offset),
      dueDate: day(dueOffset),
      paymentStatus: paid ? 'paid' : dueOffset < 0 ? 'overdue' : 'due',
      paidAt: paid ? day(offset + 10) : undefined,
    };
  });

  const unpaidLegacyExpenses: DemoFixtureExpense[] = [
    {
      projectKey: 'p-active',
      vendorKey: 'v2',
      description: `${blueprint.expenseLabels[0]!} — פתוח`,
      netAmount: money(scaled(scale, 5_500)),
      grossAmount: grossFromNet(scaled(scale, 5_500)),
      taxAmount: taxFromNet(scaled(scale, 5_500)),
      expenseDate: day(-9),
      dueDate: day(5),
      paymentStatus: 'due',
    },
    {
      projectKey: 'p-service',
      vendorKey: 'v5',
      description: `${blueprint.expenseLabels[1]!} — בתשלום`,
      netAmount: money(scaled(scale, 2_100)),
      grossAmount: grossFromNet(scaled(scale, 2_100)),
      taxAmount: taxFromNet(scaled(scale, 2_100)),
      expenseDate: day(-4),
      dueDate: day(12),
      paymentStatus: 'upcoming',
    },
  ];

  const expenses: DemoFixtureExpense[] = [...monthlyExpenses, ...historicalExpenses, ...unpaidLegacyExpenses];

  const notifications: DemoFixtureNotification[] = [
    {
      type: 'task_overdue',
      title: 'משימה באיחור',
      body: `יש משימות פתוחות באיחור בפרויקט ${blueprint.projects[1]!.name}.`,
      severity: 'warning',
      dedupeKey: `demo-task-overdue-${profileKey}`,
    },
    {
      type: 'billing_overdue',
      title: 'יתרת לקוח לגבייה',
      body: 'קיימים חיובים שטרם נגבו במלואם.',
      severity: 'urgent',
      dedupeKey: `demo-billing-overdue-${profileKey}`,
    },
    {
      type: 'ap_due_soon',
      title: 'תשלום לספק מתקרב',
      body: 'חשבונות ספקים פתוחים עם מועד תשלום קרוב.',
      severity: 'warning',
      dedupeKey: `demo-ap-due-${profileKey}`,
    },
    {
      type: 'timesheet_waiting',
      title: 'דיווחי שעות ממתינים',
      body: 'יש דיווחי שעות שדורשים מעקב שוטף.',
      severity: 'info',
      dedupeKey: `demo-timesheet-${profileKey}`,
    },
  ];

  return {
    profileKey,
    archetypeId: cycle.archetypeId,
    organizationName: blueprint.organizationName,
    anchorDay,
    moneyScale: scale,
    quietMonths,
    clients,
    employees,
    vendors,
    projects,
    tasks,
    expenses,
    billing,
    contracts,
    payments,
    vendorBills,
    timeEntries,
    documents,
    boqItems,
    attendanceDates,
    notifications,
    assignments,
    purchaseOrders,
    subcontracts,
    budgets,
    milestones,
    payrollPayments,
    employerMonthCosts,
    coordinationEvents,
  };
}

export function activeProjectContractNet(fixture: DemoFixture): string {
  const total = fixture.contracts
    .filter((row) => row.projectKey === 'p-active' && row.status === 'active')
    .reduce((sum, row) => sum + Number(row.originalValueNet), 0);
  return total.toFixed(2);
}

export function activeProjectCostNet(fixture: DemoFixture): string {
  const total = fixture.expenses
    .filter((row) => row.projectKey === 'p-active')
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  return total.toFixed(2);
}

export function collectFixtureDateStrings(fixture: DemoFixture): string[] {
  const dates: string[] = [fixture.anchorDay];
  for (const project of fixture.projects) {
    dates.push(project.startedDate, project.targetEndDate);
    if (project.actualEndDate) dates.push(project.actualEndDate);
  }
  dates.push(...fixture.attendanceDates);
  for (const row of fixture.expenses) {
    dates.push(row.expenseDate, row.dueDate);
    if (row.paidAt) dates.push(row.paidAt);
  }
  for (const row of fixture.billing) dates.push(row.issueDate);
  for (const row of fixture.contracts) {
    dates.push(row.startDate);
    if (row.endDate) dates.push(row.endDate);
  }
  for (const row of fixture.assignments) dates.push(row.startDate);
  for (const row of fixture.purchaseOrders) {
    dates.push(row.orderedOn, row.expectedCashDate);
  }
  for (const row of fixture.subcontracts) {
    dates.push(row.startDate);
    if (row.endDate) dates.push(row.endDate);
  }
  for (const row of fixture.payments) dates.push(row.paymentDate);
  for (const row of fixture.vendorBills) {
    dates.push(row.billDate, row.dueDate);
    if (row.paidDate) dates.push(row.paidDate);
  }
  for (const row of fixture.timeEntries) dates.push(row.workDate);
  for (const row of fixture.tasks) {
    if (row.startDate) dates.push(row.startDate);
    if (row.dueDate) dates.push(row.dueDate);
    if (row.completionDate) dates.push(row.completionDate);
  }
  for (const row of fixture.milestones) dates.push(row.targetDate);
  for (const row of fixture.payrollPayments) {
    dates.push(row.paidAt, row.dueDate);
  }
  for (const row of fixture.coordinationEvents) dates.push(row.startsAtDate);
  return dates;
}

export const DEMO_FIXTURE_KEYS = ONBOARDING_BUSINESS_TYPES;