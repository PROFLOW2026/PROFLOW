import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { DraftKind } from './types';

/** Kind-specific read keys. SELECT also allows the matching write key. */
export const DRAFT_KIND_READ_PERMISSION: Record<DraftKind, PermissionKey> = {
  expense: PERMISSIONS.EXPENSES_READ,
  vendor_bill: PERMISSIONS.AP_READ,
  billing_record: PERMISSIONS.BILLING_READ,
};

/** RLS INSERT/UPDATE/DELETE + run INSERT: expenses.create / ap.manage / billing.manage */
export const DRAFT_KIND_WRITE_PERMISSION: Record<DraftKind, PermissionKey> = {
  expense: PERMISSIONS.EXPENSES_CREATE,
  vendor_bill: PERMISSIONS.AP_MANAGE,
  billing_record: PERMISSIONS.BILLING_MANAGE,
};

export const ANY_DRAFT_READ_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.AP_READ,
  PERMISSIONS.BILLING_READ,
];

export const ANY_DRAFT_WRITE_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.EXPENSES_CREATE,
  PERMISSIONS.AP_MANAGE,
  PERMISSIONS.BILLING_MANAGE,
];

/** RLS SELECT and nav: read OR the generate/create permission for that kind. */
export const ANY_DRAFT_ACCESS_PERMISSIONS: readonly PermissionKey[] = [
  ...ANY_DRAFT_READ_PERMISSIONS,
  ...ANY_DRAFT_WRITE_PERMISSIONS,
];

export function readableDraftKinds(context: OrgContext): DraftKind[] {
  return (Object.keys(DRAFT_KIND_READ_PERMISSION) as DraftKind[]).filter((kind) =>
    canReadDraftKind(context, kind),
  );
}

export function writableDraftKinds(context: OrgContext): DraftKind[] {
  return (Object.keys(DRAFT_KIND_WRITE_PERMISSION) as DraftKind[]).filter((kind) =>
    hasPermission(context, DRAFT_KIND_WRITE_PERMISSION[kind]),
  );
}

export function canReadDraftKind(context: OrgContext, kind: DraftKind): boolean {
  return (
    hasPermission(context, DRAFT_KIND_READ_PERMISSION[kind]) ||
    hasPermission(context, DRAFT_KIND_WRITE_PERMISSION[kind])
  );
}

export function canManageDraftKind(context: OrgContext, kind: DraftKind): boolean {
  return hasPermission(context, DRAFT_KIND_WRITE_PERMISSION[kind]);
}

export function assertCanReadDraftKind(context: OrgContext, kind: DraftKind): void {
  if (!canReadDraftKind(context, kind)) {
    throw new AuthorizationError(
      `${DRAFT_KIND_READ_PERMISSION[kind]} | ${DRAFT_KIND_WRITE_PERMISSION[kind]}`,
    );
  }
}

export function assertCanManageDraftKind(context: OrgContext, kind: DraftKind): void {
  assertPermission(context, DRAFT_KIND_WRITE_PERMISSION[kind]);
}

export function assertCanReadAnyDraft(context: OrgContext): void {
  if (readableDraftKinds(context).length === 0) {
    throw new AuthorizationError(ANY_DRAFT_ACCESS_PERMISSIONS.join(' | '));
  }
}
