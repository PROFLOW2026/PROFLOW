import { describe, expect, it } from 'vitest';
import { demoDay } from '@/modules/demo/domain/session-clock';
import {
  buildDemoFixture,
  collectFixtureDateStrings,
  DEMO_FIXTURE_KEYS,
  type DemoFixture,
} from '@/modules/demo/fixtures/fixture-builder';
import { PROFILE_BLUEPRINTS } from '@/modules/demo/fixtures/profile-blueprints';

const FIXTURE_ANCHOR = new Date('2026-01-15T22:30:00Z');

const RESET_MARKETING = /איפוס|מחזור לילה|nightly\s*reset|reset\s*hour/i;
const REAL_BRAND_HINTS =
  /עזריאלי|שיבא|מלונות דן|רשת מלונות דן|מפעלי חשמל לפוט|גוגל|מיקרוסופט|אפל|שטראוס|בנק לאומי|בנק הפועלים/i;

function allowedSessionDates(anchor: Date): Set<string> {
  const set = new Set<string>();
  for (let offset = -400; offset <= 200; offset += 1) {
    set.add(demoDay(anchor, offset));
  }
  return set;
}

function vatWithinOneAgora(net: string, gross: string): void {
  const expected = Math.round(Number(net) * 1.18 * 100) / 100;
  expect(Math.abs(Number(gross) - expected)).toBeLessThanOrEqual(0.01);
}

function assertKnownParties(fixture: DemoFixture): void {
  const projectKeys = new Set(fixture.projects.map((row) => row.key));
  const clientKeys = new Set(fixture.clients.map((row) => row.key));
  const vendorKeys = new Set(fixture.vendors.map((row) => row.key));
  const billingTotals = new Map(fixture.billing.map((row) => [row.key, Number(row.totalAmount)]));
  const paidByBilling = new Map<string, number>();

  for (const row of fixture.expenses) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
    expect(vendorKeys.has(row.vendorKey)).toBe(true);
    vatWithinOneAgora(row.netAmount, row.grossAmount);
  }
  for (const row of fixture.billing) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
    expect(clientKeys.has(row.clientKey)).toBe(true);
    vatWithinOneAgora(row.subtotalAmount, row.totalAmount);
  }
  for (const row of fixture.vendorBills) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
    expect(vendorKeys.has(row.vendorKey)).toBe(true);
    vatWithinOneAgora(row.netAmount, row.grossAmount);
    if (row.paidGross) {
      expect(Number(row.paidGross)).toBeLessThanOrEqual(Number(row.grossAmount) + 0.01);
    }
  }
  for (const row of fixture.payments) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
    expect(clientKeys.has(row.clientKey)).toBe(true);
    const billed = billingTotals.get(row.billingKey) ?? 0;
    const running = (paidByBilling.get(row.billingKey) ?? 0) + Number(row.amount);
    expect(running).toBeLessThanOrEqual(billed + 0.01);
    paidByBilling.set(row.billingKey, running);
  }
  for (const row of fixture.contracts) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
    expect(clientKeys.has(row.clientKey)).toBe(true);
  }
  for (const row of fixture.tasks) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
  }
  for (const row of fixture.timeEntries) {
    expect(projectKeys.has(row.projectKey)).toBe(true);
    expect(fixture.employees.some((employee) => employee.key === row.employeeKey)).toBe(true);
  }
}

function assertNoResetMarketing(fixture: DemoFixture): void {
  const strings: string[] = [
    fixture.organizationName,
    ...fixture.clients.map((row) => row.name),
    ...fixture.employees.map((row) => row.name),
    ...fixture.vendors.map((row) => row.name),
    ...fixture.projects.map((row) => row.name),
    ...fixture.tasks.map((row) => row.title),
    ...fixture.expenses.map((row) => row.description),
    ...fixture.documents.map((row) => row.fileName),
    ...fixture.boqItems.map((row) => row.description),
  ];
  for (const value of strings) {
    expect(value).not.toMatch(RESET_MARKETING);
    expect(value).not.toMatch(REAL_BRAND_HINTS);
  }
}

function monthBuckets(dates: readonly string[]): Set<string> {
  return new Set(dates.map((value) => value.slice(0, 7)));
}

