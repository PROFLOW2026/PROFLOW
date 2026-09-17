import 'server-only';

import { eq } from 'drizzle-orm';
import { organizationMemberships } from '@drizzle/schema';
import { revalidateTag } from 'next/cache';
import type { OrgContext } from '@/shared/auth/context';
import { orgAuthzCacheTag } from '@/shared/auth/cached-authz';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/shared/supabase/admin';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { findActiveMembership, insertMembership } from '@/modules/tenancy';
import { ensureRoleAssigned, findRoleByKey } from '@/modules/rbac';
import { findEmployeeById, updateEmployeeById } from '@/modules/workforce';
import {
  findEmployeeAppAccountByEmployeeId,
  findEmployeeAppAccountSealedPinByEmployeeId,
  insertEmployeeAppAccount,
  updateEmployeeAppAccount,
} from '../data/accounts.repository';
import { resolveShareableCredentials } from './shareable-credentials';
import { sealTemporaryPin } from '../domain/temporary-pin-seal';
import {
  deleteEmployeePermissionGrants,
  replaceEmployeeDocumentCategoryGrants,
  upsertEmployeePermissionGrant,
} from '../data/grants.repository';
import { insertEmployeeAppAuditEvent } from '../data/audit.repository';
import { buildEmployeeAuthEmail } from '../domain/username';
import { allocateGloballyUniqueUsername } from './allocate-username';
import { employeeSupabaseAuthPassword } from '../domain/auth-password';
import { generateTemporaryPin, pinExpiryFromNow } from '../domain/pin';
import { employeePreset, type EmployeePresetKey } from './presets';
import type { PermissionScope } from '@/shared/permissions/scopes';
import type { PermissionKey } from '@/shared/permissions/catalog';
import type { DocumentCategory } from '@/modules/documents/domain/categories';

export interface ActivateEmployeeAppResult {
  readonly accountId: string;
  readonly username: string;
  readonly temporaryPin: string;
  readonly temporaryPinExpiresAt: Date;
  readonly loginPath: string;
}

async function assertWorkforceManage(context: OrgContext): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
}

/** Cache invalidation is best-effort outside a Next.js request (scripts/tests only). */
function safeRevalidateAuthzCache(userId: string, organizationId: string): void {
  try {
    revalidateTag(orgAuthzCacheTag(userId, organizationId), 'max');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes('static generation store missing') ||
      message.includes('outside a request scope')
    ) {
      return;
    }
    throw error;
  }
}

async function provisionSupabaseUser(authEmail: string, pin: string): Promise<string> {
  if (!isSupabaseAdminConfigured()) {
    throw new DomainRuleError('Supabase admin is not configured', 'employeeApp.errors.notConfigured');
  }
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: authEmail,
    password: employeeSupabaseAuthPassword(pin),
    email_confirm: true,
    user_metadata: { employee_app: true },
  });
  if (error || !data.user) {
    throw new DomainRuleError(
      error?.message ?? 'Failed to create auth user',
      'employeeApp.errors.provisionFailed',
    );
  }
  return data.user.id;
}

async function setSupabasePassword(userId: string, pin: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: employeeSupabaseAuthPassword(pin),
  });
  if (error) {
    throw new DomainRuleError(error.message, 'employeeApp.errors.pinUpdateFailed');
  }
}

async function revokeSupabaseSessions(userId: string): Promise<void> {
  if (!isSupabaseAdminConfigured()) return;
  const admin = getSupabaseAdminClient();
  await admin.auth.admin.signOut(userId, 'global');
}

async function ensureEmployeeMembershipAndRole(
  context: OrgContext,
  userId: string,
  isNewUser: boolean,
): Promise<void> {
  let membership = await findActiveMembership(context.db, context.organizationId, userId);
  if (!membership) {
    membership = await insertMembership(context.db, {
      organizationId: context.organizationId,
      userId,
      status: 'active',
    });
  }

  if (!isNewUser) return;

  const employeeRole = await findRoleByKey(context.db, context.organizationId, 'employee');
  if (!employeeRole) {
    throw new DomainRuleError('Employee role is missing', 'employeeApp.errors.roleMissing');
  }
  await ensureRoleAssigned(context.db, {
    organizationId: context.organizationId,
    membershipId: membership.id,
    userId,
    roleId: employeeRole.id,
  });
}

