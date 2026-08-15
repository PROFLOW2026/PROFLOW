import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

const listApBills = vi.fn();
const listActiveCreditAmountsForBills = vi.fn();
const listActiveAppliedAmountsForBills = vi.fn();

vi.mock('@/modules/ap/data/ap.repository', () => ({
  listApBills: (...args: unknown[]) => listApBills(...args),
}));

vi.mock('@/modules/ap/data/credits.repository', () => ({
  listActiveCreditAmountsForBills: (...args: unknown[]) => listActiveCreditAmountsForBills(...args),
}));

vi.mock('@/modules/ap/data/payments.repository', () => ({
  getVendorPaymentsRepository: () => ({
    listActiveAppliedAmountsForBills: (...args: unknown[]) =>
      listActiveAppliedAmountsForBills(...args),
  }),
}));

import { getVendorApOutstanding } from '@/modules/ap/application/payables';

const VENDOR_ID = '01900000-0000-7000-8000-000000000001';
const PROJECT_ID = '01900000-0000-7000-8000-000000000002';
const AGREEMENT_A = '01900000-0000-7000-8000-0000000000aa';
const AGREEMENT_B = '01900000-0000-7000-8000-0000000000bb';
const BILL_A = '01900000-0000-7000-8000-0000000000a1';
const BILL_B = '01900000-0000-7000-8000-0000000000b1';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function billRow(input: {
  id: string;
  subcontractAgreementId: string | null;
  totalAmount: string;
}) {
  return {
    id: input.id,
    vendorId: VENDOR_ID,
    vendorName: 'Masonry Co',
    projectId: PROJECT_ID,
    subcontractAgreementId: input.subcontractAgreementId,
    reference: input.id.slice(0, 8),
    status: 'open',
    dueDate: null,
    currency: 'ILS',
    totalAmount: input.totalAmount,
    retentionAmount: '0',
    retentionHeldRemaining: '0',
    archivedAt: null,
  };
}

describe('getVendorApOutstanding agreement filter', () => {
  beforeEach(() => {
    listApBills.mockReset();
    listActiveCreditAmountsForBills.mockReset();
    listActiveAppliedAmountsForBills.mockReset();

    listApBills.mockResolvedValue([
      billRow({ id: BILL_A, subcontractAgreementId: AGREEMENT_A, totalAmount: '10000.000000' }),
      billRow({ id: BILL_B, subcontractAgreementId: AGREEMENT_B, totalAmount: '4000.000000' }),
    ]);
    listActiveAppliedAmountsForBills.mockResolvedValue(new Map());
    listActiveCreditAmountsForBills.mockResolvedValue(new Map());
  });

  it('does not share totals across two agreements on the same vendor+project', async () => {
    const context = contextWith([PERMISSIONS.AP_READ]);

    const forA = await getVendorApOutstanding(context, VENDOR_ID, {
      subcontractAgreementId: AGREEMENT_A,
    });
    const forB = await getVendorApOutstanding(context, VENDOR_ID, {
      subcontractAgreementId: AGREEMENT_B,
    });
    const vendorWide = await getVendorApOutstanding(context, VENDOR_ID);

    expect(forA.bills.map((bill) => bill.billId)).toEqual([BILL_A]);
    expect(forB.bills.map((bill) => bill.billId)).toEqual([BILL_B]);
    expect(forA.billed).toBe('10000.000000');
    expect(forB.billed).toBe('4000.000000');
    expect(vendorWide.bills).toHaveLength(2);
    expect(forA.bills[0]?.subcontractAgreementId).toBe(AGREEMENT_A);
  });
});
