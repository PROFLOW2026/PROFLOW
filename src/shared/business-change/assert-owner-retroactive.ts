import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertBusinessChangeAcknowledged } from './assert-change-acknowledged';
import { isOrganizationOwner } from './org-owner';

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
