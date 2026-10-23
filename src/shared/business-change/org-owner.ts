import type { OrgContext } from '@/shared/auth/context';

/** Organization owner role — full retroactive business correction authority. */
export function isOrganizationOwner(context: OrgContext): boolean {
  return context.roleKeys.includes('owner');
}