export async function activateEmployeeAppAccess(
  context: OrgContext,
  input: {
    employeeId: string;
    username?: string;
    presetKey?: EmployeePresetKey;
  },
): Promise<ActivateEmployeeAppResult> {
  await assertWorkforceManage(context);

  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee) throw new NotFoundError('Employee');

  const existing = await findEmployeeAppAccountByEmployeeId(
    context.db,
    context.organizationId,
    input.employeeId,
  );
  if (existing && existing.status !== 'inactive') {
    throw new DomainRuleError(
      'Employee app access is already active',
      'employeeApp.errors.alreadyActive',
    );
  }

  const allocated = await allocateGloballyUniqueUsername(context.db, {
    employeeName: employee.name,
    employeeNumber: employee.employeeNumber ?? null,
    requestedUsername: input.username,
    exceptAccountId: existing?.id,
  });
  const usernameRaw = allocated.username;
  const usernameCheck = { valid: true as const, normalized: allocated.normalized };

  const temporaryPin = generateTemporaryPin();
  const temporaryPinExpiresAt = pinExpiryFromNow();

  let userId = employee.userId;
  let authEmail: string;

  if (!userId) {
    authEmail = buildEmployeeAuthEmail(context.organizationId, usernameCheck.normalized);
    userId = await provisionSupabaseUser(authEmail, temporaryPin);
    await ensureProfile(context.db, {
      id: userId,
      email: authEmail,
      displayName: employee.name,
      localePreference: context.locale,
    });
    await ensureEmployeeMembershipAndRole(context, userId, true);
    await updateEmployeeById(context.db, context.organizationId, employee.id, { userId });
  } else {
    const profile = await ensureProfile(context.db, {
      id: userId,
      email: buildEmployeeAuthEmail(context.organizationId, usernameCheck.normalized),
      displayName: employee.name,
      localePreference: context.locale,
    });
    authEmail = profile.email;
    await setSupabasePassword(userId, temporaryPin);
    await ensureEmployeeMembershipAndRole(context, userId, false);
  }

  const account =
    existing ??
    (await insertEmployeeAppAccount(context.db, {
      organizationId: context.organizationId,
      employeeId: employee.id,
      userId,
      username: usernameRaw.toUpperCase(),
      usernameNormalized: usernameCheck.normalized,
      authEmail,
      status: 'invited',
      pinMustChange: true,
      temporaryPinExpiresAt,
      temporaryPinSealed: sealTemporaryPin(temporaryPin),
      createdByUserId: context.userId,
    }));

  await updateEmployeeAppAccount(context.db, context.organizationId, account.id, {
    status: 'invited',
    username: usernameRaw.toUpperCase(),
    usernameNormalized: usernameCheck.normalized,
    pinMustChange: true,
    temporaryPinExpiresAt,
    temporaryPinSealed: sealTemporaryPin(temporaryPin),
    disabledAt: null,
    failedLoginCount: 0,
    lockedUntil: null,
  });

  const preset = employeePreset(input.presetKey ?? 'field_worker');
  await deleteEmployeePermissionGrants(context.db, context.organizationId, employee.id);
  for (const grant of preset.grants) {
    await upsertEmployeePermissionGrant(context.db, {
      organizationId: context.organizationId,
      employeeId: employee.id,
      permissionKey: grant.permissionKey,
      scope: grant.scope,
      granted: true,
      grantedByUserId: context.userId,
    });
  }
  const categoryMap = new Map<DocumentCategory, boolean>(
    preset.documentCategories.map((category) => [category, true]),
  );
  await replaceEmployeeDocumentCategoryGrants(
    context.db,
    context.organizationId,
    employee.id,
    categoryMap,
    context.userId,
  );

  await insertEmployeeAppAuditEvent(context.db, {
    organizationId: context.organizationId,
    employeeId: employee.id,
    actorUserId: context.userId,
    action: 'activated',
    detailJson: { username: usernameRaw.toUpperCase(), preset: preset.key },
  });

  safeRevalidateAuthzCache(userId, context.organizationId);

  return {
    accountId: account.id,
    username: usernameRaw.toUpperCase(),
    temporaryPin,
    temporaryPinExpiresAt,
    loginPath: `/${context.locale}/employee/login?u=${encodeURIComponent(usernameRaw)}`,
  };
}

export async function updateEmployeeAppStatus(
  context: OrgContext,
  employeeId: string,
  status: 'suspended' | 'blocked' | 'active' | 'inactive',
): Promise<void> {
  await assertWorkforceManage(context);
  const account = await findEmployeeAppAccountByEmployeeId(
    context.db,
    context.organizationId,
    employeeId,
  );
  if (!account) throw new NotFoundError('Employee app account');

  if (status === 'inactive') {
    await context.db
      .update(organizationMemberships)
      .set({ status: 'suspended', updatedAt: new Date() })
      .where(eq(organizationMemberships.userId, account.userId));
  } else if (status === 'active') {
    await context.db
      .update(organizationMemberships)
      .set({ status: 'active', updatedAt: new Date() })
      .where(eq(organizationMemberships.userId, account.userId));
  }

  await updateEmployeeAppAccount(context.db, context.organizationId, account.id, {
    status,
    disabledAt: status === 'inactive' ? new Date() : null,
  });

  const auditAction =
    status === 'suspended'
      ? 'suspended'
      : status === 'blocked'
        ? 'blocked'
        : status === 'active'
          ? 'resumed'
          : 'app_access_disabled';

  await insertEmployeeAppAuditEvent(context.db, {
    organizationId: context.organizationId,
    employeeId,
    actorUserId: context.userId,
    action: auditAction,
  });

  if (status === 'blocked' || status === 'inactive') {
    await revokeSupabaseSessions(account.userId);
  }

  safeRevalidateAuthzCache(account.userId, context.organizationId);
}

