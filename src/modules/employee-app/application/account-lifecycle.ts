import 'server-only';

import { eq } from 'drizzle-orm';
import { organizationMemberships } from '@drizzle/schema';
import { revalidateTag } from 'next/cache';
import type { OrgContext } from '@/shared/auth/context';
import { orgAuthzCacheTag } from '@/shared/auth/cached-authz';
import { AuthorizationError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { findEscalatingPermissions } from '@/modules/rbac/domain/permission-subset';
import {
  listProjectAccessGrants,
  replaceProjectAccessGrantsForUser,
} from '@/modules/projects/data/project-access.repository';
import { listAssignableProjects } from '@/modules/workforce/application/project-team';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/shared/supabase/admin';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { findActiveMembership, insertMembership } from '@/modules/tenancy';
import { ensureRoleAssigned, findRoleByKey, loadEffectivePermissions } from '@/modules/rbac';
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
import { insertEmployeeAppAuditEventTrusted } from '../data/audit.repository';
import { buildEmployeeAuthEmail } from '../domain/username';
import { allocateGloballyUniqueUsername } from './allocate-username';
import { employeeSupabaseAuthPassword } from '../domain/auth-password';
import { withEmployeeAppAuditMeta, type EmployeeAppAuditMeta } from '../domain/audit-meta';
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

async function ensureEmployeeMembershipAndRole(context: OrgContext, userId: string): Promise<void> {
  let membership = await findActiveMembership(context.db, context.organizationId, userId);
  if (!membership) {
    membership = await insertMembership(context.db, {
      organizationId: context.organizationId,
      userId,
      status: 'active',
    });
  }

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

/** Owner/manager linked employees need a dedicated portal auth user so owner login is not overwritten. */
async function userNeedsDedicatedEmployeePortalAuth(
  context: OrgContext,
  userId: string,
): Promise<boolean> {
  const { roleKeys } = await loadEffectivePermissions(
    context.db,
    context.organizationId,
    userId,
  );
  return roleKeys.some((key) => key !== 'employee');
}

async function syncSupabaseEmployeePortalIdentity(
  userId: string,
  authEmail: string,
  temporaryPin: string,
): Promise<void> {
  if (!isSupabaseAdminConfigured()) {
    throw new DomainRuleError('Supabase admin is not configured', 'employeeApp.errors.notConfigured');
  }
  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email: authEmail,
    email_confirm: true,
    password: employeeSupabaseAuthPassword(temporaryPin),
    user_metadata: { employee_app: true },
  });
  if (error) {
    throw new DomainRuleError(
      error.message ?? 'Failed to sync employee portal auth',
      'employeeApp.errors.provisionFailed',
    );
  }
}

export interface EmployeeAppLifecycleOptions {
  readonly auditMeta?: EmployeeAppAuditMeta;
}

export async function activateEmployeeAppAccess(
  context: OrgContext,
  input: {
    employeeId: string;
    username?: string;
    presetKey?: EmployeePresetKey;
  },
  options?: EmployeeAppLifecycleOptions,
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

  const authEmail = buildEmployeeAuthEmail(context.organizationId, usernameCheck.normalized);
  let accountUserId = employee.userId;

  if (!accountUserId) {
    accountUserId = await provisionSupabaseUser(authEmail, temporaryPin);
    await ensureProfile(context.db, {
      id: accountUserId,
      email: authEmail,
      displayName: employee.name,
      localePreference: context.locale,
    });
    await ensureEmployeeMembershipAndRole(context, accountUserId);
    await updateEmployeeById(context.db, context.organizationId, employee.id, { userId: accountUserId });
  } else if (await userNeedsDedicatedEmployeePortalAuth(context, accountUserId)) {
    accountUserId = await provisionSupabaseUser(authEmail, temporaryPin);
    await ensureProfile(context.db, {
      id: accountUserId,
      email: authEmail,
      displayName: employee.name,
      localePreference: context.locale,
    });
    await ensureEmployeeMembershipAndRole(context, accountUserId);
  } else {
    await syncSupabaseEmployeePortalIdentity(accountUserId, authEmail, temporaryPin);
    await ensureEmployeeMembershipAndRole(context, accountUserId);
  }

  const account =
    existing ??
    (await insertEmployeeAppAccount(context.db, {
      organizationId: context.organizationId,
      employeeId: employee.id,
      userId: accountUserId,
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
    userId: accountUserId,
    authEmail,
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

  await insertEmployeeAppAuditEventTrusted({
    organizationId: context.organizationId,
    employeeId: employee.id,
    actorUserId: context.userId,
    action: 'activated',
    detailJson: withEmployeeAppAuditMeta(
      { username: usernameRaw.toUpperCase(), preset: preset.key },
      options?.auditMeta,
    ),
  });

  safeRevalidateAuthzCache(accountUserId, context.organizationId);
  if (employee.userId && employee.userId !== accountUserId) {
    safeRevalidateAuthzCache(employee.userId, context.organizationId);
  }

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

  await insertEmployeeAppAuditEventTrusted({
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
  options?: EmployeeAppLifecycleOptions,
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

  await insertEmployeeAppAuditEventTrusted({
    organizationId: context.organizationId,
    employeeId,
    actorUserId: context.userId,
    action: 'pin_reset',
    detailJson: withEmployeeAppAuditMeta(null, options?.auditMeta),
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
  await insertEmployeeAppAuditEventTrusted({
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
    projectIds?: readonly string[];
  },
): Promise<void> {
  await assertWorkforceManage(context);
  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee) throw new NotFoundError('Employee');

  const grantedKeys = input.grants.filter((grant) => grant.granted).map((grant) => grant.permissionKey);
  const escalating = findEscalatingPermissions(context.permissions, grantedKeys);
  if (escalating.length > 0) {
    throw new AuthorizationError('Cannot grant employee permissions you do not hold');
  }

  const account = await findEmployeeAppAccountByEmployeeId(
    context.db,
    context.organizationId,
    input.employeeId,
  );

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

  if (input.projectIds !== undefined && account) {
    const allowedProjectIds = new Set(
      (await listAssignableProjects(context)).map((project) => project.id),
    );
    const projectIds = input.projectIds.filter((projectId) => allowedProjectIds.has(projectId));
    await replaceProjectAccessGrantsForUser(context.db, {
      organizationId: context.organizationId,
      userId: account.userId,
      projectIds,
      grantedByUserId: context.userId,
    });
  }

  const authUserIds = new Set<string>();
  if (account?.userId) authUserIds.add(account.userId);
  if (employee.userId) authUserIds.add(employee.userId);
  for (const userId of authUserIds) {
    safeRevalidateAuthzCache(userId, context.organizationId);
  }

  await insertEmployeeAppAuditEventTrusted({
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

  const [assignableProjects, projectAccessRows] = await Promise.all([
    listAssignableProjects(context).catch(() => [] as { id: string; name: string }[]),
    listProjectAccessGrants(context.db, context.organizationId),
  ]);
  const grantedProjectIds = account
    ? projectAccessRows
        .filter((grant) => grant.userId === account.userId)
        .map((grant) => grant.projectId)
    : [];

  return {
    account,
    grants,
    categories,
    audit,
    shareableCredentials,
    assignableProjects,
    grantedProjectIds,
  };
}
