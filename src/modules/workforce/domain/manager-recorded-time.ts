import { DomainRuleError } from '@/shared/errors';
import type { TimeApprovalStatus } from './types';

/**
 * Employee self-service rows (linked user created the draft) must use submit → approve.
 * Manager / attendance-sync drafts may be approved without employee resubmit.
 */
export function isEmployeeSelfRecordedDraft(input: {
  readonly approvalStatus: TimeApprovalStatus;
  readonly createdByUserId: string | null;
  readonly employeeUserId: string | null;
}): boolean {
  if (input.approvalStatus !== 'draft') return false;
  if (!input.createdByUserId || !input.employeeUserId) return false;
  return input.createdByUserId === input.employeeUserId;
}

export function isManagerRecordedDraftPendingApproval(input: {
  readonly approvalStatus: TimeApprovalStatus;
  readonly createdByUserId: string | null;
  readonly employeeUserId: string | null;
}): boolean {
  if (input.approvalStatus !== 'draft') return false;
  return !isEmployeeSelfRecordedDraft(input);
}

export function canDecideTimeEntryApproval(input: {
  readonly approvalStatus: TimeApprovalStatus;
  readonly createdByUserId: string | null;
  readonly employeeUserId: string | null;
}): boolean {
  if (input.approvalStatus === 'submitted') return true;
  return isManagerRecordedDraftPendingApproval(input);
}

export function assertApprovableTimeEntryStatus(input: {
  readonly approvalStatus: TimeApprovalStatus;
  readonly createdByUserId: string | null;
  readonly employeeUserId: string | null;
}): void {
  if (canDecideTimeEntryApproval(input)) return;
  throw new DomainRuleError(
    'Only submitted time entries can be approved',
    'workforce.errors.invalidTimesheetTransition',
    { from: input.approvalStatus, to: 'approved' },
  );
}

export function approvalUpdateFromStatuses(input: {
  readonly approvalStatus: TimeApprovalStatus;
  readonly createdByUserId: string | null;
  readonly employeeUserId: string | null;
}): readonly TimeApprovalStatus[] {
  if (input.approvalStatus === 'submitted') return ['submitted'];
  if (isManagerRecordedDraftPendingApproval(input)) return ['draft'];
  return ['submitted'];
}
