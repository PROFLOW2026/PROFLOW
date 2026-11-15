import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import {
  ONBOARDING_BUSINESS_TYPES,
  type OnboardingBusinessType,
} from '@/modules/tenancy/domain/onboarding-experience';

export interface DemoFixtureProject {
  readonly key: string;
  readonly name: string;
  readonly status: 'draft' | 'active' | 'on_hold' | 'completed';
  readonly clientKey: string;
}

export interface DemoFixtureExpense {
  readonly projectKey: string;
  readonly vendorKey: string;
  readonly description: string;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly expenseDate: string;
}

export interface DemoFixtureBilling {
  readonly projectKey: string;
  readonly clientKey: string;
  readonly reference: string;
  readonly subtotalAmount: string;
  readonly totalAmount: string;
  readonly issueDate: string;
}

export interface DemoFixture {
  readonly profileKey: OnboardingBusinessType;
  readonly organizationName: string;
  readonly clients: readonly { readonly key: string; readonly name: string }[];
  readonly employees: readonly { readonly key: string; readonly name: string }[];
  readonly vendors: readonly { readonly key: string; readonly name: string; readonly type: 'supplier' | 'subcontractor' }[];
  readonly projects: readonly DemoFixtureProject[];
  readonly tasks: readonly { readonly title: string; readonly projectKey: string }[];
  readonly expenses: readonly DemoFixtureExpense[];
  readonly billing: readonly DemoFixtureBilling[];
  readonly documents: readonly { readonly fileName: string; readonly projectKey: string }[];
  readonly boqItems: readonly { readonly description: string; readonly projectKey: string; readonly unitPrice: string }[];
  readonly attendanceDates: readonly string[];
}

const CLIENTS = [
  { key: 'c1', name: 'לקוח לדוגמה א' },
  { key: 'c2', name: 'לקוח לדוגמה ב' },
  { key: 'c3', name: 'לקוח לדוגמה ג' },
] as const;

const EMPLOYEES = [
  { key: 'e1', name: 'עובד לדוגמה א' },
  { key: 'e2', name: 'עובד לדוגמה ב' },
  { key: 'e3', name: 'עובד לדוגמה ג' },
  { key: 'e4', name: 'עובד לדוגמה ד' },
] as const;

function money(amount: number): string {
  return amount.toFixed(2);
}

export function buildDemoFixture(profileKey: OnboardingBusinessType): DemoFixture {
  const profile = getBusinessProfile(profileKey);
  if (!profile) {
    throw new Error(`Missing business profile ${profileKey}`);
  }
  const noun = profile.terminology.project.he;
  const domain = profile.domains[0]?.nameHe ?? profile.terminology.project.he;
  const category = profile.costCategories[0]?.nameHe ?? 'עלות לדוגמה';
  const projects: DemoFixtureProject[] = [
    { key: 'p-draft', name: `${noun} בטיוטה — ${domain}`, status: 'draft', clientKey: 'c1' },
    { key: 'p-active', name: `${noun} פעיל — ${domain}`, status: 'active', clientKey: 'c1' },
    { key: 'p-hold', name: `${noun} מושהה — ${domain}`, status: 'on_hold', clientKey: 'c2' },
    { key: 'p-done', name: `${noun} שהושלם — ${domain}`, status: 'completed', clientKey: 'c3' },
  ];
  const expenseNets = [40000, 12500, 8000, 6400, 5100, 4300, 2800, 1900];
  const expenses: DemoFixtureExpense[] = expenseNets.map((net, index) => ({
    projectKey: index < 4 ? 'p-active' : index < 6 ? 'p-hold' : 'p-done',
    vendorKey: index % 2 === 0 ? 'v-supplier' : 'v-sub',
    description: `${category} ${index + 1}`,
    netAmount: money(net),
    grossAmount: money(Math.round(net * 1.18)),
    expenseDate: `2026-0${(index % 6) + 1}-15`,
  }));
  const billingNets = [180000, 42000, 15000];
  const billing: DemoFixtureBilling[] = billingNets.map((net, index) => ({
    projectKey: 'p-active',
    clientKey: 'c1',
    reference: `DEMO-${profileKey.slice(0, 8)}-${index + 1}`,
    subtotalAmount: money(net),
    totalAmount: money(Math.round(net * 1.18)),
    issueDate: `2026-03-${10 + index}`,
  }));
  return {
    profileKey,
    organizationName: `הדגמה — ${domain}`,
    clients: CLIENTS,
    employees: EMPLOYEES,
    vendors: [
      { key: 'v-supplier', name: 'ספק לדוגמה', type: 'supplier' },
      { key: 'v-sub', name: 'קבלן משנה לדוגמה', type: 'subcontractor' },
    ],
    projects,
    tasks: projects.flatMap((project, projectIndex) =>
      [1, 2].map((n) => ({
        title: `משימה ${projectIndex + 1}.${n} — ${noun}`,
        projectKey: project.key,
      })),
    ).slice(0, 6),
    expenses,
    billing,
    documents: [
      { fileName: 'תוכנית לדוגמה.pdf', projectKey: 'p-active' },
      { fileName: 'מפרט לדוגמה.pdf', projectKey: 'p-hold' },
    ],
    boqItems: [1, 2, 3].map((n) => ({
      description: `סעיף כתב כמויות ${n} — ${noun}`,
      projectKey: 'p-active',
      unitPrice: money(1200 * n),
    })),
    attendanceDates: ['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05'],
  };
}

export function activeProjectContractNet(fixture: DemoFixture): string {
  const total = fixture.billing.reduce((sum, row) => sum + Number(row.subtotalAmount), 0);
  return total.toFixed(2);
}

export function activeProjectCostNet(fixture: DemoFixture): string {
  const total = fixture.expenses
    .filter((row) => row.projectKey === 'p-active')
    .reduce((sum, row) => sum + Number(row.netAmount), 0);
  return total.toFixed(2);
}

export const DEMO_FIXTURE_KEYS = ONBOARDING_BUSINESS_TYPES;
