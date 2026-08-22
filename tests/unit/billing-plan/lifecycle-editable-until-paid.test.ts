import { describe, expect, it } from 'vitest';
import {
  assertCannotReduceBelowPaid,
  assertCycleEditable,
  isCycleEditable,
  resolveApprovalStatus,
} from '@/modules/billing-plan/domain/lifecycle';
import {
  cumulativeApproved,
  remainingAfterApproved,
  resolveApprovalSlice,
  retentionOnApproved,
  unapprovedAmount,
} from '@/modules/billing-plan/domain/approval-math';
import { money } from '@/shared/money';
import { DomainRuleError } from '@/shared/errors';

describe('billing plan lifecycle — editable until paid', () => {
  it('allows submitted / approved unpaid edits', () => {
    for (const status of ['draft', 'ready', 'submitted', 'partially_approved', 'approved'] as const) {
      expect(
        isCycleEditable({
          status,
          fullyPaid: false,
          paidAmount: '0',
          approvedTotal: '100',
          currency: 'ILS',
        }),
      ).toBe(true);
    }
  });

  it('blocks void and fully paid', () => {
    expect(
      isCycleEditable({
        status: 'submitted',
        fullyPaid: true,
        paidAmount: '100',
        approvedTotal: '100',
        currency: 'ILS',
      }),
    ).toBe(false);
    expect(() =>
      assertCycleEditable({
        status: 'void',
        fullyPaid: false,
        paidAmount: '0',
        approvedTotal: '0',
        currency: 'ILS',
      }),
    ).toThrow(DomainRuleError);
  });

  it('blocks reducing approved below paid', () => {
    expect(() =>
      assertCannotReduceBelowPaid({
        paidAmount: '40',
        approvedTotal: '30',
        currency: 'ILS',
      }),
    ).toThrow(/cannotReduceBelowPaid|below paid/i);

    expect(() =>
      assertCannotReduceBelowPaid({
        paidAmount: '40',
        approvedTotal: '90',
        currency: 'ILS',
      }),
    ).not.toThrow();
  });
});

describe('partial approval math', () => {
  it('preserves unapproved remainder and cumulative uses approved only', () => {
    const base = money('200000', 'ILS');
    const prior = money('50000', 'ILS');
    const requested = money('100000', 'ILS');
    const slice = resolveApprovalSlice({
      base,
      priorApproved: prior,
      requestedAmount: requested,
      approvedAmount: '80000',
    });

    expect(slice.approvedAmount.amount).toBe('80000.000000');
    expect(unapprovedAmount(requested, slice.approvedAmount).amount).toBe('20000.000000');
    expect(slice.cumulativeApproved.amount).toBe('130000.000000');
    expect(slice.remainingAmount.amount).toBe('70000.000000');
  });

  it('prior 30 + request 30 approve 20 → cumulative 50 not 60', () => {
    const base = money('100000', 'ILS');
    const prior = money('30000', 'ILS');
    const requested = money('30000', 'ILS');
    const slice = resolveApprovalSlice({
      base,
      priorApproved: prior,
      requestedAmount: requested,
      approvedAmount: '20000',
    });
    expect(cumulativeApproved(prior, slice.approvedAmount).amount).toBe('50000.000000');
    expect(remainingAfterApproved(base, slice.cumulativeApproved).amount).toBe('50000.000000');
  });

  it('retention applies to approved amount', () => {
    const retention = retentionOnApproved({
      approvedAmount: money('80000', 'ILS'),
      retentionPercent: '5',
    });
    expect(retention.amount).toBe('4000.000000');
  });

  it('resolveApprovalStatus distinguishes partial vs full', () => {
    expect(
      resolveApprovalStatus({
        currency: 'ILS',
        lines: [
          { requestedAmount: '100', approvedAmount: '80' },
          { requestedAmount: '50', approvedAmount: '50' },
        ],
      }),
    ).toBe('partially_approved');

    expect(
      resolveApprovalStatus({
        currency: 'ILS',
        lines: [
          { requestedAmount: '100', approvedAmount: '100' },
          { requestedAmount: '50', approvedAmount: '50' },
        ],
      }),
    ).toBe('approved');
  });
});
