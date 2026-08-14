import type { BoqBatchStatus, BoqStatus } from './types';

export function canEditBoqBaseline(status: BoqStatus): boolean {
  return status === 'draft';
}

export function canActivateBoq(status: BoqStatus): boolean {
  return status === 'draft';
}

export function canAllocateChange(status: BoqStatus): boolean {
  return status === 'active';
}

export function canRecordProgress(status: BoqStatus): boolean {
  return status === 'active';
}

export function canEditProgressBatch(status: BoqBatchStatus): boolean {
  return status === 'draft';
}

export function canApproveProgressBatch(status: BoqBatchStatus): boolean {
  return status === 'draft';
}

export function canCreateProgressBilling(status: BoqBatchStatus): boolean {
  return status === 'approved';
}

export function isProgressHistoryLocked(status: BoqBatchStatus): boolean {
  return status === 'billed' || status === 'superseded' || status === 'voided';
}

export function canHardDeleteBoqNode(input: {
  readonly boqStatus: BoqStatus;
  readonly hasProgressHistory: boolean;
  readonly hasBillingLink: boolean;
  readonly hasChangeAllocation: boolean;
}): boolean {
  if (input.boqStatus !== 'draft') return false;
  if (input.hasProgressHistory || input.hasBillingLink || input.hasChangeAllocation) return false;
  return true;
}
