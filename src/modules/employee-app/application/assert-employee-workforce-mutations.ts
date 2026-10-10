import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import type { PermissionKey } from '@/shared/permissions/catalog';
import {
  employeeHasPermission,
  isEmployeeAppUser,
} from './load-employee-app-context';
import { assertEmployeeAppContext } from './session-guard';

/** When the session is on the Employee App plane, enforce account + grant before time mutations. */
export async function assertEmployeeAppMutationGrant(
  context: OrgContext,
  permission: PermissionKey,
): Promise<void> {
  if (!isEmployeeAppUser(context)) return;
  await assertEmployeeAppContext(context);
  if (!employeeHasPermission(context, permission)) {
    throw new AuthorizationError(permission);
  }
}
