import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import type { PermissionKey } from './catalog';
import { assertPermission, hasPermission } from './assert';
import type { PermissionScope } from './scopes';
import type { AuthorizeResource, DocumentAccessInput } from './types';

export interface AuthorizeRequest {
  readonly permission: PermissionKey;
  readonly scope?: PermissionScope;
  readonly resource?: AuthorizeResource;
}

// ─── Inline helpers (were @/modules/employee-app/application/load-employee-app-context) ──
// The shared layer must never depend on a feature module, so the two
// trivial employee-app predicates are inlined here rather than imported.

/** Returns true when the OrgContext belongs to an Employee App session. */
function isEmployeeAppUser(context: OrgContext): boolean {
  return context.roleKeys.includes('employee') && Boolean(context.employeeApp);
}

/**
 * Returns true when the caller (who may be an employee app user) holds
 * `permission` in their effective permission set.
 */
function employeeHasPermission(context: OrgContext, permission: PermissionKey): boolean {
  return context.permissions.has(permission);
}

// ─── Central authorization gate ───────────────────────────────────────────────

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
      const { assertEmployeeProjectScope } = await import(
        '@/modules/employee-app/application/project-scope'
      );
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
    const { assertCanReadDocumentForEmployee } = await import(
      '@/modules/employee-app/application/document-access'
    );
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
