import { describe, expect, it } from 'vitest';
import { demoDay } from '@/modules/demo/domain/session-clock';
import {
  buildDemoFixture,
  collectFixtureDateStrings,
  DEMO_FIXTURE_KEYS,
  type DemoFixture,
} from '@/modules/demo/fixtures/fixture-builder';

const FIXTURE_ANCHOR = new Date('2026-01-15T22:30:00Z');

const RESET_MARKETING = /איפוס|מחזור לילה|nightly\s*reset|reset\s*hour/i;

function allowedSessionDates(anchor: Date): Set<string> {
  const set = new Set<string>();
  for (let offset = -400; offset <= 60; offset += 1) {
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
  }
}

describe('demo fixture richness', () => {
  const allowedDates = allowedSessionDates(FIXTURE_ANCHOR);

  it.each(DEMO_FIXTURE_KEYS)('profile %s looks like an operating company', (profileKey) => {
    const fixture = buildDemoFixture(profileKey, FIXTURE_ANCHOR);

    expect(fixture.projects.length).toBeGreaterThanOrEqual(6);
    expect(fixture.clients.length).toBeGreaterThanOrEqual(4);
    expect(fixture.employees.length).toBeGreaterThanOrEqual(6);
    expect(fixture.vendors.length).toBeGreaterThanOrEqual(4);
    expect(fixture.tasks.length).toBeGreaterThan(0);
    expect(fixture.expenses.length).toBeGreaterThan(0);
    expect(fixture.billing.length).toBeGreaterThan(0);
    expect(fixture.contracts.length).toBeGreaterThan(0);
    expect(fixture.payments.length).toBeGreaterThan(0);
    expect(fixture.vendorBills.length).toBeGreaterThan(0);
    expect(fixture.timeEntries.length).toBeGreaterThan(0);
    expect(fixture.tasks.some((row) => row.status !== 'todo')).toBe(true);

    assertKnownParties(fixture);
    assertNoResetMarketing(fixture);

    for (const date of collectFixtureDateStrings(fixture)) {
      expect(allowedDates.has(date)).toBe(true);
    }
    expect(fixture.anchorDay).toBe(demoDay(FIXTURE_ANCHOR, 0));
  });
});