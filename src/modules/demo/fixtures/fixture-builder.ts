import { demoDay } from '@/modules/demo/domain/session-clock';
import {
  ONBOARDING_BUSINESS_TYPES,
  type OnboardingBusinessType,
} from '@/modules/tenancy/domain/onboarding-experience';
import { getProfileBlueprint, type DemoWorkKind } from './profile-blueprints';

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
  readonly startDate?: string;
  readonly dueDate?: string;
  readonly completionDate?: string;
}

export interface DemoFixtureNotification {
  readonly type: 'task_overdue' | 'billing_overdue' | 'ap_due_soon' | 'timesheet_waiting';
  readonly title: string;
  readonly body: string;
  readonly severity: 'info' | 'warning' | 'urgent';
  readonly dedupeKey: string;
}

export interface DemoFixture {
  readonly profileKey: OnboardingBusinessType;
  readonly organizationName: string;
  readonly anchorDay: string;
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
    readonly startOffset: number;
  }[];
}

function money(amount: number): string {
  return (Math.round(amount * 100) / 100).toFixed(2);
}

function grossFromNet(net: number): string {
  return (Math.round(net * 1.18 * 100) / 100).toFixed(2);
}

function taxFromNet(net: number): string {
  return (Number(grossFromNet(net)) - net).toFixed(2);
}

function scaled(scale: number, amount: number): number {
  return Math.round(amount * scale);
}

function profileUsesBoq(profileKey: OnboardingBusinessType): boolean {
  return (
    profileKey === 'ELECTRICAL' ||
    profileKey === 'GENERAL_CONTRACTOR' ||
    profileKey === 'RENOVATION' ||
    profileKey === 'REAL_ESTATE_DEVELOPMENT'
  );
}

