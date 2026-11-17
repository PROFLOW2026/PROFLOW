import { describe, expect, it } from 'vitest';
import {
  allocateBillingWithinContract,
  projectCapsFromContracts,
} from '@/modules/demo/fixtures/billing-envelope';
import { grossFromNet, money } from '@/modules/demo/fixtures/monthly-activity';
import type { DemoFixtureBilling, DemoFixtureContract, DemoFixturePayment } from '@/modules/demo/fixtures/fixture-builder';

function legacyRow(
  key: string,
  projectKey: string,
  net: number,
): DemoFixtureBilling {
  return {
    key,
    projectKey,
    clientKey: 'c1',
    reference: key,
    subtotalAmount: money(net),
    totalAmount: grossFromNet(net),
    issueDate: '2026-06-01',
  };
}

const caps = new Map<string, number>([
  ['p-active', 600_000],
  ['p-active-2', 200_000],
  ['p-service', 30_000],
]);

describe('allocateBillingWithinContract', () => {
  it('caps legacy and monthly billing per project CCV', () => {
    const legacy: DemoFixtureBilling[] = [
      legacyRow('b-active-1', 'p-active', 400_000),
      legacyRow('b-service-1', 'p-service', 12_500),
    ];
    const monthlyPlan = [
      {
        key: 'b-m-2026-03',
        clientKey: 'c1',
        reference: 'M-03',
        issueDate: '2026-03-05',
        paymentDate: '2026-03-18',
        paymentReference: 'REC-M-03',
        net: 500_000,
      },
      {
        key: 'b-m-2026-04',
        clientKey: 'c1',
        reference: 'M-04',
        issueDate: '2026-04-05',
        paymentDate: '2026-04-18',
        paymentReference: 'REC-M-04',
        net: 500_000,
      },
    ];

    const result = allocateBillingWithinContract({
      projectCaps: caps,
      legacyBilling: legacy,
      monthlyPlan,
      legacyPayments: [],
    });

    const billedActive = result.billing
      .filter((row) => row.projectKey === 'p-active')
      .reduce((sum, row) => sum + Number(row.subtotalAmount), 0);
    const billedService = result.billing
      .filter((row) => row.projectKey === 'p-service')
      .reduce((sum, row) => sum + Number(row.subtotalAmount), 0);

    expect(billedActive).toBeLessThanOrEqual(600_001);
    expect(billedService).toBeLessThanOrEqual(30_001);
    expect(result.billing.filter((row) => row.key.startsWith('b-m-'))).toHaveLength(2);
  });

  it('keeps monthly collections at ~70% of invoice net', () => {
    const result = allocateBillingWithinContract({
      projectCaps: caps,
      legacyBilling: [legacyRow('b-active-1', 'p-active', 100_000)],
      monthlyPlan: [
        {
          key: 'b-m-2026-05',
          clientKey: 'c1',
          reference: 'M-05',
          issueDate: '2026-05-05',
          paymentDate: '2026-05-18',
          paymentReference: 'REC-M-05',
          net: 50_000,
        },
      ],
      legacyPayments: [],
    });

    const invoice = result.billing.find((row) => row.key === 'b-m-2026-05')!;
    const payment = result.payments.find((row) => row.billingKey === 'b-m-2026-05')!;
    const billed = Number(invoice.subtotalAmount);
    const collected = Number(payment.amount);
    expect(collected).toBeLessThanOrEqual(billed + 0.01);
    expect(Math.abs(collected - billed * 0.7)).toBeLessThanOrEqual(1);
  });

  it('scales legacy billing when it exceeds CCV', () => {
    const legacy: DemoFixtureBilling[] = [legacyRow('b-active-1', 'p-active', 800_000)];
    const payments: DemoFixturePayment[] = [
      {
        billingKey: 'b-active-1',
        projectKey: 'p-active',
        clientKey: 'c1',
        amount: money(700_000),
        paymentDate: '2026-05-01',
        reference: 'REC-1',
      },
    ];

    const result = allocateBillingWithinContract({
      projectCaps: caps,
      legacyBilling: legacy,
      monthlyPlan: [],
      legacyPayments: payments,
    });

    const billed = Number(result.billing[0]!.subtotalAmount);
    const collected = Number(result.payments[0]!.amount);
    expect(billed).toBeLessThanOrEqual(600_001);
    expect(collected).toBeLessThanOrEqual(billed + 0.01);
  });
});

describe('projectCapsFromContracts', () => {
  it('maps projectKey to originalValueNet', () => {
    const contracts: DemoFixtureContract[] = [
      {
        key: 'ct-1',
        projectKey: 'p-active',
        clientKey: 'c1',
        name: 'test',
        originalValueNet: '600000.00',
        startDate: '2026-01-01',
        status: 'active',
      },
    ];
    const map = projectCapsFromContracts(contracts);
    expect(map.get('p-active')).toBe(600_000);
  });
});