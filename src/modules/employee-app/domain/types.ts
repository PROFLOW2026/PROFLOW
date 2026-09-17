import type { PermissionScope } from '@/shared/permissions/scopes';
import type { PermissionKey } from '@/shared/permissions/catalog';
import type { DocumentCategory } from '@/modules/documents/domain/categories';

export type EmployeeAppStatus = 'inactive' | 'invited' | 'active' | 'suspended' | 'blocked';

export interface EmployeeAppAccountRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly employeeId: string;
  readonly userId: string;
  readonly status: EmployeeAppStatus;
  readonly username: string;
  readonly usernameNormalized: string;
  readonly authEmail: string;
  readonly pinMustChange: boolean;
  readonly temporaryPinExpiresAt: Date | null;
  readonly firstLoginAt: Date | null;
  readonly lastLoginAt: Date | null;
  readonly accessStartsAt: Date | null;
  readonly accessEndsAt: Date | null;
  readonly disabledAt: Date | null;
  readonly failedLoginCount: number;
  readonly lockedUntil: Date | null;
}

export interface EmployeePermissionGrantRecord {
  readonly permissionKey: PermissionKey;
  readonly scope: PermissionScope;
  readonly granted: boolean;
}

export interface EmployeeAppContext {
  readonly account: EmployeeAppAccountRecord;
  readonly employeeId: string;
  readonly grants: ReadonlyMap<PermissionKey, EmployeePermissionGrantRecord>;
  readonly allowedDocumentCategories: ReadonlySet<DocumentCategory> | null;
}

export interface AuthorizeResource {
  readonly type: 'project' | 'employee' | 'document';
  readonly id: string;
  readonly documentCategory?: string | null;
}