describe('demo fixture richness', () => {
  const allowedDates = allowedSessionDates(FIXTURE_ANCHOR);

  it('covers all 20 onboarding business types with unique blueprints', () => {
    expect(DEMO_FIXTURE_KEYS).toHaveLength(20);
    expect(Object.keys(PROFILE_BLUEPRINTS)).toHaveLength(20);
    const orgNames = new Set(DEMO_FIXTURE_KEYS.map((key) => PROFILE_BLUEPRINTS[key].organizationName));
    expect(orgNames.size).toBe(20);
    const activeProjectNames = new Set(
      DEMO_FIXTURE_KEYS.map((key) => PROFILE_BLUEPRINTS[key].projects.find((row) => row.key === 'p-active')!.name),
    );
    expect(activeProjectNames.size).toBe(20);
  });

  it.each(DEMO_FIXTURE_KEYS)('profile %s looks like an operating company', (profileKey) => {
    const fixture = buildDemoFixture(profileKey, FIXTURE_ANCHOR);

    expect(fixture.projects.length).toBeGreaterThanOrEqual(8);
    expect(fixture.clients.length).toBeGreaterThanOrEqual(5);
    expect(fixture.employees.length).toBeGreaterThanOrEqual(6);
    expect(fixture.vendors.length).toBeGreaterThanOrEqual(5);
    expect(fixture.tasks.length).toBeGreaterThanOrEqual(20);
    expect(fixture.expenses.length).toBeGreaterThanOrEqual(16);
    expect(fixture.billing.length).toBeGreaterThanOrEqual(10);
    expect(fixture.contracts.length).toBeGreaterThanOrEqual(3);
    expect(fixture.payments.length).toBeGreaterThanOrEqual(8);
    expect(fixture.vendorBills.length).toBeGreaterThanOrEqual(5);
    expect(fixture.timeEntries.length).toBeGreaterThanOrEqual(16);
    expect(fixture.attendanceDates.length).toBeGreaterThanOrEqual(12);
    expect(fixture.notifications.length).toBeGreaterThanOrEqual(3);
    expect(fixture.tasks.some((row) => row.status === 'done')).toBe(true);
    expect(fixture.tasks.some((row) => row.status === 'todo' || row.status === 'in_progress')).toBe(true);
    expect(fixture.tasks.some((row) => row.dueDate && row.dueDate < fixture.anchorDay && row.status !== 'done')).toBe(
      true,
    );
    expect(fixture.expenses.some((row) => row.paymentStatus === 'paid')).toBe(true);
    expect(fixture.expenses.some((row) => row.paymentStatus !== 'paid')).toBe(true);
    expect(fixture.vendorBills.some((row) => row.status === 'open')).toBe(true);
    expect(fixture.projects.some((row) => row.status === 'completed')).toBe(true);
    expect(fixture.projects.some((row) => row.status === 'active')).toBe(true);

    const activityDates = [
      ...fixture.expenses.map((row) => row.expenseDate),
      ...fixture.billing.map((row) => row.issueDate),
      ...fixture.payments.map((row) => row.paymentDate),
      ...fixture.timeEntries.map((row) => row.workDate),
    ];
    expect(monthBuckets(activityDates).size).toBeGreaterThanOrEqual(5);

    assertKnownParties(fixture);
    assertNoResetMarketing(fixture);

    for (const date of collectFixtureDateStrings(fixture)) {
      expect(allowedDates.has(date)).toBe(true);
    }
    expect(fixture.anchorDay).toBe(demoDay(FIXTURE_ANCHOR, 0));
  });

  it('keeps money scales differentiated across trades', () => {
    const electrical = buildDemoFixture('ELECTRICAL', FIXTURE_ANCHOR);
    const cleaning = buildDemoFixture('CLEANING', FIXTURE_ANCHOR);
    const developer = buildDemoFixture('REAL_ESTATE_DEVELOPMENT', FIXTURE_ANCHOR);
    expect(Number(electrical.billing[0]!.subtotalAmount)).toBeGreaterThan(Number(cleaning.billing[0]!.subtotalAmount));
    expect(Number(developer.billing[0]!.subtotalAmount)).toBeGreaterThan(Number(electrical.billing[0]!.subtotalAmount));
  });
});
