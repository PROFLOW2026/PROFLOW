import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { closedPeriodSourceRewriteError } from '@/modules/month-close/domain/period-state';
import { assertBusinessChangeAcknowledged } from './assert-change-acknowledged';
import { isOrganizationOwner } from './org-owner';

/** Operational month state. A ready month is not a lock. */
export type ClosedMonthEditStatus = 'open' | 'ready' | 'closed';

export type ClosedMonthSourceEditDecision =
  | 'proceed'
  | 'reject-non-owner'
  | 'reject-acknowledgement';

/**
 * Closed months: only the organization owner, and only after explicit confirmation.
 * Open and ready months proceed. service_role is not an owner — pass
 * isOrganizationOwner(context), which checks the owner role key only.
 */
export function decideClosedMonthSourceEdit(input: {
  readonly monthStatus: ClosedMonthEditStatus;
  readonly isOwner: boolean;
  readonly changeAcknowledged: boolean | undefined;
}): ClosedMonthSourceEditDecision {
  if (input.monthStatus !== 'closed') return 'proceed';
  if (!input.isOwner) return 'reject-non-owner';
  if (input.changeAcknowledged !== true) return 'reject-acknowledgement';
  return 'proceed';
}

/** The economic date stays the business date. updated_at is audit metadata. */
export function retainBusinessDate(businessDate: string, _updatedAt: Date | string): string {
  return businessDate;
}

/**
 * Reject before any write.
 * Non-owners receive the existing Hebrew closed-period domain error.
 * Owners without acknowledgement receive the confirm-required validation error.
 */
export function assertClosedMonthSourceEditAllowed(
  input: {
    readonly monthStatus: ClosedMonthEditStatus;
    readonly isOwner: boolean;
    readonly changeAcknowledged: boolean | undefined;
  },
  confirmMessageKey = 'errors.confirmRequired',
): void {
  const decision = decideClosedMonthSourceEdit(input);
  if (decision === 'proceed') return;
  if (decision === 'reject-non-owner') {
    throw closedPeriodSourceRewriteError();
  }
  assertBusinessChangeAcknowledged(undefined, confirmMessageKey);
}

/** Runs the write only after the closed-month decision, and keeps the business date. */
export function commitClosedMonthSourceEdit<T>(input: {
  readonly monthStatus: ClosedMonthEditStatus;
  readonly isOwner: boolean;
  readonly changeAcknowledged: boolean | undefined;
  readonly businessDate: string;
  readonly updatedAt: Date;
  readonly confirmMessageKey?: string;
  readonly write: (persistedBusinessDate: string) => T;
}): T {
  assertClosedMonthSourceEditAllowed(input, input.confirmMessageKey);
  return input.write(retainBusinessDate(input.businessDate, input.updatedAt));
}

export async function assertClosedMonthSourceEdit(
  context: OrgContext,
  yearMonth: string,
  changeAcknowledged: boolean | undefined,
  confirmMessageKey = 'errors.confirmRequired',
): Promise<void> {
  const { isMonthClosed } = await import('@/modules/month-close/application/manage-periods');
  const closed = await isMonthClosed(context, yearMonth);
  assertClosedMonthSourceEditAllowed(
    {
      monthStatus: closed ? 'closed' : 'open',
      isOwner: isOrganizationOwner(context),
      changeAcknowledged,
    },
    confirmMessageKey,
  );
}

export function assertOwnerRetroactiveBusinessChange(
  context: OrgContext,
  changeAcknowledged: boolean | undefined,
  ownerOnlyMessageKey = 'errors.ownerOnlyRetroactiveEdit',
): void {
  if (!isOrganizationOwner(context)) {
    throw new DomainRuleError(
      'Only the organization owner may apply retroactive business corrections',
      ownerOnlyMessageKey,
    );
  }
  assertBusinessChangeAcknowledged(changeAcknowledged);
}
