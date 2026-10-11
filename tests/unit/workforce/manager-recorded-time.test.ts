import { describe, expect, it } from 'vitest';
import {
  assertApprovableTimeEntryStatus,
  canDecideTimeEntryApproval,
  isEmployeeSelfRecordedDraft,
  isManagerRecordedDraftPendingApproval,
} from '@/modules/workforce/domain/manager-recorded-time';
import { DomainRuleError } from '@/shared/errors';

describe('manager-recorded time approval gate', () => {
  it('treats employee-linked creator drafts as self-reported', () => {
    expect(
      isEmployeeSelfRecordedDraft({
        approvalStatus: 'draft',
        createdByUserId: 'user-worker',
        employeeUserId: 'user-worker',
      }),
    ).toBe(true);
    expect(
      isManagerRecordedDraftPendingApproval({
        approvalStatus: 'draft',
        createdByUserId: 'user-worker',
        employeeUserId: 'user-worker',
      }),
    ).toBe(false);
  });

  it('allows manager / attendance-sync drafts without employee submit', () => {
    expect(
      isManagerRecordedDraftPendingApproval({
        approvalStatus: 'draft',
        createdByUserId: 'user-manager',
        employeeUserId: 'user-worker',
      }),
    ).toBe(true);
    expect(
      canDecideTimeEntryApproval({
        approvalStatus: 'draft',
        createdByUserId: 'user-manager',
        employeeUserId: 'user-worker',
      }),
    ).toBe(true);
  });

  it('supports legacy drafts with null createdByUserId (pre-fix rows)', () => {
    expect(
      isManagerRecordedDraftPendingApproval({
        approvalStatus: 'draft',
        createdByUserId: null,
        employeeUserId: 'user-worker',
      }),
    ).toBe(true);
  });

  it('keeps submitted path unchanged', () => {
    expect(
      canDecideTimeEntryApproval({
        approvalStatus: 'submitted',
        createdByUserId: 'user-worker',
        employeeUserId: 'user-worker',
      }),
    ).toBe(true);
  });

  it('rejects employee self draft at approval time', () => {
    expect(() =>
      assertApprovableTimeEntryStatus({
        approvalStatus: 'draft',
        createdByUserId: 'user-worker',
        employeeUserId: 'user-worker',
      }),
    ).toThrow(DomainRuleError);
  });
});