export async function resetEmployeeAppPin(
  context: OrgContext,
  employeeId: string,
): Promise<{ temporaryPin: string; temporaryPinExpiresAt: Date }> {
  await assertWorkforceManage(context);
  const account = await findEmployeeAppAccountByEmployeeId(
    context.db,
    context.organizationId,
    employeeId,
  );
  if (!account) throw new NotFoundError('Employee app account');

  const temporaryPin = generateTemporaryPin();
  const temporaryPinExpiresAt = pinExpiryFromNow();
  await setSupabasePassword(account.userId, temporaryPin);
  await revokeSupabaseSessions(account.userId);

  await updateEmployeeAppAccount(context.db, context.organizationId, account.id, {
    pinMustChange: true,
    temporaryPinExpiresAt,
    temporaryPinSealed: sealTemporaryPin(temporaryPin),
    failedLoginCount: 0,
    lockedUntil: null,
    status: account.status === 'inactive' ? 'invited' : account.status,
  });

  await insertEmployeeAppAuditEvent(context.db, {
    organizationId: context.organizationId,
    employeeId,
    actorUserId: context.userId,
    action: 'pin_reset',
  });

  return { temporaryPin, temporaryPinExpiresAt };
}

export async function revokeEmployeeAppSessions(
  context: OrgContext,
  employeeId: string,
): Promise<void> {
  await assertWorkforceManage(context);
  const account = await findEmployeeAppAccountByEmployeeId(
    context.db,
    context.organizationId,
    employeeId,
  );
  if (!account) throw new NotFoundError('Employee app account');
  await revokeSupabaseSessions(account.userId);
  await insertEmployeeAppAuditEvent(context.db, {
    organizationId: context.organizationId,
    employeeId,
    actorUserId: context.userId,
    action: 'sessions_revoked',
  });
}

export async function saveEmployeeAppGrants(
  context: OrgContext,
  input: {
    employeeId: string;
    grants: ReadonlyArray<{
      permissionKey: PermissionKey;
      scope: PermissionScope;
      granted: boolean;
    }>;
    documentCategories: ReadonlyMap<DocumentCategory, boolean>;
  },
): Promise<void> {
  await assertWorkforceManage(context);
  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee) throw new NotFoundError('Employee');

  await deleteEmployeePermissionGrants(context.db, context.organizationId, input.employeeId);
  for (const grant of input.grants) {
    if (!grant.granted) continue;
    await upsertEmployeePermissionGrant(context.db, {
      organizationId: context.organizationId,
      employeeId: input.employeeId,
      permissionKey: grant.permissionKey,
      scope: grant.scope,
      granted: true,
      grantedByUserId: context.userId,
    });
  }
  await replaceEmployeeDocumentCategoryGrants(
    context.db,
    context.organizationId,
    input.employeeId,
    input.documentCategories,
    context.userId,
  );

  if (employee.userId) {
    safeRevalidateAuthzCache(employee.userId, context.organizationId);
  }

  await insertEmployeeAppAuditEvent(context.db, {
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    actorUserId: context.userId,
    action: 'permission_changed',
  });
}

export async function getEmployeeAppAdminView(context: OrgContext, employeeId: string) {
  await assertWorkforceManage(context);
  const row = await findEmployeeAppAccountSealedPinByEmployeeId(
    context.db,
    context.organizationId,
    employeeId,
  );
  const account = row?.account ?? null;
  const { listEmployeePermissionGrants, listEmployeeDocumentCategoryGrants } = await import(
    '../data/grants.repository'
  );
  const { listRecentEmployeeAppAuditEvents } = await import('../data/audit.repository');

  const grants = account
    ? await listEmployeePermissionGrants(context.db, context.organizationId, employeeId)
    : [];
  const categories = account
    ? await listEmployeeDocumentCategoryGrants(context.db, context.organizationId, employeeId)
    : new Map();
  const audit = account
    ? await listRecentEmployeeAppAuditEvents(context.db, context.organizationId, employeeId)
    : [];

  const shareableCredentials =
    account && row
      ? await resolveShareableCredentials(
          context.db,
          context.organizationId,
          account,
          row.temporaryPinSealed,
        )
      : null;

  return { account, grants, categories, audit, shareableCredentials };
}
