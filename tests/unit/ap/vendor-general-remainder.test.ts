import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  classifyVendorBillGeneralRemainder,
  splitVendorBillGeneralRemainder,
  sumVendorBillGeneralRemainders,
  vendorBillGeneralRemainderAmount,
} from '@/modules/ap/domain/vendor-general-remainder';

describe('classifyVendorBillGeneralRemainder', () => {
  it('marks under-allocated when applied project lines exist', () => {
    expect(
      classifyVendorBillGeneralRemainder({
        projectId: 'p1',
        hasAppliedAllocationLines: true,
        hasAppliedProjectAllocationLines: true,
      }),
    ).toBe('under_allocated');
  });

  it('marks null-project when header is null and no applied lines', () => {
    expect(
      classifyVendorBillGeneralRemainder({
        projectId: null,
        hasAppliedAllocationLines: false,
        hasAppliedProjectAllocationLines: false,
      }),
    ).toBe('null_project');
  });

  it('does not remainder a header-project bill without allocations', () => {
    expect(
      classifyVendorBillGeneralRemainder({
        projectId: 'p1',
        hasAppliedAllocationLines: false,
        hasAppliedProjectAllocationLines: false,
      }),
    ).toBe('none');
  });

  it('keeps overhead-only applied lines in the under-allocated bucket', () => {
    expect(
      classifyVendorBillGeneralRemainder({
        projectId: null,
        hasAppliedAllocationLines: true,
        hasAppliedProjectAllocationLines: false,
      }),
    ).toBe('under_allocated');
  });
});

describe('vendorBillGeneralRemainderAmount', () => {
  it('returns NET minus applied project lines', () => {
    const remainder = vendorBillGeneralRemainderAmount({
      currency: 'ILS',
      billNetAmount: '100',
      appliedProjectAllocationAmounts: ['40', '25'],
      kind: 'under_allocated',
    });
    expect(remainder).toEqual(money('35', 'ILS'));
  });

  it('returns full NET for null-project bills', () => {
    const remainder = vendorBillGeneralRemainderAmount({
      currency: 'ILS',
      billNetAmount: '80',
      appliedProjectAllocationAmounts: [],
      kind: 'null_project',
    });
    expect(remainder).toEqual(money('80', 'ILS'));
  });

  it('scales remainder after credit Actual reductions', () => {
    const remainder = vendorBillGeneralRemainderAmount({
      currency: 'ILS',
      billNetAmount: '100',
      creditActualReductions: ['20'],
      appliedProjectAllocationAmounts: ['50'],
      kind: 'under_allocated',
    });
    // NET after credits 80; project slice scales 50 → 40; remainder 40.
    expect(remainder).toEqual(money('40', 'ILS'));
  });

  it('clamps negative remainder when lines exceed NET', () => {
    const remainder = vendorBillGeneralRemainderAmount({
      currency: 'ILS',
      billNetAmount: '10',
      appliedProjectAllocationAmounts: ['6', '6'],
      kind: 'under_allocated',
    });
    expect(remainder).toEqual(money('0', 'ILS'));
  });

  it('returns zero for header-attributed bills', () => {
    const remainder = vendorBillGeneralRemainderAmount({
      currency: 'ILS',
      billNetAmount: '100',
      appliedProjectAllocationAmounts: [],
      kind: 'none',
    });
    expect(remainder).toEqual(money('0', 'ILS'));
  });
});

describe('sumVendorBillGeneralRemainders', () => {
  it('splits under-NET and null-project into conserved buckets', () => {
    const totals = sumVendorBillGeneralRemainders(
      [
        {
          currency: 'ILS',
          projectId: 'p1',
          billNetAmount: '100',
          appliedProjectAllocationAmounts: ['70'],
          hasAppliedAllocationLines: true,
          hasAppliedProjectAllocationLines: true,
        },
        {
          currency: 'ILS',
          projectId: null,
          billNetAmount: '25',
          appliedProjectAllocationAmounts: [],
          hasAppliedAllocationLines: false,
          hasAppliedProjectAllocationLines: false,
        },
        {
          currency: 'ILS',
          projectId: 'p2',
          billNetAmount: '50',
          appliedProjectAllocationAmounts: [],
          hasAppliedAllocationLines: false,
          hasAppliedProjectAllocationLines: false,
        },
      ],
      'ILS',
    );

    expect(totals.remainderFromUnderAllocatedBills).toEqual(money('30', 'ILS'));
    expect(totals.remainderFromNullProjectBills).toEqual(money('25', 'ILS'));
    expect(totals.totalGeneralRemainder).toEqual(money('55', 'ILS'));
  });

  it('conserves NET = project slices + remainder for an under-allocated bill', () => {
    const billNet = '100';
    const projectSlices = ['40', '35'];
    const { remainder } = splitVendorBillGeneralRemainder({
      currency: 'ILS',
      projectId: 'p1',
      billNetAmount: billNet,
      appliedProjectAllocationAmounts: projectSlices,
      hasAppliedAllocationLines: true,
      hasAppliedProjectAllocationLines: true,
    });
    const allocated = 40 + 35;
    expect(Number(remainder.amount) + allocated).toBe(100);
  });
});