export function buildDemoFixture(
  profileKey: OnboardingBusinessType,
  anchor: Date = new Date(),
): DemoFixture {
  const blueprint = getProfileBlueprint(profileKey);
  const scale = blueprint.moneyScale;
  const day = (offset: number) => demoDay(anchor, offset);

  const clients = blueprint.clients.map((name, index) => ({
    key: `c${index + 1}`,
    name,
  }));

  const employees: DemoFixtureEmployee[] = blueprint.employees.map((row, index) => ({
    key: `e${index + 1}`,
    name: row.name,
    jobTitle: row.jobTitle,
    hourlyRate: row.hourlyRate,
  }));

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
    location: row.location,
  }));

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

  const expenses: DemoFixtureExpense[] = expenseNets.map((net, index) => {
    const offset = expenseOffsets[index]!;
    const paid = index % 5 !== 0;
    const dueOffset = offset + 14;
    return {
      projectKey: expenseProjects[index]!,
      vendorKey: `v${(index % vendors.length) + 1}`,
      description: `${blueprint.expenseLabels[index % blueprint.expenseLabels.length]!} — חודש ${index + 1}`,
      netAmount: money(net),
      grossAmount: grossFromNet(net),
      taxAmount: taxFromNet(net),
      expenseDate: day(offset),
      dueDate: day(dueOffset),
      paymentStatus: paid ? 'paid' : dueOffset < 0 ? 'overdue' : 'due',
      paidAt: paid ? day(offset + 10) : undefined,
    };
  });

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

  const billing: DemoFixtureBilling[] = billingDefs.map((row) => ({
    key: row.key,
    projectKey: row.projectKey,
    clientKey: row.clientKey,
    reference: `${blueprint.billingPrefixes[row.idx % blueprint.billingPrefixes.length]!}-${String(row.idx).padStart(3, '0')}`,
    subtotalAmount: money(row.net),
    totalAmount: grossFromNet(row.net),
    issueDate: day(row.offset),
  }));

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

  const payments: DemoFixturePayment[] = paymentDefs.map((row) => ({
    billingKey: row.billingKey,
    projectKey: row.projectKey,
    clientKey: row.clientKey,
    amount: grossFromNet(scaled(scale, row.netPaid)),
    paymentDate: day(row.offset),
    reference: row.ref,
  }));

  const vendorBillDefs = [
    { key: 'ap-1', projectKey: 'p-active', vendorKey: 'v3', net: 22_000, offset: -55, status: 'partially_matched' as const, paidNet: 12_000 },
    { key: 'ap-2', projectKey: 'p-active', vendorKey: 'v1', net: 14_500, offset: -33, status: 'matched' as const, paidNet: 14_500 },
    { key: 'ap-3', projectKey: 'p-active-2', vendorKey: 'v4', net: 9_800, offset: -18, status: 'open' as const },
    { key: 'ap-4', projectKey: 'p-hold', vendorKey: 'v2', net: 7_200, offset: -25, status: 'open' as const },
    { key: 'ap-5', projectKey: 'p-done', vendorKey: 'v3', net: 11_400, offset: -100, status: 'matched' as const, paidNet: 11_400 },
    { key: 'ap-6', projectKey: 'p-service', vendorKey: 'v5', net: 3_600, offset: -8, status: 'open' as const },
  ];

  const vendorBills: DemoFixtureVendorBill[] = vendorBillDefs.map((row, index) => {
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
      originalValueNet: money(scaled(scale, 190_000)),
      startDate: day(-95),
      endDate: day(55),
      status: 'active',
    },
    {
      key: 'ct-service',
      projectKey: 'p-service',
      clientKey: 'c3',
      name: 'הסכם שירות שוטף',
      originalValueNet: money(scaled(scale, 72_000)),
      startDate: day(-40),
      endDate: day(140),
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

  const tasks: DemoFixtureTask[] = blueprint.taskTitles.slice(0, 22).map((title, index) => {
    const status = taskStatuses[index]!;
    const projectKey = taskProjects[index]!;
    const opened = day(-160 + index * 7);
    const due =
      status === 'todo' && index % 3 === 0
        ? day(-4 - (index % 5))
        : day(-140 + index * 8 + (status === 'done' ? -2 : 12));
    const completion = status === 'done' ? day(-150 + index * 7) : undefined;
    return {
      title,
      projectKey,
      status,
      startDate: opened,
      dueDate: due,
      completionDate: completion,
    };
  });

  const timeEntries: DemoFixtureTimeEntry[] = [];
  const timeOffsets = [-150, -135, -120, -105, -90, -75, -60, -45, -38, -30, -22, -15, -10, -7, -4, -2, -1, 0];
  const timeProjects = ['p-active', 'p-active', 'p-active-2', 'p-service', 'p-active', 'p-active-2', 'p-hold', 'p-done'];
  for (let index = 0; index < timeOffsets.length; index += 1) {
    const employee = employees[index % employees.length]!;
    timeEntries.push({
      employeeKey: employee.key,
      projectKey: timeProjects[index % timeProjects.length]!,
      workDate: day(timeOffsets[index]!),
      hours: (6.5 + (index % 3) * 0.5).toFixed(2),
      description: `דיווח שעות — ${blueprint.expenseLabels[index % blueprint.expenseLabels.length]!}`,
      hourlyRate: employee.hourlyRate,
    });
  }

  const attendanceDates: string[] = [];
  for (let month = 5; month >= 0; month -= 1) {
    for (const dayOffset of [4, 18]) {
      attendanceDates.push(day(-(month * 30 + dayOffset)));
    }
  }

  const documents = blueprint.documentNames.map((fileName, index) => ({
    fileName,
    projectKey: (['p-active', 'p-active-2', 'p-hold', 'p-done'] as const)[index % 4]!,
  }));

  const boqItems = profileUsesBoq(profileKey)
    ? [1, 2, 3, 4].map((n) => ({
        description: `סעיף ${n} — ${blueprint.projects[1]!.name}`,
        projectKey: n <= 2 ? 'p-active' : 'p-active-2',
        unitPrice: money(scaled(scale, 1_200 * n)),
      }))
    : [];

  const assignments = [
    { employeeKey: 'e1', projectKey: 'p-active', role: employees[0]!.jobTitle, startOffset: -150 },
    { employeeKey: 'e2', projectKey: 'p-active', role: employees[1]!.jobTitle, startOffset: -140 },
    { employeeKey: 'e3', projectKey: 'p-active', role: employees[2]!.jobTitle, startOffset: -130 },
    { employeeKey: 'e2', projectKey: 'p-active-2', role: employees[1]!.jobTitle, startOffset: -90 },
    { employeeKey: 'e3', projectKey: 'p-active-2', role: employees[2]!.jobTitle, startOffset: -85 },
    { employeeKey: 'e5', projectKey: 'p-service', role: employees[4]!.jobTitle, startOffset: -40 },
    { employeeKey: 'e6', projectKey: 'p-service', role: employees[5]!.jobTitle, startOffset: -35 },
    { employeeKey: 'e1', projectKey: 'p-done', role: employees[0]!.jobTitle, startOffset: -210 },
  ];

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
    organizationName: blueprint.organizationName,
    anchorDay: day(0),
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
  };
}

export function activeProjectContractNet(fixture: DemoFixture): string {
  const total = fixture.billing
    .filter((row) => row.projectKey === 'p-active')
    .reduce((sum, row) => sum + Number(row.subtotalAmount), 0);
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
  return dates;
}

export const DEMO_FIXTURE_KEYS = ONBOARDING_BUSINESS_TYPES;
