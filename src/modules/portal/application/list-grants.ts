import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { listCustomerGrantsForOrg } from '../data/portal.repository';
import type { ExternalAccessGrantListItem } from '../domain/types';

export async function listCustomerGrants(
  context: OrgContext,
): Promise<ExternalAccessGrantListItem[]> {
  assertPermission(context, PERMISSIONS.PORTAL_MANAGE);
  return listCustomerGrantsForOrg(context.organizationId);
}
