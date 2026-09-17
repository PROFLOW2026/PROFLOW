import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import type { PermissionKey } from './catalog';
import { assertPermission, hasPermission } from './assert';
import type { PermissionScope } from './scopes';
import {
  employeeHasPermission,
  isEmployeeAppUser,
} from '@/modules/employee-app/application/load-employee-app-context';
import { assertEmployeeProjectScope } from '@/modules/employee-app/application/project-scope';
import {
  assertCanReadDocumentForEmployee,
  type DocumentAccessInput,
} from '@/modules/employee-app/application/document-access';
import type { AuthorizeResource } from '@/modules/employee-app/domain/types';

export interface AuthorizeRequest {
  readonly permission: PermissionKey;
  readonly scope?: PermissionScope;
  readonly resource?: AuthorizeResource;
}

/**
 * Central employee-aware authorization gate.
 * Non-employee users fall through to standard permission + project checks.
 */
export async function authorize(context: OrgContext, request: AuthorizeRequest): Promise<void> {
  const permitted =
    hasPermission(context, request.permission) ||
    (isEmployeeAppUser(context) && employeeHasPermission(context, request.permission));

  if (!permitted) throw new AuthorizationError(request.permission);

  if (!request.resource) return;

  if (request.resource.type === 'project') {
    if (isEmployeeAppUser(context)) {
      await assertEmployeeProjectScope(
        context,
        request.permission as typeof request.permission,
        request.resource.id,
        request.scope ?? null,
      );
    } else {
      const { assertCanAccessProject } = await import(
        '@/modules/projects/application/project-access'
      );
      await assertCanAccessProject(context, request.resource.id);
    }
    return;
  }

  if (request.resource.type === 'document') {
    await assertCanReadDocumentForEmployee(context, {
      documentId: request.resource.id,
      category: request.resource.documentCategory ?? null,
      projectIds: [],
    } satisfies DocumentAccessInput);
    return;
  }

  if (request.resource.type === 'employee') {
    if (
      isEmployeeAppUser(context) &&
      context.employeeApp?.employeeId !== request.resource.id
    ) {
      assertPermission(context, request.permission);
    }
  }
}

/** Convenience wrapper preserving existing assertPermission call sites. */
export function requirePermission(context: OrgContext, permission: PermissionKey): void {
  if (isEmployeeAppUser(context)) {
    if (!employeeHasPermission(context, permission) && !hasPermission(context, permission)) {
      throw new AuthorizationError(permission);
    }
    return;
  }
  assertPermission(context, permission);
}
